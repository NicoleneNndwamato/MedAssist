const fetch = require("node-fetch");

// MedAssist's persona and rules - the one place this is defined, shared by
// both the phone call flow (functions/index.js) and the website chat, so
// there's exactly one "brain" behind both surfaces, not two copies that can
// drift apart.
function buildSystemPrompt(topics, knownProfile) {
  const topicList = topics.map((t) => `- ${t}`).join("\n");
  return `You are MedAssist, a warm, calm healthcare intake assistant used by a hospital/clinic to gather information from a patient before they are seen by staff. You are NOT a doctor and must NEVER diagnose a condition, name a suspected illness, or suggest a treatment.

Have a natural, caring conversation - do not read out a rigid list of questions or ask more than one thing per turn. Over the course of the conversation, gather:
${topicList}

Rules:
- Ask about one topic at a time, in whatever order feels natural given what the patient has already said. Skip anything already given in "Known so far" below.
- If an answer is incomplete or vague (for example, they name a symptom but not how long they've had it, or say "a while" instead of a real duration), gently ask a follow-up before moving on. Do not accept vague answers as final - this matters for the person reviewing this later.
- Never diagnose, name a suspected illness, or suggest a treatment.
- If the patient describes something urgent (cannot breathe, chest pain, unconscious, heavy bleeding, severe injury), calmly tell them to seek emergency help immediately, quickly get their location and an emergency contact if you don't have them yet, then end the conversation.
- Keep each reply short - 1 to 3 sentences - since on the phone it will be read aloud.
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
"done" becomes true once you have gathered enough to end the conversation (you don't need every field if it's a genuine emergency - prioritise safety guidance, location, and an emergency contact, then end quickly). When done is true, "reply" should be a short, kind closing message.

Known so far for this patient: ${JSON.stringify(knownProfile || {})}`;
}

// Groq's free tier (console.groq.com) - OpenAI-compatible API format, so
// "history"/messages here are the standard { role: "system"|"user"|
// "assistant", content: string } shape, not Gemini's role/parts shape.
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

// One turn of the conversation.
// - `history` is the running chat transcript so far, OpenAI-message-shaped:
//   [{ role: "user"|"assistant", content: string }] - no system message in
//   here, that's added fresh each call so it can include the latest
//   "Known so far" profile snapshot.
// - `patientMessage` is the patient's latest message, ALWAYS in English
//   (translated upstream if they spoke/typed another language) - the agent
//   only ever thinks in English, translation happens outside this file.
// - `knownProfile` is whatever we already have on file for this phone
//   number/session, so the agent doesn't re-ask for it.
// Returns { reply, done, needsAmbulanceFlag, summary, history } where
// `history` is ready to pass back in as `history` on the next turn.
async function converse({ history, patientMessage, knownProfile, topics, apiKey }) {
  const messages = [
    { role: "system", content: buildSystemPrompt(topics, knownProfile) },
    ...history,
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
      temperature: 0.4
    })
  });

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    // Model didn't return valid JSON this turn - fail soft with a natural
    // "say that again" rather than crashing the whole conversation.
    parsed = { reply: "Sorry, could you say that again?", done: false, needsAmbulanceFlag: false, summary: knownProfile || {} };
  }

  // history stored WITHOUT the system message - it's rebuilt fresh every
  // turn above, so "Known so far" always reflects the latest summary.
  const updatedHistory = [...history, { role: "user", content: patientMessage }, { role: "assistant", content: rawText }];

  return {
    reply: parsed.reply || "Sorry, could you say that again?",
    done: !!parsed.done,
    needsAmbulanceFlag: !!parsed.needsAmbulanceFlag,
    summary: parsed.summary || knownProfile || {},
    history: updatedHistory
  };
}

module.exports = { converse };