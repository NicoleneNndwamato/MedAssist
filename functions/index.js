const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const speech = require("@google-cloud/speech");
const fetch = require("node-fetch");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const speechClient = new speech.SpeechClient();

const SYSTEM_PROMPT = `You are the voice assistant for MedAssist, an appointment triage app used mainly by elderly patients and others who would otherwise wait hours to be seen at a hospital or clinic.

Your job in this conversation:
1. Ask natural, conversational follow-up questions to understand what is going on. Cover, over the course of the conversation, at minimum: whether the person is fully alert and responsive, whether they are having severe difficulty breathing, whether there is chest pain or pressure, whether there is heavy uncontrolled bleeding, how severe any pain is on a 1-10 scale, and how long this has been going on. You do not need to ask these as a rigid checklist - weave them naturally into the conversation based on what the person tells you, and skip a question if they've already answered it in an earlier message.
2. You NEVER diagnose a condition. Do not name or guess at illnesses. You only classify urgency.
3. If the person reports any of: unresponsiveness/severe drowsiness, severe difficulty breathing, chest pain or pressure, or heavy uncontrolled bleeding, immediately stop asking further questions and classify priority as IMMEDIATE. Your spokenReply for an IMMEDIATE case must tell them to call emergency services now, and give only these safe waiting instructions: keep the person calm, do not give food or water, stay with them until help arrives. Do not give any other medical advice for an IMMEDIATE case.
4. For all other cases, once you have enough information (roughly: pain severity and duration, at minimum), classify priority as one of VERY_URGENT, URGENT, STANDARD, or NON_URGENT based on severity and duration, and set triageComplete to true.
5. For non-IMMEDIATE cases, your final spokenReply's guidance should be limited to generic comfort measures (rest, a comfortable seated or lying position, monitoring for changes) and a clear instruction to seek emergency care immediately if anything worsens suddenly.
6. ALWAYS reply in the same language the person is speaking to you in. If they switch languages mid-conversation, switch with them.
7. Keep spokenReply short and natural, like something a calm, kind person would actually say out loud in a phone call - not a list, not clinical jargon.

You must respond with ONLY a JSON object and nothing else - no preamble, no markdown code fences, no explanation. The JSON object must have exactly these fields:
{
  "spokenReply": "string, what you say out loud next",
  "triageComplete": boolean,
  "priority": "IMMEDIATE" | "VERY_URGENT" | "URGENT" | "STANDARD" | "NON_URGENT" | null,
  "guidance": "string or null, only filled in once triageComplete is true",
  "symptomsSummary": "string or null, a short factual summary of what the person reported, only filled in once triageComplete is true"
}

If triageComplete is false, priority, guidance, and symptomsSummary should all be null.`;

const LANGUAGE_CODES = ["en-ZA", "af-ZA", "zu-ZA", "xh-ZA", "st-ZA"];

exports.voiceTurn = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  const { audioBase64, conversationHistory } = request.data || {};

  if (!audioBase64) {
    throw new HttpsError("invalid-argument", "audioBase64 is required");
  }

  const [sttResponse] = await speechClient.recognize({
    config: {
      encoding: "MP3",
      sampleRateHertz: 44100,
      languageCode: LANGUAGE_CODES[0],
      alternativeLanguageCodes: LANGUAGE_CODES.slice(1)
    },
    audio: { content: audioBase64 }
  });

  const transcript = (sttResponse.results || [])
    .map((r) => r.alternatives[0].transcript)
    .join(" ")
    .trim();

  const detectedLanguage =
    (sttResponse.results && sttResponse.results[0] && sttResponse.results[0].languageCode) ||
    LANGUAGE_CODES[0];

  if (!transcript) {
    return {
      transcript: "",
      languageCode: detectedLanguage,
      spokenReply: "Sorry, I didn't catch that. Could you say that again?",
      triageComplete: false,
      priority: null,
      guidance: null,
      symptomsSummary: null
    };
  }

  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const messages = [...history, { role: "user", content: transcript }];

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey.value(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages
    })
  });

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    throw new HttpsError("internal", `Anthropic API error: ${errText}`);
  }

  const data = await anthropicResponse.json();
  const rawText = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch (err) {
    parsed = {
      spokenReply: "Sorry, could you say that again?",
      triageComplete: false,
      priority: null,
      guidance: null,
      symptomsSummary: null
    };
  }

  return {
    transcript,
    languageCode: detectedLanguage,
    spokenReply: parsed.spokenReply,
    triageComplete: !!parsed.triageComplete,
    priority: parsed.priority || null,
    guidance: parsed.guidance || null,
    symptomsSummary: parsed.symptomsSummary || null
  };
});
