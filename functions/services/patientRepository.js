const admin = require("firebase-admin");

// Patients are keyed by phone number (the doc ID IS the phone number) so a
// returning caller can always be found by the number they're calling from.
//
// patients/{phoneNumber}
//   phoneNumber, name, surname, age, provider, preferredLanguage, ...
//
// patients/{phoneNumber}/history/{autoId}
//   one document per past call, so a doctor can see everything this
//   patient has ever reported - not just today's call.

function db() {
  return admin.firestore();
}

async function getPatientByPhone(phoneNumber) {
  const snap = await db().collection("patients").doc(phoneNumber).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createPatientIfMissing(phoneNumber) {
  const existing = await getPatientByPhone(phoneNumber);
  if (existing) return existing;

  await db()
    .collection("patients")
    .doc(phoneNumber)
    .set({
      phoneNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  return { id: phoneNumber, phoneNumber };
}

async function upsertPatientProfile(phoneNumber, fields) {
  await db()
    .collection("patients")
    .doc(phoneNumber)
    .set(
      { ...fields, phoneNumber, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
}

async function addHistoryEntry(phoneNumber, entry) {
  const ref = await db()
    .collection("patients")
    .doc(phoneNumber)
    .collection("history")
    .add({ ...entry, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return ref.id;
}

module.exports = { getPatientByPhone, createPatientIfMissing, upsertPatientProfile, addHistoryEntry };
