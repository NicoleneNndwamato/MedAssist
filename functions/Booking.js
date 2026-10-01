const admin = require("firebase-admin");
const { SUPPORTED_LANGUAGES } = require("./config/languages");

const TZ = "Africa/Johannesburg";
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 17;
const SEARCH_DAYS = 14;
const MIN_LEAD_MINUTES = 30;
const EMERGENCY_LEAD_MINUTES = 30;
const CITY_CACHE_MS = 5 * 60 * 1000;

const PRIORITIES = ["IMMEDIATE", "VERY_URGENT", "URGENT", "STANDARD", "NON_URGENT"];

function db() {
  return admin.firestore();
}

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
    weekday: d.getUTCDay()
  };
}

function fromSast(y, m, d, h, min) {
  return new Date(Date.UTC(y, m, d, h, min) - SAST_OFFSET_MS);
}

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

function spokenDateTime(date) {
  const p = sastParts(date);
  return `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m]} at ${pad(p.h)}:${pad(p.min)}`;
}

function nowForPrompt(now = new Date()) {
  const p = sastParts(now);
  return `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m]} ${p.y}, ${pad(p.h)}:${pad(p.min)} (South Africa time). In the format used below that is ${toSastIso(now)}`;
}

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

  slots.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  return slots;
}

async function loadBusyTimes(now) {
  const since = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - SLOT_MS));
  const snap = await db().collection("appointments").where("scheduledAt", ">=", since).get();
  const busy = new Map();
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
    status: "AWAITING_REVIEW",
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
  const poolFacilities = inCity.length ? inCity : facilities;

  const doctorSnap = await db().collection("doctors").get();
  const allDoctors = doctorSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.active !== false);
  const doctorsIn = (list) => allDoctors.filter((d) => list.some((f) => f.id === d.facilityId));
  const facilityOf = (doctor) => facilities.find((f) => f.id === doctor.facilityId) || null;

  const ref = db().collection("appointments").doc();
  const common = { summary, priority, needsAmbulanceFlag, language, transcriptText, source, patientId };
  const busy = await loadBusyTimes(now);

  let chosen = null;

  if (tier === "EMERGENCY") {
    const raw = now.getTime() + EMERGENCY_LEAD_MINUTES * 60 * 1000;
    const when = new Date(Math.ceil(raw / (5 * 60 * 1000)) * 5 * 60 * 1000);
    const local = doctorsIn(poolFacilities);
    const ordered = [
      ...local.filter((d) => /emergency/i.test(d.role || "")),
      ...local.filter((d) => !/emergency/i.test(d.role || ""))
    ];
    const free = ordered.find((d) => isFree(busy, d.id, when.getTime()));

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

          await writeAppointment({ ref, data, facility, lockId });
          chosen = { facility, doctor, when: slot, written: true };
        } catch (err) {
          if (err.code !== "SLOT_TAKEN") throw err;
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