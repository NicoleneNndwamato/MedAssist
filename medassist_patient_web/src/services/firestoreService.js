import {
  collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, query, where, Timestamp,
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, googleProvider } from '../firebase';

// ---------- Auth ----------
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}
export function logOut() {
  return signOut(auth);
}

// ---------- Patient profile (keyed by Firebase Auth uid) ----------
export async function getPatientProfile(uid) {
  const snap = await getDoc(doc(db, 'patients', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPatientProfile(uid, { name, email, age, phone, language }) {
  const profile = {
    authUid: uid, name, email, age: age || null, phone: phone || '',
    language, source: 'web', createdAt: Timestamp.now(),
  };
  await setDoc(doc(db, 'patients', uid), profile);
  return { id: uid, ...profile };
}

export async function updatePatientLanguage(uid, language) {
  await updateDoc(doc(db, 'patients', uid), { language });
}

export async function updatePatientSettings(uid, settings) {
  await updateDoc(doc(db, 'patients', uid), settings);
}

// ---------- Check-ins / appointments ----------
// Written into the same `appointments` collection the staff dashboard reads,
// so a typed web check-in shows up in the hospital queue exactly like a
// voice-call case would.
function assessPriority(answers) {
  const ambulance = /\byes\b|\byebo\b|\bja\b/i.test(answers.ambulance || '');
  if (ambulance) return 'IMMEDIATE';
  const redFlags = /chest pain|can'?t breathe|difficulty breathing|unconscious|severe bleeding/i;
  if (redFlags.test(answers.symptoms || '')) return 'VERY_URGENT';
  return 'STANDARD';
}

export async function submitCheckIn(patient, answers) {
  const aiPriority = assessPriority(answers);
  const transcript = Object.entries(answers).map(([, v]) => v).join('\n');
  const appointment = {
    patientId: patient.id,
    authUid: patient.id,
    patientName: answers.name || patient.name,
    patientAge: Number(answers.age) || patient.age || null,
    patientLanguage: patient.language,
    patientPhone: patient.phone || '',
    location: answers.location || '',
    symptomsSummary: answers.symptoms || '',
    medicalHistory: answers.pastHistory || 'None reported',
    medications: answers.medication || 'None reported',
    medicationReason: '',
    transcript,
    aiPriority,
    humanPriority: null,
    status: 'AWAITING_REVIEW',
    transportRequested: aiPriority === 'IMMEDIATE',
    emergencyContact: answers.emergencyContact || '',
    source: 'web-chat',
    createdAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, 'appointments'), appointment);
  return { id: ref.id, ...appointment };
}

export async function listMyCheckIns(uid) {
  const snap = await getDocs(query(collection(db, 'appointments'), where('authUid', '==', uid)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
