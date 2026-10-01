const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { playAndRecord, playAndHangup, sayAndHangup, sayAndRecord } = require("./services/voiceMarkup");

admin.initializeApp({ storageBucket: "medassist-397be.firebasestorage.app" });
// Never crash a call because some optional field happens to be undefined.
admin.firestore().settings({ ignoreUndefinedProperties: true });

const { QUESTIONS } = require("./services/intakeQuestions");
const { CANDIDATE_LANGUAGES } = require("./config/languages");
const { identifyLanguageAndTranscribe, transcribe } = require("./services/azureSpeech");
const { translateToEnglish, translateText } = require("./services/azureTranslate");
const { getSpokenAudioUrl } = require("./services/ttsCache");
const { saveAudioClip } = require("./services/audioStorage");
const { converse } = require("./services/medAssistAgent");
const {
  getPatientByPhone,
  createPatientIfMissing,
  upsertPatientProfile,
  addHistoryEntry
} = require("./services/patientRepository");
const { createSession, getSession, updateSession } = require("./services/callSessions");

// The topics MedAssist's agent needs to cover, in patient-facing wording.
// This is the single source of truth for both the agent's system prompt
// and (indirectly, via the same file) anyone reading the code to see what
// gets asked - QUESTIONS.text is written for exactly this purpose.
const TOPICS = QUESTIONS.map((q) => q.text);

// How long a pause tells SignalWire the caller is done talking - the
// platform's own <Record> feature, no custom silence-detection code needed.
// Also applies BEFORE the caller starts speaking, so give people a moment.
const RECORD_SILENCE_TIMEOUT_SECONDS = 5;
const RECORD_MAX_LENGTH_SECONDS = 45;

// How many times we re-ask before giving up and ending the call politely.
const MAX_REPROMPTS = 2;

// SignalWire gives up on a webhook after roughly 15 seconds and silently
// hangs up ("normal clearing" in its logs). Every turn does STT + translate +
// LLM + TTS, so we (a) use enough memory/CPU, (b) run independent steps in
// parallel, and (c) race the work against a deadline so the caller hears a
// friendly "say that again" instead of dead air. (No minInstances: that costs money.)
const HOOK_OPTIONS = { timeoutSeconds: 60, memory: "512MiB" };
const TURN_DEADLINE_MS = 12000;

function makeTimer(label) {
  const start = Date.now();
  let last = start;
  return (step) => {
    const now = Date.now();
    console.log(`[timing] ${label} | ${step}: +${now - last}ms (total ${now - start}ms)`);
    last = now;
  };
}

const DEADLINE = Symbol("deadline");
function withDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const WELCOME_PROMPT = "Welcome to MedAssist. Please tell us your name to begin.";
const EMPTY_RESPONSE_XML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

// Loaded from functions/.env at deploy/emulator time (see functions/.env.example).
function azureCreds() {
  return {
    speechKey: process.env.AZURE_SPEECH_KEY,
    speechRegion: process.env.AZURE_SPEECH_REGION,
    translatorKey: process.env.AZURE_TRANSLATOR_KEY,
    translatorRegion: process.env.AZURE_TRANSLATOR_REGION,
    translatorEndpoint: process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com"
  };
}

// Builds the "already on file" profile for the agent: every field is a real
// value or null - never undefined (Firestore rejects undefined).
function knownProfileFrom(patient) {
  const p = patient || {};
  return {
    name: p.name ?? null,
    surname: p.surname ?? null,
    age: p.age ?? null,
    provider: p.provider ?? null
  };
}

function functionUrl(name) {
  return `${process.env.FUNCTIONS_BASE_URL}/${name}`;
}

// Only fields the agent may have filled in that belong on the PERMANENT
// patient profile (not just this call) - everything else in its summary is
// call-specific and goes into the history entry instead.
const PROFILE_FIELDS = ["name", "surname", "age", "provider"];

function profileUpdatesFrom(summary) {
  const updates = {};
  PROFILE_FIELDS.forEach((key) => {
    if (summary && summary[key]) updates[key] = summary[key];
  });
  return updates;
}

// We don't yet know for certain how SignalWire wants this recording URL
// fetched - files.signalwire.com doesn't follow the Twilio-style
// Accounts/.../Recordings/{sid}.wav pattern we first assumed - so this
// tries several plausible combinations (with/without a .wav suffix,
// with/without Basic Auth) and reports back exactly which status codes
// came back for each.
async function fetchRecordingBuffer(recordingUrl) {
  const authHeader =
    "Basic " +
    Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString("base64");

  const candidates = [
    { label: "raw, no auth", url: recordingUrl, headers: {} },
    { label: "raw, basic auth", url: recordingUrl, headers: { Authorization: authHeader } },
    { label: ".wav, no auth", url: `${recordingUrl}.wav`, headers: {} },
    { label: ".wav, basic auth", url: `${recordingUrl}.wav`, headers: { Authorization: authHeader } }
  ];

  const attemptsLog = [];
  for (let round = 1; round <= 2; round++) {
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(candidate.url, { headers: candidate.headers });
      if (response.ok) {
        // eslint-disable-next-line no-await-in-loop
        return response.buffer();
      }
      attemptsLog.push(`${candidate.label}=${response.status}`);
    }
    if (round < 2) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw new Error(`Could not download recording. Tried: ${attemptsLog.join(", ")}`);
}

function respondWithQuestion(res, audioUrls) {
  const xml = playAndRecord(audioUrls, {
    actionUrl: functionUrl("handleRecording"),
    timeoutSeconds: RECORD_SILENCE_TIMEOUT_SECONDS,
    maxLengthSeconds: RECORD_MAX_LENGTH_SECONDS
  });
  res.type("text/xml").send(xml);
}

function respondAndHangup(res, audioUrls) {
  res.type("text/xml").send(playAndHangup(audioUrls));
}

// TEMPORARY DEBUG BEHAVIOR: speaks the real error text on the call itself so
// it can be heard directly without needing dashboard log access. Remove the
// err.message part once things are stable - real callers should just hear a
// plain apology.
function respondWithApology(res, err) {
  const detail = err && err.message ? ` Debug detail: ${err.message}` : "";
  res.type("text/xml").send(sayAndHangup(`Sorry, something went wrong.${detail}`));
}

// Used when SignalWire sends a callback with no recording (it heard
// silence) or the recording transcribes to nothing. Re-asks (by replaying
// the agent's own last message) up to MAX_REPROMPTS times, then ends the
// call politely rather than hanging up on the first blip.
async function repromptOrEnd(res, callSid, session, creds) {
  const retries = session.retries || 0;

  if (retries >= MAX_REPROMPTS) {
    if (session.language) {
      const bye = await getSpokenAudioUrl({
        text: "Sorry, we could not hear you. Please call again when you are ready. Goodbye.",
        languageCode: session.language,
        creds
      });
      return respondAndHangup(res, [bye.url]);
    }
    return res.type("text/xml").send(sayAndHangup("Sorry, we could not hear you. Please call again."));
  }

  await updateSession(callSid, { retries: retries + 1 });

  if (session.awaitingLanguageDetection || !session.language) {
    const prompts = await Promise.all(
      CANDIDATE_LANGUAGES.map((lang) => getSpokenAudioUrl({ text: WELCOME_PROMPT, languageCode: lang, creds }))
    );
    return respondWithQuestion(res, prompts.map((p) => p.url));
  }

  const lastMedassistTurn = [...(session.transcript || [])].reverse().find((t) => t.role === "medassist");
  const lastReplyText = lastMedassistTurn ? lastMedassistTurn.english : "Could you tell us how you're feeling today?";

  const sorry = await getSpokenAudioUrl({ text: "Sorry, I did not catch that.", languageCode: session.language, creds });
  const repeat = await getSpokenAudioUrl({ text: lastReplyText, languageCode: session.language, creds });
  return respondWithQuestion(res, [sorry.url, repeat.url]);
}

// ---------------------------------------------------------------------------
// Multilingual phone intake, live on an actual phone number via SignalWire.
// Two webhooks: SignalWire hits incomingCall the instant someone dials in,
// then hits handleRecording every time a <Record> finishes. Every turn -
// after the very first, language-detecting one - is driven by MedAssist's
// Gemini-powered agent (services/medAssistAgent.js), not a fixed script.
// ---------------------------------------------------------------------------

exports.incomingCall = onRequest(HOOK_OPTIONS, async (req, res) => {
  try {
    const phoneNumber = req.body.From;
    const callSid = req.body.CallSid;
    const creds = azureCreds();
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!phoneNumber || !callSid) {
      return respondWithApology(res);
    }

    const existing = await getPatientByPhone(phoneNumber);
    const knownProfile = knownProfileFrom(existing);

    if (existing && existing.preferredLanguage) {
      const language = existing.preferredLanguage;
      const kickoff = existing.name
        ? `(Call started. The patient is ${existing.name}, calling again. Greet them warmly by name and begin.)`
        : "(Call started. Greet the patient warmly and begin.)";

      const agentTurn = await converse({
        history: [],
        patientMessage: kickoff,
        knownProfile,
        topics: TOPICS,
        apiKey: groqApiKey
      });

      await createSession(callSid, {
        phoneNumber,
        language,
        awaitingLanguageDetection: false,
        conversationHistory: agentTurn.history,
        summary: agentTurn.summary,
        transcript: [{ role: "medassist", english: agentTurn.reply, local: null }],
        retries: 0
      });

      const replyAudio = await getSpokenAudioUrl({ text: agentTurn.reply, languageCode: language, creds });
      return respondWithQuestion(res, [replyAudio.url]);
    }

    // New caller, or we don't yet know their language - same "play the
    // welcome in every candidate language, whichever one they answer in
    // tells us the language" trick as before. That first reply becomes the
    // agent's first patient message once we've transcribed it.
    await createSession(callSid, {
      phoneNumber,
      language: null,
      awaitingLanguageDetection: true,
      conversationHistory: [],
      summary: knownProfile,
      transcript: [],
      retries: 0
    });

    const prompts = await Promise.all(
      CANDIDATE_LANGUAGES.map((lang) => getSpokenAudioUrl({ text: WELCOME_PROMPT, languageCode: lang, creds }))
    );

    return respondWithQuestion(res, prompts.map((p) => p.url));
  } catch (err) {
    console.error("incomingCall error:", err);
    return respondWithApology(res, err);
  }
});

exports.handleRecording = onRequest(HOOK_OPTIONS, async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  const tick = makeTimer(`handleRecording ${callSid}`);

  try {
    if (!callSid) {
      console.error("handleRecording: no CallSid in callback. Body:", JSON.stringify(req.body));
      return respondWithApology(res);
    }

    // Caller already hung up and nothing was recorded: nobody to talk to.
    if (!recordingUrl && req.body.CallStatus === "completed") {
      return res.type("text/xml").send(EMPTY_RESPONSE_XML);
    }

    const session = await getSession(callSid);
    if (!session) {
      throw new Error(`No session found for callSid ${callSid}`);
    }
    tick("loaded session");

    const creds = azureCreds();

    if (!recordingUrl) {
      console.warn("handleRecording: callback had no RecordingUrl, re-asking. Body:", JSON.stringify(req.body));
      return await repromptOrEnd(res, callSid, session, creds);
    }

    // Do the whole turn, but never let it run past the deadline.
    const outcome = await withDeadline(processTurn({ callSid, recordingUrl, session, creds, tick }), TURN_DEADLINE_MS);

    if (outcome === DEADLINE) {
      console.error(`handleRecording: turn exceeded ${TURN_DEADLINE_MS}ms - asking caller to repeat.`);
      return res.type("text/xml").send(
        sayAndRecord("Sorry, that took too long. Please say that again.", {
          actionUrl: functionUrl("handleRecording"),
          timeoutSeconds: RECORD_SILENCE_TIMEOUT_SECONDS,
          maxLengthSeconds: RECORD_MAX_LENGTH_SECONDS
        })
      );
    }

    // outcome is { xml } produced by processTurn
    tick("sending response");
    return res.type("text/xml").send(outcome.xml);
  } catch (err) {
    console.error("handleRecording error:", err);
    return respondWithApology(res, err);
  }
});

// One full conversational turn. Returns { xml } (never touches `res`, so it
// can be raced against the deadline safely).
async function processTurn({ callSid, recordingUrl, session, creds, tick }) {
  const groqApiKey = process.env.GROQ_API_KEY;

  const audioBuffer = await fetchRecordingBuffer(recordingUrl);
  tick("downloaded recording");

  // Start saving the caller's audio clip NOW, in parallel - nothing below
  // needs to wait for it until we build the transcript.
  const savedClipPromise = saveAudioClip({
    phoneNumber: session.phoneNumber,
    questionId: `turn-${(session.transcript || []).length}`,
    audioBuffer,
    contentType: "audio/wav"
  }).catch((e) => {
    console.error("saveAudioClip failed (non-fatal):", e);
    return { url: null };
  });

  let language = session.language;
  let transcript;

  if (session.awaitingLanguageDetection) {
    const detected = await identifyLanguageAndTranscribe({
      audioBuffer,
      mimeType: "audio/wav",
      speechKey: creds.speechKey,
      speechRegion: creds.speechRegion
    });
    language = detected.locale;
    transcript = detected.transcript;
  } else {
    const result = await transcribe({
      audioBuffer,
      mimeType: "audio/wav",
      locale: language,
      speechKey: creds.speechKey,
      speechRegion: creds.speechRegion
    });
    transcript = result.transcript;
  }
  tick("speech-to-text");

  if (!transcript || !transcript.trim()) {
    console.warn("processTurn: recording transcribed to nothing, re-asking.");
    // repromptOrEnd writes to `res`, so give it a tiny capture object.
    return captureResponse((fakeRes) => repromptOrEnd(fakeRes, callSid, session, creds));
  }

  // Only lock in the caller's language once we actually understood something.
  const languageSetup = session.awaitingLanguageDetection
    ? createPatientIfMissing(session.phoneNumber).then(() =>
        upsertPatientProfile(session.phoneNumber, { preferredLanguage: language })
      )
    : Promise.resolve();

  const englishText = await translateToEnglish({ text: transcript, fromLanguageCode: language, ...creds });
  tick("translate to English");

  const agentTurn = await converse({
    history: session.conversationHistory || [],
    patientMessage: englishText,
    knownProfile: session.summary,
    topics: TOPICS,
    apiKey: groqApiKey
  });
  tick(`LLM (done=${agentTurn.done})`);

  const [savedClip] = await Promise.all([savedClipPromise, languageSetup]);

  const updatedTranscript = [
    ...(session.transcript || []),
    { role: "patient", local: transcript, english: englishText, audioUrl: savedClip.url },
    { role: "medassist", english: agentTurn.reply, local: null }
  ];

  // Start TTS for the reply while we write to Firestore - they're independent.
  const replyAudioPromise = getSpokenAudioUrl({ text: agentTurn.reply, languageCode: language, creds });

  const sessionWrite = updateSession(callSid, {
    language,
    awaitingLanguageDetection: false,
    conversationHistory: agentTurn.history,
    summary: agentTurn.summary,
    transcript: updatedTranscript,
    retries: 0
  });

  // Save the permanent profile EVERY turn, not just at the end, so a dropped
  // call never loses what the patient already told us.
  const profileUpdates = profileUpdatesFrom(agentTurn.summary);
  const profileWrite = Object.keys(profileUpdates).length
    ? upsertPatientProfile(session.phoneNumber, profileUpdates)
    : Promise.resolve();

  const [replyAudio] = await Promise.all([replyAudioPromise, sessionWrite, profileWrite]);
  tick("TTS + Firestore writes");

  if (agentTurn.done) {
    await addHistoryEntry(session.phoneNumber, {
      language,
      ...agentTurn.summary,
      needsAmbulanceFlag: agentTurn.needsAmbulanceFlag,
      transcript: updatedTranscript
    });
    return { xml: playAndHangup([replyAudio.url]) };
  }

  return {
    xml: playAndRecord([replyAudio.url], {
      actionUrl: functionUrl("handleRecording"),
      timeoutSeconds: RECORD_SILENCE_TIMEOUT_SECONDS,
      maxLengthSeconds: RECORD_MAX_LENGTH_SECONDS
    })
  };
}

// repromptOrEnd() was written to send on a response object; this lets
// processTurn reuse it while still just returning the XML.
async function captureResponse(fn) {
  let xml = "";
  const fakeRes = {
    type() {
      return this;
    },
    send(body) {
      xml = body;
      return this;
    }
  };
  await fn(fakeRes);
  return { xml };
}

// ---------------------------------------------------------------------------
// Text-chat version of the exact same agent, for the patient website. No
// Azure Speech needed here (the patient types, MedAssist types back) - only
// Azure Translator, so the same agent can speak isiZulu/Afrikaans in text
// form too. Sessions are keyed by a sessionId the page generates itself.
// ---------------------------------------------------------------------------

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

exports.chatMessage = onRequest({ timeoutSeconds: 60 }, async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  try {
    const { sessionId, message, language, phoneNumber } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const creds = azureCreds();
    const session = await getSession(sessionId, "chatSessions");

    // First request for this sessionId: no message yet, just start the
    // conversation and send back MedAssist's opening line.
    if (!session) {
      const chosenLanguage = language || "en-ZA";
      const existing = phoneNumber ? await getPatientByPhone(phoneNumber) : null;
      const knownProfile = knownProfileFrom(existing);

      const agentTurn = await converse({
        history: [],
        patientMessage: "(Chat started. Greet the patient warmly and begin.)",
        knownProfile,
        topics: TOPICS,
        apiKey: groqApiKey
      });

      const translatedGreeting = await translateText({ text: agentTurn.reply, toLanguageCode: chosenLanguage, ...creds });

      await createSession(
        sessionId,
        {
          phoneNumber: phoneNumber || null,
          language: chosenLanguage,
          conversationHistory: agentTurn.history,
          summary: agentTurn.summary,
          transcript: [{ role: "medassist", english: agentTurn.reply, local: translatedGreeting }]
        },
        "chatSessions"
      );

      return res.json({ reply: translatedGreeting, done: false });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const englishText = await translateToEnglish({ text: message, fromLanguageCode: session.language, ...creds });

    const agentTurn = await converse({
      history: session.conversationHistory || [],
      patientMessage: englishText,
      knownProfile: session.summary,
      topics: TOPICS,
      apiKey: groqApiKey
    });

    const translatedReply = await translateText({ text: agentTurn.reply, toLanguageCode: session.language, ...creds });

    const updatedTranscript = [
      ...(session.transcript || []),
      { role: "patient", local: message, english: englishText },
      { role: "medassist", english: agentTurn.reply, local: translatedReply }
    ];

    await updateSession(
      sessionId,
      { conversationHistory: agentTurn.history, summary: agentTurn.summary, transcript: updatedTranscript },
      "chatSessions"
    );

    if (agentTurn.done && session.phoneNumber) {
      const profileUpdates = profileUpdatesFrom(agentTurn.summary);
      if (Object.keys(profileUpdates).length) {
        await createPatientIfMissing(session.phoneNumber);
        await upsertPatientProfile(session.phoneNumber, profileUpdates);
      }
      await addHistoryEntry(session.phoneNumber, {
        language: session.language,
        ...agentTurn.summary,
        needsAmbulanceFlag: agentTurn.needsAmbulanceFlag,
        transcript: updatedTranscript
      });
    }

    return res.json({
      reply: translatedReply,
      done: agentTurn.done,
      summary: agentTurn.summary,
      needsAmbulanceFlag: agentTurn.needsAmbulanceFlag
    });
  } catch (err) {
    console.error("chatMessage error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});