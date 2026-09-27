import {
  collection, getDocs, doc, updateDoc, query, where,
  addDoc, deleteDoc, Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export const PRIORITY_ORDER = { IMMEDIATE: 0, VERY_URGENT: 1, URGENT: 2, STANDARD: 3, NON_URGENT: 4 };

export const PRIORITY_META = {
  IMMEDIATE:   { label: 'Emergency',    cls: 'immediate' },
  VERY_URGENT: { label: 'Very Urgent',  cls: 'very_urgent' },
  URGENT:      { label: 'Urgent',       cls: 'urgent' },
  STANDARD:    { label: 'Standard',     cls: 'standard' },
  NON_URGENT:  { label: 'Routine',      cls: 'non_urgent' },
};

export const STATUS_OPTIONS = [
  'AWAITING_REVIEW', 'REVIEWED', 'APPOINTMENT_BOOKED', 'FOLLOW_UP_NEEDED', 'COMPLETED'
];

export function statusLabel(status) {
  if (!status) return 'Awaiting Review';
  return status.replace(/_/g, ' ').replace(/\w\S*/g, w => w[0] + w.slice(1).toLowerCase());
}

// ---------- Staff / auth (prototype: looked up by email, not verified password) ----------
export async function findStaffByEmail(email) {
  const snap = await getDocs(query(collection(db, 'staff'), where('email', '==', email)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ---------- Facilities ----------
export async function listFacilities() {
  const snap = await getDocs(collection(db, 'facilities'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Patients ----------
export async function listPatients() {
  const snap = await getDocs(collection(db, 'patients'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPatientHistory(patientId) {
  const snap = await getDocs(query(collection(db, 'patientHistory'), where('patientId', '==', patientId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getPatientAppointments(patientId) {
  const snap = await getDocs(query(collection(db, 'appointments'), where('patientId', '==', patientId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Appointments / cases ----------
export async function listAppointments() {
  const snap = await getDocs(collection(db, 'appointments'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (PRIORITY_ORDER[a.aiPriority] ?? 9) - (PRIORITY_ORDER[b.aiPriority] ?? 9));
}

export async function listAppointmentsByFacility(facilityId) {
  const snap = await getDocs(query(collection(db, 'appointments'), where('facilityId', '==', facilityId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (PRIORITY_ORDER[a.aiPriority] ?? 9) - (PRIORITY_ORDER[b.aiPriority] ?? 9));
}

export async function listEmergencyAppointments() {
  const snap = await getDocs(query(collection(db, 'appointments'), where('aiPriority', '==', 'IMMEDIATE')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateAppointmentPriority(appointmentId, priority, reviewerName) {
  await updateDoc(doc(db, 'appointments', appointmentId), {
    humanPriority: priority,
    status: 'REVIEWED',
    reviewedBy: reviewerName,
    reviewedAt: Timestamp.now(),
  });
}

export async function updateAppointmentStatus(appointmentId, status) {
  await updateDoc(doc(db, 'appointments', appointmentId), { status });
}

export async function updateHandoffStep(appointmentId, step) {
  await updateDoc(doc(db, 'appointments', appointmentId), { handoffStep: step, handoffRef: `MED-${appointmentId.slice(-4).toUpperCase()}` });
}

// ---------- Reminders (new collection, created on first use) ----------
export async function listReminders() {
  const snap = await getDocs(collection(db, 'reminders'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(a.done) - Number(b.done));
}

export async function addReminder({ patientId, patientName, note, date, createdBy }) {
  await addDoc(collection(db, 'reminders'), {
    patientId, patientName, note, date: date || 'TBD', done: false, createdBy,
    createdAt: Timestamp.now(),
  });
}

export async function toggleReminder(id, done) {
  await updateDoc(doc(db, 'reminders', id), { done });
}

export async function deleteReminder(id) {
  await deleteDoc(doc(db, 'reminders', id));
}
