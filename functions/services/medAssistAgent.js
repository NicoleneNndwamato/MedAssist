const fetch = require("node-fetch");

// ---------------------------------------------------------------------------
// Completion rules - decided in CODE, not by the model.
//
// The model used to be trusted when it said "done": true, which let it end
// the call after a single answer. Now "done" is only honoured when the
// fields below are actually filled in.
// ---------------------------------------------------------------------------

// Everything a normal (non-emergency) intake must have before the call ends.
const REQUIRED_FIELDS = [
  "name",
  "surname",
  "age",
  "provider",
  "location",
  "symptoms",
  "symptomDuration",
  "lastVisit",
  "medicalHistory"
];

// In a genuine emergency we only insist on what staff need to act quickly.
const EMERGENCY_REQUIRED_FIELDS = ["location", "emergencyContactNumber"];

// Used when we override a premature "done" and need to ask for what's missing.
const FIELD_QUESTIONS = {
  name: "What is your name?",
  surname: "And what is your surname?",
  age: "How old are you?",
  provider: "Which cellphone network are you using, for example Vodacom, MTN, Cell C, or Telkom?",
  location: "Where are you right now? Please tell me your address or the name of the area.",
  symptoms: "What symptoms are you experiencing?",
  symptomDuration: "How long have you been feeling this way?",
  lastVisit: "When was the last time you visited a hospital or clinic?",
  medicalHistory: "Have you had any illnesses, other conditions, or surgery in the past?",
  emergencyContactNumber: "Please give me a phone number for someone we can contact in an emergency."
};

// Safety valve: if the conversation drags on this long, stop insisting on
// every field and let the model end the call when it says it is done.
const MAX_PATIENT_TURNS = 30;

function hasValue(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "null" && s !== "undefined" && s !== "unknown" && s !== "n/a";
}

function missingFields(summary, needsAmbulanceFlag) {
  const fields = needsAmbulanceFlag ? EMERGENCY_REQUIRED_FIELDS : REQUIRED_FIELDS;
  return fields.filter((f) => !hasValue(summary[f]));
}

function isIntakeComplete(summary, needsAmbulanceFlag) {
  return missingFields(summary, needsAmbulanceFlag).length === 0;
}

// Keeps everything we already knew and only overwrites with real new values,
// so a model that returns null for a field it "forgot" can never erase data.
function mergeSummary(known, fromModel) {
  const merged = { ...(known || {}) };
  Object.entries(fromModel || {}).forEach(([key, value]) => {
    if (hasValue(value)) merged[key] = value;
    else if (!(key in merged)) merged[key] = null;
  });
  // Firestore rejects undefined - turn any into null.
  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined) merged[key] = null;
  });
  return merged;
}

// ---------------------------------------------------------------------------
// MedAssist's persona and rules - the one place this is defined, shared by
// both the phone call flow (functions/index.js) and the website chat.
// ---------------------------------------------------------------------------
function buildSystemPrompt(topics, knownProfile) {
  const topicList = topics.map((t) => `- ${t}`).join("\n");
  return `You are MedAssist, a warm, calm healthcare intake assistant used by a hospital/clinic to gather information from a patient before they are seen by staff. You are NOT a doctor and must NEVER diagnose a condition, name a suspected illness, or suggest a treatment.

Have a natural, caring conversation - do not read out a rigid list of questions or ask more than one thing per turn. Over the course of the conversation, gather ALL of:
${topicList}

Rules:
- Ask about one topic at a time, in whatever order feels natural given what the patient has already said. Skip anything already given in "Known so far" below.
- A single answer from the patient is NEVER enough to finish. After the patient gives their name, you must continue and ask for the next missing item (surname, age, network provider, location, symptoms, how long, last hospital visit, medical history).
- If an answer is incomplete or vague (for example, they name a symptom but not how long they've had it, or say "a while" instead of a real duration), gently ask a follow-up before moving on. Do not accept vague answers as final - this matters for the person reviewing this later.
- Never diagnose, name a suspected illness, or suggest a treatment.
- If the patient describes something urgent (cannot breathe, chest pain, unconscious, heavy bleeding, severe injury), calmly tell them to seek emergency help immediately, quickly get their location and an emergency contact if you don't have them yet, then end the conversation.
- Keep each reply short - 1 to 3 sentences - since on the phone it will be read aloud.
- Do not say goodbye, thank them for their time, or wrap up unless "done" is true.
- Reply with JSON ONLY, no other text before or after it, in exactly this shape:
{
  "reply": "what to say to the patient next",
  "done": boolean,
  "needsAmbulanceFlag": boolean,
  "summary": {
    "name": string or null, "surname": string or null, "age": string or null, "provider": string or null,
    "location": string or null, "symptoms": string or null, "symptomDuration": string or null,
    "lastVisit": string or null, "medicalHistory": string or null, "medications": string or null,
    "needsAmbulance": string or null, "emergencyContactNumber": string or null
  }
}
"summary" is your best current understanding of every field so far - fill in what you know, leave the rest null, and update it every turn, not just at the end.
"done" must be false until name, surname, age, provider, location, symptoms, symptomDuration, lastVisit and medicalHistory are ALL filled in. The only exception is a genuine emergency, where you may set "done" to true once you have the patient's location and an emergency contact number. Never set "done" to true after only one or two answers. When "done" is true, "reply" should be a short, kind closing message; when "done" is false, "reply" must be a question or a follow-up, never a goodbye.

Known so far for this patient: ${JSON.stringify(knownProfile || {})}`;
}

// Groq's free tier (console.groq.com) - OpenAI-compatible API format, so
// "history"/messages here are the standard { role: "system"|"user"|
// "assistant", content: string } shape.
const GROQ_MODEL = "openai/gpt-oss-120b";

// Groq's free tier is generous but not infinite - retry transient 429
// (rate limited) or 503 (overloaded) responses a couple of times before
// giving up, so a momentary blip doesn't end the patient's call/chat.
async function fetchWithRetry(url, options, { attempts = 3, delaysMs = [600, 1800] } = {}) {
  let lastErrText = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(url, options);
    if (response.ok) return response;

    // eslint-disable-next-line no-await-in-loop
    lastErrText = await response.text();
    const retryable = response.status === 503 || response.status === 429;
    if (retryable && attempt < attempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt] || 1800));
      continue;
    }
    throw new Error(`Groq API error (${response.status}): ${lastErrText}`);
  }
  throw new Error(`Groq API error after retries: ${lastErrText}`);
}

// Models sometimes wrap JSON in ```json fences or add a stray sentence.
// Try a straight parse first, then fall back to the outermost {...} block.
function parseModelJson(rawText) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch (err) {
    // fall through
  }
  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // fall through
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      return null;
    }
  }
  return null;
}

// One turn of the conversation.
// - `history` is the running chat transcript so far, OpenAI-message-shaped:
//   [{ role: "user"|"assistant", content: string }] - no system message in
//   here, that's added fresh each call so it can include the latest
//   "Known so far" profile snapshot.
// - `patientMessage` is the patient's latest message, ALWAYS in English
//   (translated upstream if they spoke/typed another language).
// - `knownProfile` is whatever we already have on file for this phone
//   number/session, so the agent doesn't re-ask for it.
// Returns { reply, done, needsAmbulanceFlag, summary, history } where
// `history` is ready to pass back in as `history` on the next turn.
async function converse({ history, patientMessage, knownProfile, topics, apiKey }) {
  const safeHistory = history || [];
  const messages = [
    { role: "system", content: buildSystemPrompt(topics, knownProfile) },
    ...safeHistory,
    { role: "user", content: patientMessage }
  ];

  const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.4,
      // gpt-oss is a reasoning model; "low" cuts several seconds of thinking per
      // turn, which matters because the phone platform drops slow webhooks.
      reasoning_effort: "low"
    })
  });

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";
  const parsed = parseModelJson(rawText);

  // Model didn't return usable JSON this turn - fail soft with a natural
  // "say that again" rather than crashing the whole conversation, and do
  // NOT store the broken output in history.
  if (!parsed) {
    console.warn("converse: model returned unparseable output:", rawText);
    const fallbackReply = "Sorry, could you say that again?";
    return {
      reply: fallbackReply,
      done: false,
      needsAmbulanceFlag: false,
      summary: knownProfile || {},
      history: [
        ...safeHistory,
        { role: "user", content: patientMessage },
        {
          role: "assistant",
          content: JSON.stringify({
            reply: fallbackReply,
            done: false,
            needsAmbulanceFlag: false,
            summary: knownProfile || {}
          })
        }
      ]
    };
  }

  // Never let a null from the model erase something we already knew.
  const summary = mergeSummary(knownProfile, parsed.summary);
  const needsAmbulanceFlag = !!parsed.needsAmbulanceFlag;

  const patientTurns = safeHistory.filter((m) => m.role === "user").length + 1;
  const missing = missingFields(summary, needsAmbulanceFlag);
  const modelSaysDone = !!parsed.done;
  const turnCapReached = patientTurns >= MAX_PATIENT_TURNS;

  console.log(
    "converse:",
    JSON.stringify({
      patientTurns,
      modelSaysDone,
      needsAmbulanceFlag,
      missing,
      filled: Object.keys(summary).filter((k) => hasValue(summary[k]))
    })
  );

  // The model only gets to end the call if the required data is really there
  // (or the conversation has run absurdly long).
  const done = modelSaysDone && (missing.length === 0 || turnCapReached);

  let reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Sorry, could you say that again?";

  // The model tried to finish too early, so its reply is a goodbye. Replace
  // it with a question for the first missing field so the caller isn't told
  // goodbye and then asked something else.
  if (modelSaysDone && !done) {
    console.warn(`converse: model said done too early, still missing: ${missing.join(", ")}`);
    reply = FIELD_QUESTIONS[missing[0]] || "Could you tell me a little more, please?";
  }

  // Store what the model's turn effectively was (corrected), so the next
  // turn doesn't see its own premature goodbye and repeat the mistake.
  const storedAssistant = JSON.stringify({ reply, done, needsAmbulanceFlag, summary });

  const updatedHistory = [
    ...safeHistory,
    { role: "user", content: patientMessage },
    { role: "assistant", content: storedAssistant }
  ];

  return {
    reply,
    done,
    needsAmbulanceFlag,
    summary,
    history: updatedHistory
  };
}

module.exports = { converse, isIntakeComplete, missingFields };
