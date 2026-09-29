const admin = require("firebase-admin");

function db() {
  return admin.firestore();
}

// One ephemeral document per in-progress conversation. Phone calls are
// keyed by SignalWire's CallSid (collection "callSessions" - the default);
// website chats are keyed by a client-generated sessionId (pass collection
// = "chatSessions"). Same shape either way: conversationHistory (Gemini's
// running transcript), summary (the agent's best-current understanding of
// the intake fields), transcript (human-readable log), language, retries.
//
// Each webhook/request is a fresh, stateless HTTP call, so this is what
// remembers "where were we" between one turn and the next.
async function createSession(id, data, collection = "callSessions") {
  await db()
    .collection(collection)
    .doc(id)
    .set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function getSession(id, collection = "callSessions") {
  const snap = await db().collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
}

async function updateSession(id, fields, collection = "callSessions") {
  await db().collection(collection).doc(id).set(fields, { merge: true });
}

module.exports = { createSession, getSession, updateSession };
