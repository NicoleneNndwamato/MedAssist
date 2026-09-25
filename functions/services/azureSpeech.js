const fetch = require("node-fetch");
const { SUPPORTED_LANGUAGES, CANDIDATE_LANGUAGES } = require("../config/languages");

function sttEndpoint(region, locale) {
  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
}

// Transcribes one audio clip against a single locale, returning the
// transcript plus Azure's own confidence score for that attempt.
async function transcribeOnce({ audioBuffer, mimeType, locale, speechKey, speechRegion }) {
  const response = await fetch(sttEndpoint(speechRegion, locale), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": mimeType
    },
    body: audioBuffer
  });

  if (!response.ok) {
    return { locale, transcript: "", confidence: 0 };
  }

  const data = await response.json();
  if (data.RecognitionStatus !== "Success" || !data.NBest || !data.NBest.length) {
    return { locale, transcript: "", confidence: 0 };
  }

  const best = data.NBest[0];
  return {
    locale,
    transcript: best.Display || best.Lexical || "",
    confidence: best.Confidence || 0
  };
}

// Hackathon stand-in for real streaming language identification: a plain
// REST call can't do live language ID the way the full Speech SDK can, so
// instead we transcribe the SAME clip against every candidate locale in
// parallel and trust whichever one Azure was most confident about. Works
// fine for 3 languages. If this grows to many languages, swap this for the
// Speech SDK's continuous language identification instead.
async function identifyLanguageAndTranscribe({
  audioBuffer,
  mimeType,
  speechKey,
  speechRegion,
  candidates = CANDIDATE_LANGUAGES
}) {
  const attempts = await Promise.all(
    candidates.map((locale) => transcribeOnce({ audioBuffer, mimeType, locale, speechKey, speechRegion }))
  );

  const best = attempts.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return best.transcript ? best : { locale: candidates[0], transcript: "", confidence: 0 };
}

// Transcribes against a single, already-known locale - used once we know
// which language a patient (new or returning) speaks.
async function transcribe({ audioBuffer, mimeType, locale, speechKey, speechRegion }) {
  return transcribeOnce({ audioBuffer, mimeType, locale, speechKey, speechRegion });
}

function escapeSsml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Synthesizes speech for `text` in the given language and returns raw MP3
// bytes. This is the exact building block that will get reused later when
// this logic moves behind USSD/telephony instead of the app's speaker.
async function synthesizeSpeech({ text, languageCode, speechKey, speechRegion }) {
  const lang = SUPPORTED_LANGUAGES[languageCode] || SUPPORTED_LANGUAGES["en-ZA"];
  const ssml = `<speak version="1.0" xml:lang="${lang.sttLocale}"><voice name="${lang.ttsVoice}">${escapeSsml(
    text
  )}</voice></speak>`;

  const response = await fetch(`https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-64kbitrate-mono-mp3",
      "User-Agent": "MedAssist"
    },
    body: ssml
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure TTS error: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { identifyLanguageAndTranscribe, transcribe, synthesizeSpeech };
