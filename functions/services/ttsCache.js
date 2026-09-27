const admin = require("firebase-admin");
const crypto = require("crypto");
const { synthesizeSpeech } = require("./azureSpeech");
const { translateText } = require("./azureTranslate");

// Plivo's <Play> element needs a URL it can fetch itself - it can't take
// raw audio bytes the way our old app did. So every piece of spoken text
// needs to live somewhere Plivo can reach it.
//
// There are only ~12 fixed questions x 3 languages = ~36 possible clips
// total, so we cache each one in Cloud Storage by a hash of its (language,
// translated text) - the first caller in each language pays the Azure TTS
// cost once, everyone after that reuses the same file.
const SIGNED_URL_LIFETIME_MS = 1000 * 60 * 60 * 6; // 6 hours - one phone call never takes that long

async function getSpokenAudioUrl({ text, languageCode, creds }) {
  const translated = await translateText({ text, toLanguageCode: languageCode, ...creds });
  const hash = crypto.createHash("sha1").update(`${languageCode}::${translated}`).digest("hex");
  const filePath = `tts-cache/${languageCode}/${hash}.mp3`;

  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);
  const [exists] = await file.exists();

  if (!exists) {
    const audioBuffer = await synthesizeSpeech({
      text: translated,
      languageCode,
      speechKey: creds.speechKey,
      speechRegion: creds.speechRegion
    });
    await file.save(audioBuffer, { contentType: "audio/mpeg", resumable: false });
  }

  // Signed fresh every time (cheap - no re-synthesis, just re-signing) so we
  // never risk handing Plivo an expired link, even for a cached file.
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_LIFETIME_MS });
  return { text: translated, url };
}

module.exports = { getSpokenAudioUrl };
