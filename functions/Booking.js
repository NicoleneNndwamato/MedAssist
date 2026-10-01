const admin = require("firebase-admin");
const { SUPPORTED_LANGUAGES } = require("../config/languages");

// ---------------------------------------------------------------------------
// Appointment booking, decided entirely in CODE (never by the AI), so the
// caller is only ever told a time/doctor/hospital that really got saved.
//
// Urgency tiers (from the agent's `priority`):
//   EMERGENCY  IMMEDIATE, VERY_URGENT (or ambulance flag)
//              -> booked automatically ~30 minutes from now, no questions
//   URGENT     URGENT
//              -> earliest free slot, any day of the week
//   ROUTINE    STANDARD, NON_URGENT
//              -> the free slot closest to the time the patient said they
//                 are available (weekdays only)
//
// "Near them" = a facility whose `location` (city) matches the patient's
// area. Facilities have no map coordinates in the database, so this is a
// city match. "Available doctor" = a doctor at that facility with no other
// appointment inside the same 30-minute slot.
// ---------------------------------------------------------------------------

// ---- Tunable settings -----------------------------------------------------
const TZ = "Africa/Johannesburg";
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000; // South Africa has no daylight saving
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_START_HOUR = 8; // first appointment 08:00
const DAY_END_HOUR = 17; // last appointment starts 16:30
const SEARCH_DAYS = 14; // how far ahead we look for a free slot
const MIN_LEAD_MINUTES = 30; // never book a routine/urgent slot sooner than this
const EMERGENCY_LEAD_MINUTES = 30;
const CITY_CACHE_MS = 5 * 60 * 1000;

const PRIORITIES = ["IMMEDIATE", "VERY_URGENT", "URGENT", "STANDARD", "NON_URGENT"];

function db() {
  return admin.firestore();
}

// ---- Priority helpers -----------------------------------------------------
function normalizePriority(value) {
  if (!value) return null;
  const p = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
  return PRIORITIES.includes(p) ? p : null;
}

function tierOf(priority, needsAmbulanceFlag) {
  const p = normalizePriority(priority);
  if (needsAmbulanceFlag || p === "IMMEDIATE" || p === "VERY_URGENT") return "EMERGENCY";
  if (p === "URGENT") return "URGENT";
  return "ROUTINE";
}

// ---- Time helpers (everything is interpreted as South African time) --------
function pad(n) {
  return String(n).padStart(2, "0");
}

function sastParts(date) {
  const d = new Date(date.getTime() + SAST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    weekday: d.getUTCDay() // 0 = Sunday
  };
}

function fromSast(y, m, d, h, min) {
  return new Date(Date.UTC(y, m, d, h, min) - SAST_OFFSET_MS);
}

// "2026-10-02T10:00" (South African time) -> Date, or null if unusable.
function parsePreferred(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(String(text || "").trim());
  if (!m) return null;
  const date = fromSast(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toSastIso(date) {
  const p = sastParts(date);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// "Tuesday 6 October at 10:30" - easy to read aloud on a phone call.
function spokenDateTime(date) {
  const p = sastParts(date);
  return `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m]} at ${pad(p.h)}:${pad(p.min)}`;
}

// Used in the agent's prompt so it can turn "tomorrow at 10" into a real date.
function nowForPrompt(now = new Date()) {
  const p = sastParts(now);
  return `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m]} ${p.y}, ${pad(p.h)}:${pad(p.min)} (South Africa time). In the format used below that is ${toSastIso(now)}`;
}

// ---- Facilities / cities --------------------------------------------------
let facilityCache = { at: 0, list: [] };

async function getFacilities() {
  if (facilityCache.list.length && Date.now() - facilityCache.at < CITY_CACHE_MS) {
    return facilityCache.list;
  }
  const snap = await db().collection("facilities").get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.active !== false);
  facilityCache = { at: Date.now(), list };
  return list;
}

async function getCities() {
  const facilities = await getFacilities();
  return [...new Set(facilities.map((f) => f.location).filter(Boolean))];
}

// Works out which facility city the patient is closest to: first from the
// agent's own `nearestCity`, then by looking for a city name in what they said.
function resolveCity(summary, cities) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const list = cities || [];
  const findIn = (text) => {
    const t = norm(text);
    return t ? list.find((c) => t.includes(norm(c))) || null : null;
  };
  const exact = list.find((c) => norm(summary && summary.nearestCity) === norm(c));
  return exact || findIn(summary && summary.nearestCity) || findIn(summary && summary.location) || null;
}

// ---- Slot search ----------------------------------------------------------
function candidateSlots(target, now, { weekdaysOnly }) {
  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60 * 1000);
  const horizon = new Date(now.getTime() + SEARCH_DAYS * 24 * 60 * 60 * 1000);
  const first = sastParts(earliest);
  const slots = [];

  for (let dayOffset = 0; dayOffset <= SEARCH_DAYS; dayOffset++) {
    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
      for (let min = 0; min < 60; min += SLOT_MINUTES) {
        const t = fromSast(first.y, first.m, first.d + dayOffset, hour, min);
        const wd = sastParts(t).weekday;
        if (weekdaysOnly && (wd === 0 || wd === 6)) continue;
        if (t >= earliest && t <= horizon) slots.push(t);
      }
    }
  }
  // Closest to what the patient asked for first; on a tie, the earlier one.
  slots.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  return slots;
}

async function loadBusyTimes(now) {
  const since = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - SLOT_MS));
  const snap = await db().collection("appointments").where("scheduledAt", ">=", since).get();
  const busy = new Map(); // doctorId -> [ms, ms, ...]
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!data.doctorId || !data.scheduledAt) return;
    const ms = data.scheduledAt.toMillis ? data.scheduledAt.toMillis() : new Date(data.scheduledAt).getTime();
    if (!busy.has(data.doctorId)) busy.set(data.doctorId, []);
    busy.get(data.doctorId).push(ms);
  });
  return busy;
}

function isFree(busy, doctorId, startMs) {
  return !(busy.get(doctorId) || []).some((t) => Math.abs(t - startMs) < SLOT_MS);
}

// ---- Writing the appointment ---------------------------------------------
function buildAppointment({ summary, priority, needsAmbulanceFlag, language, transcriptText, source, patientId, facility, doctor, when, extra }) {
  const fullName = `${summary.name || ""} ${summary.surname || ""}`.trim() || "Unknown caller";
  const symptoms = [summary.symptoms, summary.symptomDuration ? `(for ${summary.symptomDuration})` : null]
    .filter(Boolean)
    .join(" ");

  return {
    patientId,
    patientName: fullName,
    patientAge: summary.age ?? null,
    patientLanguage: (SUPPORTED_LANGUAGES[language] && SUPPORTED_LANGUAGES[language].label) || language || null,
    patientPhone: patientId && !String(patientId).startsWith("chat-") ? patientId : null,
    emergencyContactNumber: summary.emergencyContactNumber ?? null,
    facilityId: facility ? facility.id : null,
    facilityName: facility ? facility.name : null,
    doctorId: doctor ? doctor.id : null,
    doctorName: doctor ? doctor.name : null,
    location: summary.location ?? null,
    symptomsSummary: symptoms || null,
    medicalHistory: summary.medicalHistory ?? null,
    medications: summary.medications ?? null,
    lastVisit: summary.lastVisit ?? null,
    transcript: transcriptText || "",
    aiPriority: priority || "STANDARD",
    humanPriority: null,
    status: "AWAITING_REVIEW", // staff still confirm the AI's priority
    appointmentStatus: when ? "BOOKED" : "NEEDS_MANUAL_BOOKING",
    scheduledAt: when ? admin.firestore.Timestamp.fromDate(when) : null,
    scheduledLabel: when ? spokenDateTime(when) : null,
    transportRequested: !!needsAmbulanceFlag,
    bookedBy: "MedAssist",
    source: source || "phone",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra
  };
}

async function writeAppointment({ ref, data, facility, lockId }) {
  const firestore = db();

  await firestore.runTransaction(async (tx) => {
    if (lockId) {
      const lockRef = firestore.collection("doctorSlots").doc(lockId);
      const lock = await tx.get(lockRef);
      if (lock.exists) {
        const err = new Error("SLOT_TAKEN");
        err.code = "SLOT_TAKEN";
        throw err;
      }
      tx.set(lockRef, { doctorId: data.doctorId, appointmentId: ref.id, scheduledAt: data.scheduledAt });
    }
    tx.set(ref, data);
    if (facility) {
      tx.set(firestore.collection("facilities").doc(facility.id).collection("incoming").doc(ref.id), {
        appointmentId: ref.id,
        patientId: data.patientId,
        patientName: data.patientName,
        aiPriority: data.aiPriority,
        status: data.status,
        scheduledAt: data.scheduledAt,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });
}

// ---- Spoken confirmations (English; translated + spoken by the call flow) --
function confirmationText({ tier, facility, doctor, when, preferred }) {
  const where = facility ? facility.name : "the hospital";
  const who = doctor ? ` with ${doctor.name}` : "";

  if (!when) {
    return "I could not find a free appointment right now, but I have sent your details to the hospital team and they will contact you shortly. Please take care. Goodbye.";
  }

  if (tier === "EMERGENCY") {
    return (
      `This sounds urgent, so I have booked you at ${where}${who} for ${spokenDateTime(when)}, which is in about 30 minutes. ` +
      "Please go there now. If you cannot get there safely, call 10177 for an ambulance. Goodbye."
    );
  }

  const notExact =
    tier === "ROUTINE" && preferred && Math.abs(when - preferred) >= 60 * 60 * 1000
      ? "That exact time was not free, so this is the closest available. "
      : "";

  return (
    `${notExact}I have booked you at ${where}${who} for ${spokenDateTime(when)}. ` +
    "Please arrive 15 minutes early and bring your ID. Take care. Goodbye."
  );
}

// ---- The main entry point -------------------------------------------------
// Returns { appointmentId, booked, tier, facilityName, doctorName, scheduledAt, confirmationText }.
async function bookAppointment({
  patientId,
  summary,
  needsAmbulanceFlag,
  language,
  transcriptText,
  source,
  now = new Date()
}) {
  const priority = normalizePriority(summary.priority);
  const tier = tierOf(priority, needsAmbulanceFlag);
  const preferred = parsePreferred(summary.preferredDateTime);

  const facilities = await getFacilities();
  const cities = [...new Set(facilities.map((f) => f.location).filter(Boolean))];
  const city = resolveCity(summary, cities);
  const inCity = city ? facilities.filter((f) => f.location === city) : [];
  const poolFacilities = inCity.length ? inCity : facilities; // nothing matched: any hospital

  const doctorSnap = await db().collection("doctors").get();
  const allDoctors = doctorSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.active !== false);
  const doctorsIn = (list) => allDoctors.filter((d) => list.some((f) => f.id === d.facilityId));
  const facilityOf = (doctor) => facilities.find((f) => f.id === doctor.facilityId) || null;

  const ref = db().collection("appointments").doc();
  const common = { summary, priority, needsAmbulanceFlag, language, transcriptText, source, patientId };
  const busy = await loadBusyTimes(now);

  let chosen = null; // { facility, doctor, when, lockId }

  if (tier === "EMERGENCY") {
    const raw = now.getTime() + EMERGENCY_LEAD_MINUTES * 60 * 1000;
    const when = new Date(Math.ceil(raw / (5 * 60 * 1000)) * 5 * 60 * 1000); // round up to 5 min
    const local = doctorsIn(poolFacilities);
    const ordered = [
      ...local.filter((d) => /emergency/i.test(d.role || "")),
      ...local.filter((d) => !/emergency/i.test(d.role || ""))
    ];
    const free = ordered.find((d) => isFree(busy, d.id, when.getTime()));
    // Emergencies are booked even if the doctor is busy - staff are alerted.
    const doctor = free || ordered[0] || null;
    chosen = {
      facility: doctor ? facilityOf(doctor) : poolFacilities[0] || null,
      doctor,
      when,
      lockId: null,
      extra: free || !doctor ? {} : { overbooked: true }
    };
  } else {
    const target = tier === "ROUTINE" && preferred ? preferred : now;
    const slots = candidateSlots(target, now, { weekdaysOnly: tier === "ROUTINE" });
    const doctors = doctorsIn(poolFacilities);

    for (const slot of slots) {
      const freeDoctors = doctors.filter((d) => isFree(busy, d.id, slot.getTime()));
      for (const doctor of freeDoctors) {
        const facility = facilityOf(doctor);
        const lockId = `${doctor.id}_${slot.getTime()}`;
        const data = buildAppointment({ ...common, facility, doctor, when: slot, extra: {} });
        try {
          // eslint-disable-next-line no-await-in-loop
          await writeAppointment({ ref, data, facility, lockId });
          chosen = { facility, doctor, when: slot, written: true };
        } catch (err) {
          if (err.code !== "SLOT_TAKEN") throw err; // someone else just took it - try the next one
        }
        if (chosen) break;
      }
      if (chosen) break;
    }
  }

  if (chosen && !chosen.written) {
    const data = buildAppointment({ ...common, facility: chosen.facility, doctor: chosen.doctor, when: chosen.when, extra: chosen.extra || {} });
    await writeAppointment({ ref, data, facility: chosen.facility, lockId: null });
  }

  // Nothing free (or no doctors on file): still record the request so staff can phone the patient.
  if (!chosen) {
    const facility = poolFacilities[0] || null;
    const data = buildAppointment({ ...common, facility, doctor: null, when: null, extra: {} });
    await writeAppointment({ ref, data, facility, lockId: null });
    return {
      appointmentId: ref.id,
      booked: false,
      tier,
      facilityName: facility ? facility.name : null,
      doctorName: null,
      scheduledAt: null,
      confirmationText: confirmationText({ tier, facility, doctor: null, when: null, preferred })
    };
  }

  return {
    appointmentId: ref.id,
    booked: true,
    tier,
    facilityName: chosen.facility ? chosen.facility.name : null,
    doctorName: chosen.doctor ? chosen.doctor.name : null,
    scheduledAt: chosen.when,
    confirmationText: confirmationText({ tier, facility: chosen.facility, doctor: chosen.doctor, when: chosen.when, preferred })
  };
}

module.exports = {
  PRIORITIES,
  normalizePriority,
  tierOf,
  parsePreferred,
  toSastIso,
  spokenDateTime,
  nowForPrompt,
  getCities,
  resolveCity,
  bookAppointment,
  candidateSlots
};