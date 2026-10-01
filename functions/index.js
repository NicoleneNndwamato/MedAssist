const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { playAndRecord, playAndHangup, sayAndHangup, sayAndRecord } = require("./services/voiceMarkup");

admin.initializeApp({ storageBucket: "medassist-397be.firebasestorage.app" });

const { QUESTIONS } = require("./services/intakeQuestions");
const { CANDIDATE_LANGUAGES } = require("./config/languages");
const { identifyLanguageAndTranscribe, transcribe } = require("./services/azureSpeech");
const { translateToEnglish, translateText } = require("./services/azureTranslate");
const { getSpokenAudioUrl } = require("./services/ttsCache");
const { saveAudioClip } = require("./services/audioStorage");
const { converse, extractSummary, FIELD_QUESTIONS } = require("./services/medAssistAgent");
const {
  getPatientByPhone,
  createPatientIfMissing,
  upsertPatientProfile,
  addHistoryEntry
} = require("./services/patientRepository");
const { createSession, getSession, updateSession } = require("./services/callSessions");
const { bookAppointment, spokenDateTime } = require("./Booking");
const { pickAppointmentTime } = require("./services/appointmentTime");
const { sendSms } = require("./services/sms");

const TOPICS = QUESTIONS.map((q) => q.text);

const CALL_SESSIONS = "callSessions";

const PHONE_FIELDS = [
  "needsAmbulance",
  "surname",
  "age",
  "provider",
  "location",
  "symptoms",
  "symptomDuration",
  "lastVisit",
  "medicalHistory",
  "appointmentTime"
];

const CLOSING_AMBULANCE = "Thank you. We will direct you to a 112 operator who will call you shortly. Goodbye.";
const CLOSING_APPOINTMENT = "Thank you. We will contact you shortly by SMS with the details of your appointment. Goodbye.";

function saidYes(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  if (/^(no|nope|nah)\b/.test(t)) return false;
  if (/\b(do not|don't|dont|not)\s+(need|want)\b/.test(t)) return false;
  return /\b(yes|yeah|yep|yup|please|sure|definitely|i do|i need|need an ambulance)\b/.test(t);
}

function transcriptToText(transcript) {
  return (transcript || [])
    .map((t) => `${t.role === "patient" ? "Patient" : "MedAssist"}: ${t.english || t.local || ""}`)
    .join("\n");
}

const SMS_RECIPIENT = "+27716291102";

async function textBookingConfirmation({ when, language }) {
  try {
    const english = `Your appointment has been booked for ${spokenDateTime(when)}. If you need assistance, feel free to call us.`;
    const translated = await translateText({ text: english, toLanguageCode: language, ...azureCreds() });
    await sendSms({ to: SMS_RECIPIENT, body: `MedAssist: ${translated}` });
    console.log("textBookingConfirmation: SMS sent");
  } catch (err) {
    console.error("textBookingConfirmation failed:", err);
  }
}

async function scheduleAndText({ result, summary, language }) {
  let when;
  try {
    when = await pickAppointmentTime({
      phrase: summary && summary.appointmentTime,
      apiKey: process.env.GROQ_API_KEY
    });
  } catch (err) {
    console.error("scheduleAndText: could not pick a time:", err);
    return;
  }

  if (result && result.appointmentId) {
    try {
      await admin.firestore().collection("appointments").doc(result.appointmentId).update({
        scheduledAt: admin.firestore.Timestamp.fromDate(when),
        scheduledLabel: spokenDateTime(when),
        appointmentStatus: "BOOKED"
      });
    } catch (err) {
      console.error("scheduleAndText: could not save the chosen time:", err);
    }
  }

  await textBookingConfirmation({ when, language });
}

async function bookCase({ patientId, summary, needsAmbulanceFlag, language, transcript, source, sendText }) {
  let result = null;
  try {
    const priority = needsAmbulanceFlag ? "IMMEDIATE" : (summary && summary.priority) || "STANDARD";
    result = await bookAppointment({
      patientId,
      summary: { ...(summary || {}), priority },
      needsAmbulanceFlag,
      language,
      transcriptText: transcriptToText(transcript),
      source
    });
    console.log(`bookCase: appointment ${result.appointmentId} created (${result.tier}, booked=${result.booked})`);
  } catch (err) {
    console.error("bookCase failed:", err);
  }

  if (sendText) {
    await scheduleAndText({ result, summary, language });
  }
  return result;
}

async function heardAmbulanceAnswer({ recordingUrl, language, creds }) {
  try {
    const audioBuffer = await fetchRecordingBuffer(recordingUrl);
    const result = await transcribe({
      audioBuffer,
      mimeType: "audio/wav",
      locale: language,
      speechKey: creds.speechKey,
      speechRegion: creds.speechRegion
    });
    if (!result.transcript || !result.transcript.trim()) return null;
    const english = await translateToEnglish({ text: result.transcript, fromLanguageCode: language, ...creds });
    return saidYes(english);
  } catch (err) {
    console.error("heardAmbulanceAnswer failed:", err);
    return null;
  }
}

const RECORD_SILENCE_TIMEOUT_SECONDS = 2;
const RECORD_MAX_LENGTH_SECONDS = 45;

const MAX_REPROMPTS =1;

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

function azureCreds() {
  return {
    speechKey: process.env.AZURE_SPEECH_KEY,
    speechRegion: process.env.AZURE_SPEECH_REGION,
    translatorKey: process.env.AZURE_TRANSLATOR_KEY,
    translatorRegion: process.env.AZURE_TRANSLATOR_REGION,
    translatorEndpoint: process.env.AZURE_TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com"
  };
}

function functionUrl(name) {
  return `${process.env.FUNCTIONS_BASE_URL}/${name}`;
}

const PROFILE_FIELDS = ["name", "surname", "age", "provider"];

function profileUpdatesFrom(summary) {
  const updates = {};
  PROFILE_FIELDS.forEach((key) => {
    if (summary && summary[key]) updates[key] = summary[key];
  });
  return updates;
}

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

      const response = await fetch(candidate.url, { headers: candidate.headers });
      if (response.ok) {

        return response.buffer();
      }
      attemptsLog.push(`${candidate.label}=${response.status}`);
    }
    if (round < 2) {

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

function respondWithApology(res, err) {
  const detail = err && err.message ? ` Debug detail: ${err.message}` : "";
  res.type("text/xml").send(sayAndHangup(`Sorry, something went wrong.${detail}`));
}

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

  await updateSession(callSid, { retries: retries + 1 }, CALL_SESSIONS);

  if (session.awaitingLanguageDetection || !session.language) {
    const prompts = await Promise.all(
      CANDIDATE_LANGUAGES.map((lang) => getSpokenAudioUrl({ text: WELCOME_PROMPT, languageCode: lang, creds }))
    );
    return respondWithQuestion(res, prompts.map((p) => p.url));
  }

  const lastReplyText = session.lastQuestion || "Could you tell us how you're feeling today?";

  const sorry = await getSpokenAudioUrl({ text: "Sorry, I did not catch that.", languageCode: session.language, creds });
  const repeat = await getSpokenAudioUrl({ text: lastReplyText, languageCode: session.language, creds });
  return respondWithQuestion(res, [sorry.url, repeat.url]);
}

exports.incomingCall = onRequest(HOOK_OPTIONS, async (req, res) => {
  try {
    const phoneNumber = req.body.From;
    const callSid = req.body.CallSid;
    const creds = azureCreds();

    if (!phoneNumber || !callSid) {
      return respondWithApology(res);
    }

    const existing = await getPatientByPhone(phoneNumber);
    const knownProfile = existing
      ? { name: existing.name, surname: existing.surname, age: existing.age, provider: existing.provider }
      : {};
    const questionKeys = PHONE_FIELDS.filter((field) => !knownProfile[field]);

    if (existing && existing.preferredLanguage) {
      const language = existing.preferredLanguage;
      const [firstKey, ...remainingKeys] = questionKeys;
      const firstQuestion = FIELD_QUESTIONS[firstKey];
      const greeting = existing.name ? `Welcome back, ${existing.name}.` : "Welcome back to MedAssist.";

      await createSession(
        callSid,
        {
          phoneNumber,
          language,
          awaitingLanguageDetection: false,
          status: "collecting",
          currentKey: firstKey,
          lastQuestion: firstQuestion,
          questionKeys: remainingKeys,
          answers: [],
          summary: knownProfile,
          retries: 0
        },
        CALL_SESSIONS
      );

      const [greetingAudio, questionAudio] = await Promise.all([
        getSpokenAudioUrl({ text: greeting, languageCode: language, creds }),
        getSpokenAudioUrl({ text: firstQuestion, languageCode: language, creds })
      ]);
      return respondWithQuestion(res, [greetingAudio.url, questionAudio.url]);
    }

    await createSession(
      callSid,
      {
        phoneNumber,
        language: null,
        awaitingLanguageDetection: true,
        status: "collecting",
        currentKey: "name",
        lastQuestion: WELCOME_PROMPT,
        questionKeys,
        answers: [],
        summary: knownProfile,
        retries: 0
      },
      CALL_SESSIONS
    );

    const prompts = await Promise.all(
      CANDIDATE_LANGUAGES.map((lang) => getSpokenAudioUrl({ text: WELCOME_PROMPT, languageCode: lang, creds }))
    );

    return respondWithQuestion(res, prompts.map((p) => p.url));
  } catch (err) {
    console.error("incomingCall error:", err);
    return respondWithApology(res, err);
  }
});

async function closeCollection(callSid, recordingUrl) {
  const session = await getSession(callSid, CALL_SESSIONS);
  if (!session || session.status !== "collecting") return;

  const answers = [...(session.answers || [])];
  if (recordingUrl && session.currentKey) {
    answers.push({ key: session.currentKey, question: session.lastQuestion, recordingUrl });
  }
  await updateSession(callSid, { answers, status: "collected" }, CALL_SESSIONS);
}

exports.handleRecording = onRequest(HOOK_OPTIONS, async (req, res) => {
  const callSid = req.body.CallSid;
  const recordingUrl = req.body.RecordingUrl;
  const tick = makeTimer(`handleRecording ${callSid}`);

  try {
    if (!callSid) {
      console.error("handleRecording: no CallSid in callback. Body:", JSON.stringify(req.body));
      return respondWithApology(res);
    }

    if (req.body.CallStatus === "completed") {
      await closeCollection(callSid, recordingUrl);
      return res.type("text/xml").send(EMPTY_RESPONSE_XML);
    }

    const session = await getSession(callSid, CALL_SESSIONS);
    if (!session) {
      throw new Error(`No session found for callSid ${callSid}`);
    }
    tick("loaded session");

    const creds = azureCreds();

    if (!recordingUrl) {
      console.warn("handleRecording: callback had no RecordingUrl, re-asking. Body:", JSON.stringify(req.body));
      return await repromptOrEnd(res, callSid, session, creds);
    }

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

    tick("sending response");
    return res.type("text/xml").send(outcome.xml);
  } catch (err) {
    console.error("handleRecording error:", err);
    return respondWithApology(res, err);
  }
});

async function processTurn({ callSid, recordingUrl, session, creds, tick }) {
  let language = session.language;
  let firstTranscript = null;

  if (session.awaitingLanguageDetection) {
    const audioBuffer = await fetchRecordingBuffer(recordingUrl);
    tick("downloaded recording");

    const detected = await identifyLanguageAndTranscribe({
      audioBuffer,
      mimeType: "audio/wav",
      speechKey: creds.speechKey,
      speechRegion: creds.speechRegion
    });
    tick("language detection");

    if (!detected.transcript || !detected.transcript.trim()) {
      console.warn("processTurn: recording transcribed to nothing, re-asking.");
      return captureResponse((fakeRes) => repromptOrEnd(fakeRes, callSid, session, creds));
    }

    language = detected.locale;
    firstTranscript = detected.transcript;
  }

  const answer = { key: session.currentKey, question: session.lastQuestion, recordingUrl };
  if (firstTranscript) answer.transcript = firstTranscript;
  const answers = [...(session.answers || []), answer];
  const [nextKey, ...remainingKeys] = session.questionKeys || [];

  let ambulanceYes = session.ambulanceYes === undefined ? null : session.ambulanceYes;
  if (session.currentKey === "needsAmbulance") {
    ambulanceYes = await heardAmbulanceAnswer({ recordingUrl, language, creds });
    tick("ambulance answer checked");
  }

  if (!nextKey) {
    const closingText = ambulanceYes === false ? CLOSING_APPOINTMENT : CLOSING_AMBULANCE;
    const [closing] = await Promise.all([
      getSpokenAudioUrl({ text: closingText, languageCode: language, creds }),
      updateSession(
        callSid,
        { language, awaitingLanguageDetection: false, answers, status: "collected", retries: 0, ambulanceYes },
        CALL_SESSIONS
      )
    ]);
    tick("collected all answers");
    return { xml: playAndHangup([closing.url]) };
  }

  const nextQuestion = FIELD_QUESTIONS[nextKey];
  const [questionAudio] = await Promise.all([
    getSpokenAudioUrl({ text: nextQuestion, languageCode: language, creds }),
    updateSession(
      callSid,
      {
        language,
        awaitingLanguageDetection: false,
        answers,
        currentKey: nextKey,
        lastQuestion: nextQuestion,
        questionKeys: remainingKeys,
        retries: 0,
        ambulanceYes
      },
      CALL_SESSIONS
    )
  ]);
  tick("stored answer, next question ready");

  return {
    xml: playAndRecord([questionAudio.url], {
      actionUrl: functionUrl("handleRecording"),
      timeoutSeconds: RECORD_SILENCE_TIMEOUT_SECONDS,
      maxLengthSeconds: RECORD_MAX_LENGTH_SECONDS
    })
  };
}

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

async function finalizeSession(callSid, session) {
  const creds = azureCreds();
  const language = session.language;
  const answers = session.answers || [];

  if (!language || !answers.length) {
    await updateSession(callSid, { status: "abandoned" }, CALL_SESSIONS);
    return;
  }

  const results = await Promise.all(
    answers.map(async (answer, index) => {
      try {
        const audioBuffer = await fetchRecordingBuffer(answer.recordingUrl);

        const [savedClip, local] = await Promise.all([
          saveAudioClip({
            phoneNumber: session.phoneNumber,
            questionId: `${callSid}-${index}-${answer.key}`,
            audioBuffer,
            contentType: "audio/wav"
          }).catch((e) => {
            console.error("saveAudioClip failed (non-fatal):", e);
            return { url: null };
          }),
          answer.transcript
            ? Promise.resolve(answer.transcript)
            : transcribe({
                audioBuffer,
                mimeType: "audio/wav",
                locale: language,
                speechKey: creds.speechKey,
                speechRegion: creds.speechRegion
              }).then((result) => result.transcript)
        ]);

        const english =
          local && local.trim()
            ? await translateToEnglish({ text: local, fromLanguageCode: language, ...creds })
            : "";

        return { key: answer.key, question: answer.question, local, english, audioUrl: savedClip.url };
      } catch (err) {
        console.error(`finalizeSession ${callSid}: answer ${answer.key} failed:`, err);
        return { key: answer.key, question: answer.question, local: "", english: "", audioUrl: null };
      }
    })
  );

  const { summary, needsAmbulanceFlag } = await extractSummary({
    answers: results,
    knownProfile: session.summary,
    apiKey: process.env.GROQ_API_KEY
  });

  const ambulanceNeeded = needsAmbulanceFlag || session.ambulanceYes === true;

  const transcript = results.flatMap((r) => [
    { role: "medassist", english: r.question, local: null },
    { role: "patient", local: r.local, english: r.english, audioUrl: r.audioUrl }
  ]);

  await createPatientIfMissing(session.phoneNumber);
  await upsertPatientProfile(session.phoneNumber, { ...profileUpdatesFrom(summary), preferredLanguage: language });
  await addHistoryEntry(session.phoneNumber, {
    language,
    ...summary,
    needsAmbulanceFlag: ambulanceNeeded,
    transcript
  });

  await bookCase({
    patientId: session.phoneNumber,
    summary,
    needsAmbulanceFlag: ambulanceNeeded,
    language,
    transcript,
    source: "phone",
    sendText: session.ambulanceYes === false
  });

  await updateSession(callSid, { status: "processed", summary, transcript }, CALL_SESSIONS);
}

exports.finalizeCall = onDocumentUpdated(
  { document: `${CALL_SESSIONS}/{callSid}`, timeoutSeconds: 300, memory: "512MiB" },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!after || after.status !== "collected" || (before && before.status === "collected")) return;

    const callSid = event.params.callSid;
    try {
      await finalizeSession(callSid, after);
    } catch (err) {
      console.error(`finalizeCall ${callSid} error:`, err);
      await updateSession(
        callSid,
        { status: "failed", error: String((err && err.message) || err) },
        CALL_SESSIONS
      );
    }
  }
);

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

    if (!session) {
      const chosenLanguage = language || "en-ZA";
      const existing = phoneNumber ? await getPatientByPhone(phoneNumber) : null;
      const knownProfile = existing
        ? { name: existing.name, surname: existing.surname, age: existing.age, provider: existing.provider }
        : {};

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

    const chatAmbulance = agentTurn.needsAmbulanceFlag || saidYes(agentTurn.summary && agentTurn.summary.needsAmbulance);
    const replyEnglish = agentTurn.done
      ? (chatAmbulance ? CLOSING_AMBULANCE : CLOSING_APPOINTMENT)
      : agentTurn.reply;

    const translatedReply = await translateText({ text: replyEnglish, toLanguageCode: session.language, ...creds });

    const updatedTranscript = [
      ...(session.transcript || []),
      { role: "patient", local: message, english: englishText },
      { role: "medassist", english: replyEnglish, local: translatedReply }
    ];

    await updateSession(
      sessionId,
      { conversationHistory: agentTurn.history, summary: agentTurn.summary, transcript: updatedTranscript },
      "chatSessions"
    );

    if (agentTurn.done && !session.booked) {
      if (session.phoneNumber) {
        const profileUpdates = profileUpdatesFrom(agentTurn.summary);
        if (Object.keys(profileUpdates).length) {
          await createPatientIfMissing(session.phoneNumber);
          await upsertPatientProfile(session.phoneNumber, profileUpdates);
        }
        await addHistoryEntry(session.phoneNumber, {
          language: session.language,
          ...agentTurn.summary,
          needsAmbulanceFlag: chatAmbulance,
          transcript: updatedTranscript
        });
      }
      await bookCase({
        patientId: session.phoneNumber || `chat-${sessionId}`,
        summary: agentTurn.summary,
        needsAmbulanceFlag: chatAmbulance,
        language: session.language,
        transcript: updatedTranscript,
        source: "chat",
        sendText: !chatAmbulance
      });
      await updateSession(sessionId, { booked: true }, "chatSessions");
    }

    return res.json({
      reply: translatedReply,
      done: agentTurn.done,
      summary: agentTurn.summary,
      needsAmbulanceFlag: chatAmbulance
    });
  } catch (err) {
    console.error("chatMessage error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});