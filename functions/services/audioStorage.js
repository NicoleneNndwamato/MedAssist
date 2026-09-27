const admin = require("firebase-admin");

// Saves one recorded answer clip to Firebase Cloud Storage and returns a
// URL a doctor/reviewer can play back later, alongside the transcript.
//
// Files are private by default - we hand back a signed URL instead of
// making the file public, since this is patient audio. NOTE: Cloud
// Functions' default service account signs URLs via the IAM signBlob API,
// which caps expiry at 7 days - do NOT set this longer than that or
// getSignedUrl() will throw. For anything beyond a hackathon demo, generate
// a fresh short-lived signed URL on demand when a reviewer opens the
// history entry, rather than storing one long-lived URL forever.
const SIGNED_URL_LIFETIME_MS = 1000 * 60 * 60 * 24 * 6; // 6 days

async function saveAudioClip({ phoneNumber, questionId, audioBuffer, contentType }) {
  const bucket = admin.storage().bucket();
  const filePath = `call-recordings/${phoneNumber}/${questionId}-${Date.now()}.wav`;
  const file = bucket.file(filePath);

  await file.save(audioBuffer, { contentType, resumable: false });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_LIFETIME_MS
  });

  return { path: filePath, url };
}

module.exports = { saveAudioClip };
