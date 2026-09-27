const admin = require("firebase-admin");

function db() {
  return admin.firestore();
}

// One ephemeral document per in-progress phone call, keyed by Plivo's
// CallUUID. Each Plivo webhook POST is a fresh, stateless HTTP request, so
// this is what remembers "which question are we on and what's been said so
// far" between one <Record> and the next - there's no in-memory app state
// to hold it the way CallScreen.js used to.
async function createSession(callSid, data) {
  await db()
    .collection("callSessions")
    .doc(callSid)
    .set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function getSession(callSid) {
  const snap = await db().collection("callSessions").doc(callSid).get();
  return snap.exists ? snap.data() : null;
}

async function updateSession(callSid, fields) {
  await db().collection("callSessions").doc(callSid).set(fields, { merge: true });
}

module.exports = { createSession, getSession, updateSession };
