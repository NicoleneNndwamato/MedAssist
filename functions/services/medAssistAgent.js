const fetch = require("node-fetch");
const {
  normalizePriority,
  tierOf,
  parsePreferred,
  resolveCity,
  nowForPrompt
} = require("./booking");

// ---------------------------------------------------------------------------
// What must be known before the call can end (and an appointment be booked).
// This is decided IN CODE - the model may suggest done:true, but is only
// believed when these fields are really filled in.
// ---------------------------------------------------------------------------

const BASE_FIELDS = [
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

// In an emergency we only insist on what is needed to get help moving fast.
const EMERGENCY_FIELDS = ["name", "location", "symptoms", "emergencyContactNumber"];

const FIELD_QUESTIONS = {
  name: "What is your name?",
  surname: "And what is your surname?",
  age: "How old are you?",
  provider: "Which cellphone network are you using? For example Vodacom, MTN, Cell C, or Telkom.",
  location: "Where are you right now? Please tell me your address or the name of the area.",
  symptoms: "What symptoms are you experiencing?",
  symptomDuration: "How long have you been feeling this way?",
  lastVisit: "When was the last time you visited a hospital or clinic?",
  medicalHistory: "Have you had any illnesses, other conditions, or surgery in the past?",
  emergencyContactNumber: "Please give me a phone number for someone we can contact in an emergency.",
  priority: "Can you tell me a little more about how you are feeling right now?",
  preferredDateTime: "When would you be available for an appointment? Please tell me the day and the time that suits you."
};

function questionFor(field, cities) {
  if (field === "nearestCity") {
    return cities && cities.length
      ? `Which of these areas is closest to you: ${cities.join(", ")}?`
      : "Which town or city are you closest to?";
  }
  return FIELD_QUESTIONS[field] || "Could you tell me a little more, please?";
}

// Safety valve: if the conversation drags on this long, stop insisting on
// every field and let the model end the call when it says it is done.
const MAX_PATIENT_TURNS = 30;

function hasValue(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "null" && s !== "undefined" && s !== "unknown" && s !== "n/a";
}

function missingFields(summary, needsAmbulanceFlag, { cities = [], now = new Date() } = {}) {
  const priority = normalizePriority(summary.priority);
  const tier = tierOf(priority, needsAmbulanceFlag);
  const missing = [];

  if (!priority && !needsAmbulanceFlag) missing.push("priority");

  if (tier === "EMERGENCY") {
    EMERGENCY_FIELDS.forEach((f) => {
      if (!hasValue(summary[f])) missing.push(f);
    });
    return missing;
  }

  BASE_FIELDS.forEach((f) => {
    if (!hasValue(summary[f])) missing.push(f);
  });

  // Which hospital is "near" them: needs a city we have a facility in.
  if (cities.length && !resolveCity(summary, cities)) missing.push("nearestCity");

  // Routine cases pick their own appointment time, which must be in the future.
  if (tier === "ROUTINE") {
    const wanted = parsePreferred(summary.preferredDateTime);
    if (!wanted || wanted <= now) missing.push("preferredDateTime");
  }
  return missing;
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
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(topics, knownProfile, { cities = [], now = new Date() } = {}) {
  const topicList = topics.map((t) => `- ${t}`).join("\n");
  const cityList = cities.length ? cities.join(", ") : "(none on file)";

  return `You are MedAssist, a warm, calm healthcare intake assistant used by a hospital/clinic to gather information from a patient and arrange an appointment. You are NOT a doctor and must NEVER diagnose a condition, name a suspected illness, or suggest a treatment.

The current date and time is: ${nowForPrompt(now)}.

Have a natural, caring conversation - do not read out a rigid list of questions or ask more than one thing per turn. Over the course of the conversation, gather:
${topicList}

Rules:
- Ask about one topic at a time, in whatever order feels natural given what the patient has already said. Skip anything already given in "Known so far" below.
- If an answer is incomplete or vague (for example, they name a symptom but not how long they've had it), gently ask a follow-up before moving on. Do not accept vague answers as final.
- Never diagnose, name a suspected illness, or suggest a treatment.
- Keep each reply short - 1 to 3 sentences - since on the phone it will be read aloud.
- NEVER say goodbye, thank the patient for their time, or wrap up unless "done" is true.

URGENCY ("priority"). As soon as you know the symptoms, set "priority" to exactly one of:
  IMMEDIATE    - life-threatening: cannot breathe, chest pain, unconscious, heavy bleeding, severe injury, stroke signs, seizure
  VERY_URGENT  - severe or rapidly worsening: severe pain, high fever with confusion, repeated vomiting and cannot keep fluids down
  URGENT       - needs to be seen soon, within a day
  STANDARD     - needs a normal appointment
  NON_URGENT   - minor or routine (rash, mild cough, check-up, repeat prescription)
Never tell the patient their priority label. Update it if new information changes it.

APPOINTMENTS. The system books the appointment automatically once the conversation is done, choosing the hospital and doctor itself. So:
- NEVER promise or state a specific hospital, doctor or appointment time yourself.
- If priority is IMMEDIATE or VERY_URGENT: do NOT ask when they are available. Calmly tell them help is being arranged, set "needsAmbulanceFlag" to true, quickly get their name, location and an emergency contact phone number, then set "done" to true.
- If priority is URGENT: do not ask about availability; just finish the normal questions.
- If priority is STANDARD or NON_URGENT: after the other questions, ask what day and time suit them. Turn their answer into "preferredDateTime" in the format YYYY-MM-DDTHH:mm (24-hour, South Africa time), using the current date and time above to work out words like "tomorrow" or "next Monday". Appointments run 08:00 to 17:00 on weekdays. If they are vague ("sometime next week"), ask for a specific day and time. "Morning" can be 09:00 and "afternoon" 14:00. It must be in the future.
- "nearestCity": choose the one of these that is closest to where the patient says they are: ${cityList}. If you cannot tell, leave it null and ask which of those areas is closest to them.

Reply with JSON ONLY, no other text before or after it, in exactly this shape:
{
  "reply": "what to say to the patient next",
  "done": boolean,
  "needsAmbulanceFlag": boolean,
  "summary": {
    "name": string or null, "surname": string or null, "age": string or null, "provider": string or null,
    "location": string or null, "nearestCity": string or null,
    "symptoms": string or null, "symptomDuration": string or null,
    "lastVisit": string or null, "medicalHistory": string or null, "medications": string or null,
    "priority": "IMMEDIATE" | "VERY_URGENT" | "URGENT" | "STANDARD" | "NON_URGENT" | null,
    "preferredDateTime": string or null,
    "needsAmbulance": string or null, "emergencyContactNumber": string or null
  }
}
"summary" is your best current understanding of every field so far - fill in what you know, leave the rest null, and update it every turn.

"done" MUST be false until the needed information is filled in:
- Normal cases: name, surname, age, provider, location, nearestCity, symptoms, symptomDuration, lastVisit, medicalHistory, priority - and, for STANDARD or NON_URGENT, also preferredDateTime.
- Emergencies (IMMEDIATE or VERY_URGENT): name, location, symptoms, emergencyContactNumber and priority are enough.
Never set "done" to true after only one or two answers.
When done is true, "reply" should be a short, kind closing message that does NOT mention any appointment time or hospital (the system adds the booking details).

Known so far for this patient: ${JSON.stringify(knownProfile || {})}`;
}

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

const GROQ_MODEL = "openai/gpt-oss-120b";

// Retry transient failures so a momentary blip doesn't end the patient's call.
async function fetchWithRetry(url, options, { attempts = 3, delaysMs = [600, 1800] } = {}) {
  let lastErrText = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(url, options);
    } catch (networkErr) {
      lastErrText = networkErr.message;
      if (attempt < attempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt] || 1800));
        continue;
      }
      throw new Error(`Groq network error: ${lastErrText}`);
    }

    if (response.ok) return response;

    // eslint-disable-next-line no-await-in-loop
    lastErrText = await response.text();
    const retryable = [429, 500, 502, 503, 504].includes(response.status);
    if (retryable && attempt < attempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt] || 1800));
      continue;
    }
    throw new Error(`Groq API error (${response.status}): ${lastErrText}`);
  }
  throw new Error(`Groq API error after retries: ${lastErrText}`);
}

// Tolerates ```json fences and stray text around the object.
function parseModelJson(rawText) {
  if (!rawText) return null;
  const attempts = [rawText, rawText.replace(/```json|```/gi, "").trim()];
  for (const text of attempts) {
    try {
      return JSON.parse(text);
    } catch (_) {
      // try the next form
    }
  }
  const stripped = attempts[1];
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(stripped.slice(start, end + 1));
    } catch (_) {
      // give up
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// One turn of the conversation.
// - `history`: running transcript, [{ role: "user"|"assistant", content }], no
//   system message (rebuilt every call so "Known so far" stays fresh).
// - `patientMessage`: latest patient message, ALWAYS in English.
// - `knownProfile`: what we already have for this phone number/session.
// - `cities`: the cities we have hospitals in (so "nearest hospital" works).
// Returns { reply, done, needsAmbulanceFlag, summary, history }.
// ---------------------------------------------------------------------------

async function converse({ history, patientMessage, knownProfile, topics, apiKey, cities = [], now = new Date() }) {
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing - check functions/.env");
  }

  const safeHistory = history || [];
  const previous = knownProfile || {};

  const messages = [
    { role: "system", content: buildSystemPrompt(topics, previous, { cities, now }) },
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

  // Unusable output: keep the call alive, and do NOT store the broken text.
  if (!parsed) {
    console.warn("converse: model returned unparseable output:", rawText);
    const fallbackReply = "Sorry, could you say that again?";
    return {
      reply: fallbackReply,
      done: false,
      needsAmbulanceFlag: false,
      summary: previous,
      history: [
        ...safeHistory,
        { role: "user", content: patientMessage },
        {
          role: "assistant",
          content: JSON.stringify({ reply: fallbackReply, done: false, needsAmbulanceFlag: false, summary: previous })
        }
      ]
    };
  }

  const summary = mergeSummary(previous, parsed.summary);
  summary.priority = normalizePriority(summary.priority); // invalid values become null
  const needsAmbulanceFlag = !!parsed.needsAmbulanceFlag || tierOf(summary.priority, false) === "EMERGENCY";

  const patientTurns = safeHistory.filter((m) => m.role === "user").length + 1;
  const missing = missingFields(summary, needsAmbulanceFlag, { cities, now });
  const modelSaysDone = !!parsed.done;
  const turnCapReached = patientTurns >= MAX_PATIENT_TURNS;

  console.log(
    "converse:",
    JSON.stringify({
      patientTurns,
      modelSaysDone,
      priority: summary.priority,
      needsAmbulanceFlag,
      preferredDateTime: summary.preferredDateTime || null,
      nearestCity: summary.nearestCity || null,
      missing
    })
  );

  // The model only gets to end the call if the required data is really there.
  const done = modelSaysDone && (missing.length === 0 || turnCapReached);

  let reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Sorry, could you say that again?";

  // The model tried to finish too early, so its reply is a goodbye. Replace it
  // with a question for the first missing field.
  if (modelSaysDone && !done) {
    console.warn(`converse: model said done too early, still missing: ${missing.join(", ")}`);
    reply = questionFor(missing[0], cities);
  }

  // Store the corrected turn so the model doesn't see its own premature goodbye.
  const storedAssistant = JSON.stringify({ reply, done, needsAmbulanceFlag, summary });

  return {
    reply,
    done,
    needsAmbulanceFlag,
    summary,
    history: [
      ...safeHistory,
      { role: "user", content: patientMessage },
      { role: "assistant", content: storedAssistant }
    ]
  };
}

module.exports = { converse, missingFields };