const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { playAndRecord, playAndHangup, sayAndHangup } = require("./services/voiceMarkup");

admin.initializeApp({ storageBucket: "medassist-397be.firebasestorage.app" });

const { QUESTIONS, nextUnansweredQuestion } = require("./services/intakeQuestions");
const { CANDIDATE_LANGUAGES } = require("./config/languages");
const { identifyLanguageAndTranscribe, transcribe } = require("./services/azureSpeech");
const { translateToEnglish } = require("./services/azureTranslate");
const { getSpokenAudioUrl } = require("./services/ttsCache");
const { saveAudioClip } = require("./services/audioStorage");
const {
  getPatientByPhone,
  createPatientIfMissing,
  upsertPatientProfile,
  addHistoryEntry
} = require("./services/patientRepository");
const { createSession, getSession, updateSession } = require("./services/callSessions");

// How long a pause tells SignalWire the caller is done talking - the platform's own
// <Record> feature, no custom silence-detection code needed on our side.
const RECORD_SILENCE_TIMEOUT_SECONDS = 3;
const RECORD_MAX_LENGTH_SECONDS = 45;

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

function functionUrl(name) {
  return `${process.env.FUNCTIONS_BASE_URL}/${name}`;
}

// SignalWire's docs note recordings "are not always available immediately -
// especially at high call volumes" - so we retry a few times with a short
// delay rather than failing the whole call on the first blip.
async function fetchRecordingWithRetry(recordingUrl, { attempts = 4, delayMs = 700 } = {}) {
  const authHeader =
    "Basic " +
    Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString("base64");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${recordingUrl}.wav`, { headers: { Authorization: authHeader } });
    if (response.ok) {
      // eslint-disable-next-line no-await-in-loop
      return response.buffer();
    }
    if (attempt < attempts) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Could not download call recording after ${attempts} attempts: ${recordingUrl}`);
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
  // TEMPORARY DEBUG BEHAVIOR: speak the real error back on the call itself so
  // it's audible without needing Firebase Console log access. Remove the
  // err-reading branch below once things are working end-to-end.
  const message = err
    ? `Debug error. ${String(err && err.message ? err.message : err).slice(0, 200)}`
    : "Sorry, something went wrong. Please try calling again.";
  res.type("text/xml").send(sayAndHangup(message));
}

// ---------------------------------------------------------------------------
// Multilingual phone intake, live on an actual phone number via SignalWire.
// Two webhooks: SignalWire hits incomingCall the instant someone dials in, then
// hits handleRecording every time a <Record> finishes (silence detected,
// max length reached, or the caller hangs up). Everything in between -
// listen, figure out the language, ask the fixed set of questions, talk
// back - reuses the exact same Azure services as before.
// ---------------------------------------------------------------------------

exports.incomingCall = onRequest(async (req, res) => {
  try {
    const phoneNumber = req.body.From;
    const callSid = req.body.CallSid;
    const creds = azureCreds();

    if (!phoneNumber || !callSid) {
      return respondWithApology(res);
    }

    const existing = await getPatientByPhone(phoneNumber);

    if (existing && existing.preferredLanguage) {
      const question = nextUnansweredQuestion(existing, []);

      await createSession(callSid, {
        phoneNumber,
        language: existing.preferredLanguage,
        answeredIds: [],
        answers: {},
        rawAnswers: [],
        currentQuestionId: question ? question.id : null,
        awaitingLanguageDetection: false
      });

      if (!question) {
        const bye = await getSpokenAudioUrl({
          text: "Thank you for calling MedAssist. Goodbye.",
          languageCode: existing.preferredLanguage,
          creds
        });
        return respondAndHangup(res, [bye.url]);
      }

      const greeting = await getSpokenAudioUrl({
        text: `Welcome back${existing.name ? ", " + existing.name : ""}. Let's talk about how you're feeling today.`,
        languageCode: existing.preferredLanguage,
        creds
      });
      const questionAudio = await getSpokenAudioUrl({
        text: question.text,
        languageCode: existing.preferredLanguage,
        creds
      });

      return respondWithQuestion(res, [greeting.url, questionAudio.url]);
    }

    // New caller - we don't know their language yet. Play the same "please
    // tell us your name" prompt in every candidate language back to back;
    // whichever one they answer in tells us which language they speak, and
    // that same recording doubles as their answer to the first question.
    await createSession(callSid, {
      phoneNumber,
      language: null,
      answeredIds: [],
      answers: {},
      rawAnswers: [],
      currentQuestionId: QUESTIONS[0].id,
      awaitingLanguageDetection: true
    });

    const prompts = await Promise.all(
      CANDIDATE_LANGUAGES.map((lang) =>
        getSpokenAudioUrl({ text: "Welcome to MedAssist. Please tell us your name to begin.", languageCode: lang, creds })
      )
    );

    return respondWithQuestion(res, prompts.map((p) => p.url));
  } catch (err) {
    console.error("incomingCall error:", err);
    return respondWithApology(res, err);
  }
});

exports.handleRecording = onRequest(async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const recordingUrl = req.body.RecordingUrl;
    if (!callSid || !recordingUrl) {
      return respondWithApology(res);
    }

    const session = await getSession(callSid);
    if (!session) {
      throw new Error(`No session found for callSid ${callSid}`);
    }

    const creds = azureCreds();
    const audioBuffer = await fetchRecordingWithRetry(recordingUrl);

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
      await createPatientIfMissing(session.phoneNumber);
      await upsertPatientProfile(session.phoneNumber, { preferredLanguage: language });
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

    const questionId = session.currentQuestionId;
    const question = QUESTIONS.find((q) => q.id === questionId);
    const englishAnswer = await translateToEnglish({ text: transcript, fromLanguageCode: language, ...creds });
    const savedClip = await saveAudioClip({
      phoneNumber: session.phoneNumber,
      questionId,
      audioBuffer,
      contentType: "audio/wav"
    });

    if (question && question.profileField) {
      await upsertPatientProfile(session.phoneNumber, { [question.field]: englishAnswer });
    }

    const updatedAnswers = { ...session.answers, [question.field]: englishAnswer };
    const updatedRawAnswers = [
      ...session.rawAnswers,
      { questionId, local: transcript, english: englishAnswer, audioUrl: savedClip.url }
    ];
    const updatedAnsweredIds = [...session.answeredIds, questionId];

    const profile = await getPatientByPhone(session.phoneNumber);
    const nextQuestion = nextUnansweredQuestion(profile, updatedAnsweredIds);

    await updateSession(callSid, {
      language,
      answers: updatedAnswers,
      rawAnswers: updatedRawAnswers,
      answeredIds: updatedAnsweredIds,
      currentQuestionId: nextQuestion ? nextQuestion.id : null,
      awaitingLanguageDetection: false
    });

    if (!nextQuestion) {
      const ambulanceText = (updatedAnswers.needsAmbulance || "").toLowerCase();
      const needsAmbulanceFlag =
        ambulanceText.includes("yes") || ambulanceText.includes("ja") || ambulanceText.includes("yebo");

      await addHistoryEntry(session.phoneNumber, {
        language,
        location: updatedAnswers.location || null,
        symptoms: updatedAnswers.symptoms || null,
        symptomDuration: updatedAnswers.symptomDuration || null,
        lastVisit: updatedAnswers.lastVisit || null,
        medicalHistory: updatedAnswers.medicalHistory || null,
        medications: updatedAnswers.medications || null,
        needsAmbulance: updatedAnswers.needsAmbulance || null,
        needsAmbulanceFlag,
        emergencyContactNumber: updatedAnswers.emergencyContactNumber || null,
        rawAnswers: updatedRawAnswers
      });

      const bye = await getSpokenAudioUrl({
        text: "Thank you. Your information has been recorded and a healthcare worker will review it. Goodbye.",
        languageCode: language,
        creds
      });
      return respondAndHangup(res, [bye.url]);
    }

    const nextQuestionAudio = await getSpokenAudioUrl({ text: nextQuestion.text, languageCode: language, creds });
    return respondWithQuestion(res, [nextQuestionAudio.url]);
  } catch (err) {
    console.error("handleRecording error:", err);
    return respondWithApology(res, err);
  }
});