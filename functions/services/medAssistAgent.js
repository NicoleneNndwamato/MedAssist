const fetch = require("node-fetch");

// MedAssist's persona and rules - the one place this is defined, shared by
// both the phone call flow (functions/index.js) and the website chat, so
// there's exactly one "brain" behind both surfaces, not two copies that can
// drift apart.
function buildSystemPrompt(topics) {
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
"done" becomes true once you have gathered enough to end the conversation (you don't need every field if it's a genuine emergency - prioritise safety guidance, location, and an emergency contact, then end quickly). When done is true, "reply" should be a short, kind closing message.`;
}

// One turn of the conversation.
// - `history` is the Gemini-format running transcript so far:
//   [{ role: "user"|"model", parts: [{ text }] }]
// - `patientMessage` is the patient's latest message, ALWAYS in English
//   (translated upstream if they spoke/typed another language) - the agent
//   only ever thinks in English, translation happens outside this file.
// - `knownProfile` is whatever we already have on file for this phone
//   number/session, so the agent doesn't re-ask for it.
// Returns { reply, done, needsAmbulanceFlag, summary, history } where
// `history` is ready to pass back in as `history` on the next turn.
async function converse({ history, patientMessage, knownProfile, topics, apiKey }) {
  const contents = [...history, { role: "user", parts: [{ text: patientMessage }] }];
  const systemInstructionText =
    buildSystemPrompt(topics) + "\n\nKnown so far for this patient: " + JSON.stringify(knownProfile || {});

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstructionText }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${errText}`);
  }

  const data = await response.json();
  const rawText = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    // Model didn't return valid JSON this turn - fail soft with a natural
    // "say that again" rather than crashing the whole conversation.
    parsed = { reply: "Sorry, could you say that again?", done: false, needsAmbulanceFlag: false, summary: knownProfile || {} };
  }

  return {
    reply: parsed.reply || "Sorry, could you say that again?",
    done: !!parsed.done,
    needsAmbulanceFlag: !!parsed.needsAmbulanceFlag,
    summary: parsed.summary || knownProfile || {},
    history: [...contents, { role: "model", parts: [{ text: rawText }] }]
  };
}

module.exports = { converse };
