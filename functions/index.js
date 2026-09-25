const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const { QUESTIONS, nextUnansweredQuestion } = require("./services/intakeQuestions");
const { CANDIDATE_LANGUAGES } = require("./config/languages");
const { identifyLanguageAndTranscribe, transcribe, synthesizeSpeech } = require("./services/azureSpeech");
const { translateText, translateToEnglish } = require("./services/azureTranslate");
const {
  getPatientByPhone,
  createPatientIfMissing,
  upsertPatientProfile,
  addHistoryEntry
} = require("./services/patientRepository");

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

// Builds the "next question, already translated and already spoken aloud"
// payload the client needs: text in the patient's language plus ready-to-play
// MP3 audio. Returns null once there's nothing left to ask.
async function buildQuestionPayload(question, languageCode) {
  if (!question) return null;
  const creds = azureCreds();
  const translatedText = await translateText({ text: question.text, toLanguageCode: languageCode, ...creds });
  const audioBuffer = await synthesizeSpeech({
    text: translatedText,
    languageCode,
    speechKey: creds.speechKey,
    speechRegion: creds.speechRegion
  });
  return { id: question.id, text: translatedText, audioBase64: audioBuffer.toString("base64") };
}

async function speakInLanguage(text, languageCode) {
  const creds = azureCreds();
  const translated = await translateText({ text, toLanguageCode: languageCode, ...creds });
  const audioBuffer = await synthesizeSpeech({
    text: translated,
    languageCode,
    speechKey: creds.speechKey,
    speechRegion: creds.speechRegion
  });
  return { text: translated, audioBase64: audioBuffer.toString("base64") };
}

// ---------------------------------------------------------------------------
// Multilingual phone intake (Azure Speech + Azure Translator).
// This is deliberately a separate, deterministic script-driven pipeline,
// NOT another AI conversation loop - it's the "listen -> figure out the
// language -> ask the fixed set of intake questions -> talk back" flow,
// built so the exact same functions can sit behind USSD/telephony later.
// ---------------------------------------------------------------------------

// Called the instant the patient "dials in". Looks them up by phone number.
//
// Returning patient: we already know their language and their name/age/
// provider, so we skip straight to whatever's left to ask (their symptoms
// for THIS call). Real telephony would hand us their language from the
// network; for the hackathon we simulate that lookup delay with hold music
// on the client while this call is in flight.
//
// New patient: we don't know their language yet, so we return one greeting
// per candidate language for the client to play back-to-back, then start
// listening - whichever one they answer in tells us their language.
exports.startCall = onCall(async (request) => {
  const { phoneNumber } = request.data || {};
  if (!phoneNumber) throw new HttpsError("invalid-argument", "phoneNumber is required");

  const existing = await getPatientByPhone(phoneNumber);

  if (existing && existing.preferredLanguage) {
    const question = nextUnansweredQuestion(existing, []);
    const questionPayload = await buildQuestionPayload(question, existing.preferredLanguage);
    const greeting = await speakInLanguage(
      `Welcome back${existing.name ? ", " + existing.name : ""}. Let's talk about how you're feeling today.`,
      existing.preferredLanguage
    );

    return {
      isNewPatient: false,
      language: existing.preferredLanguage,
      profile: existing,
      greeting,
      question: questionPayload
    };
  }

  const prompts = await Promise.all(
    CANDIDATE_LANGUAGES.map(async (lang) => {
      const spoken = await speakInLanguage("Welcome to MedAssist. Please tell us your name to begin.", lang);
      return { language: lang, ...spoken };
    })
  );

  return { isNewPatient: true, prompts };
});

// A brand-new patient's very first reply. We don't know their language yet,
// so we transcribe this one clip against every candidate language and trust
// whichever one Azure was most confident about. That same clip doubles as
// the answer to the first question (name), so detecting the language costs
// us nothing extra.
exports.submitLanguageSample = onCall(async (request) => {
  const { phoneNumber, audioBase64, mimeType } = request.data || {};
  if (!phoneNumber || !audioBase64) {
    throw new HttpsError("invalid-argument", "phoneNumber and audioBase64 are required");
  }

  const creds = azureCreds();
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const result = await identifyLanguageAndTranscribe({
    audioBuffer,
    mimeType: mimeType || "audio/wav; codecs=audio/pcm; samplerate=16000",
    speechKey: creds.speechKey,
    speechRegion: creds.speechRegion
  });

  await createPatientIfMissing(phoneNumber);
  await upsertPatientProfile(phoneNumber, { preferredLanguage: result.locale });

  const nameQuestion = QUESTIONS[0]; // "What is your name?" - always first
  const englishAnswer = await translateToEnglish({ text: result.transcript, fromLanguageCode: result.locale, ...creds });
  if (englishAnswer) {
    await upsertPatientProfile(phoneNumber, { [nameQuestion.field]: englishAnswer });
  }

  const updatedProfile = await getPatientByPhone(phoneNumber);
  const nextQuestion = nextUnansweredQuestion(updatedProfile, [nameQuestion.id]);
  const questionPayload = await buildQuestionPayload(nextQuestion, result.locale);

  return {
    detectedLanguage: result.locale,
    heard: { local: result.transcript, english: englishAnswer },
    isDone: !nextQuestion,
    question: questionPayload
  };
});

// The core "listen -> transcribe -> translate -> talk back" turn, reused for
// every remaining question in the script. `answeredIds` is every question
// id already answered THIS call (not counting this one) so we know what's
// left. Same shape this will use once it moves behind USSD/telephony.
exports.answerQuestion = onCall(async (request) => {
  const { phoneNumber, questionId, audioBase64, mimeType, language, answeredIds } = request.data || {};
  if (!phoneNumber || !questionId || !audioBase64 || !language) {
    throw new HttpsError("invalid-argument", "phoneNumber, questionId, audioBase64 and language are required");
  }

  const creds = azureCreds();
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const { transcript } = await transcribe({
    audioBuffer,
    mimeType: mimeType || "audio/wav; codecs=audio/pcm; samplerate=16000",
    locale: language,
    speechKey: creds.speechKey,
    speechRegion: creds.speechRegion
  });
  const englishAnswer = await translateToEnglish({ text: transcript, fromLanguageCode: language, ...creds });

  const question = QUESTIONS.find((q) => q.id === questionId);
  if (question && question.profileField) {
    await upsertPatientProfile(phoneNumber, { [question.field]: englishAnswer });
  }

  const profile = await getPatientByPhone(phoneNumber);
  const fullyAnswered = [...(Array.isArray(answeredIds) ? answeredIds : []), questionId];
  const nextQuestion = nextUnansweredQuestion(profile, fullyAnswered);
  const questionPayload = await buildQuestionPayload(nextQuestion, language);

  return {
    questionId,
    heard: { local: transcript, english: englishAnswer },
    isDone: !nextQuestion,
    question: questionPayload
  };
});

// Called once every question has been answered. Saves everything collected
// during THIS call as one entry in patients/{phoneNumber}/history, so a
// doctor can see every past call for this patient, not just the latest one.
exports.completeIntake = onCall(async (request) => {
  const { phoneNumber, language, answers } = request.data || {};
  if (!phoneNumber || !answers) {
    throw new HttpsError("invalid-argument", "phoneNumber and answers are required");
  }

  const ambulanceText = (answers.needsAmbulance || "").toLowerCase();
  const needsAmbulanceFlag =
    ambulanceText.includes("yes") || ambulanceText.includes("ja") || ambulanceText.includes("yebo");

  const historyId = await addHistoryEntry(phoneNumber, {
    language: language || null,
    location: answers.location || null,
    symptoms: answers.symptoms || null,
    symptomDuration: answers.symptomDuration || null,
    lastVisit: answers.lastVisit || null,
    medicalHistory: answers.medicalHistory || null,
    medications: answers.medications || null,
    needsAmbulance: answers.needsAmbulance || null,
    needsAmbulanceFlag,
    emergencyContactNumber: answers.emergencyContactNumber || null,
    rawAnswers: answers.rawAnswers || []
  });

  return { historyId };
});
