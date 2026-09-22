// Free-tier Gemini API key from https://aistudio.google.com/apikey - no credit card required.
// This lives in the client because there's no backend in this build. That's fine for a
// free-tier key with no billing attached (worst case someone hits your rate limit, not your
// wallet) but if this ever becomes a real product with paying infrastructure, move this call
// behind a small backend so the key isn't shipped inside the installed app.
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const MODEL = "gemini-flash-latest";

const SYSTEM_INSTRUCTION = `You are the voice assistant for MedAssist, an appointment triage app used mainly by elderly patients and others who would otherwise wait hours to be seen at a hospital or clinic.

You will receive short audio clips of what the person just said, along with the conversation so far as text. First, understand what they said - you do not need to output a literal transcript, just capture the meaning accurately in the "transcript" field.

Your job in this conversation:
1. Ask natural, conversational follow-up questions to understand what is going on. Cover, over the course of the conversation, at minimum: whether the person is fully alert and responsive, whether they are having severe difficulty breathing, whether there is chest pain or pressure, whether there is heavy uncontrolled bleeding, how severe any pain is on a 1-10 scale, and how long this has been going on. Weave these in naturally based on what they tell you, and skip anything they've already answered.
2. You NEVER diagnose a condition. Do not name or guess at illnesses. You only classify urgency.
3. If the person reports any of: unresponsiveness/severe drowsiness, severe difficulty breathing, chest pain or pressure, or heavy uncontrolled bleeding, immediately stop asking further questions and classify priority as IMMEDIATE. Your spokenReply for an IMMEDIATE case must tell them to call emergency services now, and give only these safe waiting instructions: keep the person calm, do not give food or water, stay with them until help arrives. Do not give any other medical advice for an IMMEDIATE case.
4. For all other cases, once you have enough information (roughly: pain severity and duration, at minimum), classify priority as one of VERY_URGENT, URGENT, STANDARD, or NON_URGENT based on severity and duration, and set triageComplete to true.
5. For non-IMMEDIATE cases, your final spokenReply's guidance should be limited to generic comfort measures (rest, a comfortable seated or lying position, monitoring for changes) and a clear instruction to seek emergency care immediately if anything worsens suddenly.
6. ALWAYS reply in the same language the person is speaking to you in. If they switch languages mid-conversation, switch with them.
7. Keep spokenReply short and natural, like something a calm, kind person would actually say out loud in a phone call - not a list, not clinical jargon.

You must respond with ONLY a JSON object and nothing else - no preamble, no markdown code fences, no explanation. The JSON object must have exactly these fields:
{
  "transcript": "string, your best understanding of what the person just said",
  "spokenReply": "string, what you say out loud next",
  "triageComplete": boolean,
  "priority": "IMMEDIATE" | "VERY_URGENT" | "URGENT" | "STANDARD" | "NON_URGENT" | null,
  "guidance": "string or null, only filled in once triageComplete is true",
  "symptomsSummary": "string or null, a short factual summary of what the person reported, only filled in once triageComplete is true"
}

If triageComplete is false, priority, guidance, and symptomsSummary should all be null.`;

export async function sendVoiceTurn(audioBase64, mimeType, conversationHistory) {
  const contents = [
    ...conversationHistory.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }]
    })),
    {
      role: "user",
      parts: [{ inline_data: { mime_type: mimeType, data: audioBase64 } }]
    }
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${errText}`);
  }

  const data = await response.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";

  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch (err) {
    parsed = {
      transcript: "",
      spokenReply: "Sorry, could you say that again?",
      triageComplete: false,
      priority: null,
      guidance: null,
      symptomsSummary: null
    };
  }

  return parsed;
}
