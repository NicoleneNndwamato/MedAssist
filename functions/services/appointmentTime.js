const fetch = require("node-fetch");

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_START_MIN = 7 * 60 + 30;
const DAY_END_MIN = 17 * 60;
const SLOT_STEP_MIN = 15;
const LEAD_MIN = 10;
const MAX_DAYS_AHEAD = 7;
const GROQ_MODEL = "openai/gpt-oss-120b";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

function pad(n) {
  return String(n).padStart(2, "0");
}

function sastNow(date) {
  const d = new Date(date.getTime() + SAST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), weekday: d.getUTCDay() };
}

function isoOf(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function toMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || "").trim());
  if (!m) return null;
  const value = Number(m[1]) * 60 + Number(m[2]);
  return value >= 0 && value < 24 * 60 ? value : null;
}

function slotToDate(iso, minutes) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60) - SAST_OFFSET_MS);
}

function fallbackConstraint(phrase, todayIso, weekday) {
  const t = String(phrase || "").toLowerCase();
  const anyDay = { dateFrom: todayIso, dateTo: addDaysIso(todayIso, MAX_DAYS_AHEAD), timeFrom: null, timeTo: null };
  if (!t.trim()) return anyDay;

  let result = anyDay;
  const inDays = /\b(\d+|one|two|three|four|five|six|seven)\s+days?\b/.exec(t);

  if (/\bday after tomorrow\b/.test(t)) {
    result = { ...anyDay, dateFrom: addDaysIso(todayIso, 2), dateTo: addDaysIso(todayIso, 2) };
  } else if (/\btomorrow\b/.test(t)) {
    result = { ...anyDay, dateFrom: addDaysIso(todayIso, 1), dateTo: addDaysIso(todayIso, 1) };
  } else if (inDays) {
    const n = NUMBER_WORDS[inDays[1]] || Number(inDays[1]);
    result = { ...anyDay, dateFrom: addDaysIso(todayIso, n), dateTo: addDaysIso(todayIso, n) };
  } else if (/\bnext week\b/.test(t)) {
    const toMonday = (8 - weekday) % 7 || 7;
    result = { ...anyDay, dateFrom: addDaysIso(todayIso, toMonday), dateTo: addDaysIso(todayIso, toMonday + 6) };
  } else if (/\bthis week\b/.test(t)) {
    result = { ...anyDay, dateTo: addDaysIso(todayIso, (7 - weekday) % 7) };
  } else if (/\b(now|immediate|immediately|asap|right away|urgent|today)\b/.test(t)) {
    result = { ...anyDay, dateTo: todayIso };
  }

  if (/\bmorning\b/.test(t)) return { ...result, timeFrom: "07:30", timeTo: "12:00" };
  if (/\bafternoon\b/.test(t)) return { ...result, timeFrom: "12:00", timeTo: "17:00" };
  return result;
}

function parseJson(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err2) {
      return null;
    }
  }
}

async function constraintFromModel({ phrase, apiKey, todayIso, weekday }) {
  const system = `You convert what a patient said about when they want an appointment into a date range and an optional time range. Today is ${WEEKDAYS[weekday]} ${todayIso} (South Africa time).

Reply with JSON ONLY, in exactly this shape:
{"dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD", "timeFrom": "HH:MM" or null, "timeTo": "HH:MM" or null}

Rules:
- If the patient names one exact day (for example tomorrow, in 2 days, Friday, 5 October) then dateFrom and dateTo are both that day.
- If the patient gives a range (for example this week, in the next few days, between Monday and Wednesday) then dateFrom is the first day and dateTo is the last day of that range.
- now, immediately, as soon as possible, or today means dateFrom and dateTo are both today.
- this week means today up to the coming Sunday. next week means the coming Monday to Sunday.
- If the patient gives no usable day, use today as dateFrom and 7 days from today as dateTo.
- Never return a date before today.
- timeFrom and timeTo are null unless the patient mentioned a time of day. An exact time such as at 10 or 3pm means both are that time in 24-hour format. Morning is 07:30 to 12:00. Afternoon is 12:00 to 17:00. After lunch is 13:00 to 17:00. Before noon is null to 12:00.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    timeout: 15000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: String(phrase) }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      reasoning_effort: "low"
    })
  });
  if (!response.ok) throw new Error(`Groq error ${response.status}`);

  const data = await response.json();
  const parsed = parseJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!parsed || !isoPattern.test(parsed.dateFrom) || !isoPattern.test(parsed.dateTo)) {
    throw new Error("Model returned an unusable date range");
  }
  return {
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    timeFrom: toMinutes(parsed.timeFrom) === null ? null : parsed.timeFrom,
    timeTo: toMinutes(parsed.timeTo) === null ? null : parsed.timeTo
  };
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function chooseSlot(constraint, now, random = Math.random) {
  const today = sastNow(now);
  const todayIso = isoOf(today.y, today.m, today.d);
  const maxIso = addDaysIso(todayIso, MAX_DAYS_AHEAD);
  const earliestMs = now.getTime() + LEAD_MIN * 60 * 1000;

  let dateFrom = constraint.dateFrom < todayIso ? todayIso : constraint.dateFrom;
  if (dateFrom > maxIso) dateFrom = maxIso;
  let dateTo = constraint.dateTo < dateFrom ? dateFrom : constraint.dateTo;
  if (dateTo > maxIso) dateTo = maxIso;

  let fromMin = toMinutes(constraint.timeFrom);
  let toMin = toMinutes(constraint.timeTo);
  if (fromMin === null) fromMin = DAY_START_MIN;
  if (toMin === null) toMin = DAY_END_MIN;
  fromMin = clamp(fromMin, DAY_START_MIN, DAY_END_MIN);
  toMin = clamp(toMin, DAY_START_MIN, DAY_END_MIN);
  if (fromMin > toMin) {
    fromMin = DAY_START_MIN;
    toMin = DAY_END_MIN;
  }

  function candidates(fromIso, toIso, fMin, tMin) {
    const minutesList = [];
    if (fMin === tMin) {
      minutesList.push(fMin);
    } else {
      for (let m = Math.ceil(fMin / SLOT_STEP_MIN) * SLOT_STEP_MIN; m <= tMin; m += SLOT_STEP_MIN) minutesList.push(m);
    }
    const out = [];
    for (let iso = fromIso; iso <= toIso; iso = addDaysIso(iso, 1)) {
      minutesList.forEach((m) => {
        const when = slotToDate(iso, m);
        if (when.getTime() >= earliestMs) out.push(when);
      });
    }
    return out;
  }

  const attempts = [
    () => candidates(dateFrom, dateTo, fromMin, toMin),
    () => {
      for (let iso = dateFrom; iso <= maxIso; iso = addDaysIso(iso, 1)) {
        const list = candidates(iso, iso, fromMin, toMin);
        if (list.length) return list;
      }
      return [];
    },
    () => candidates(todayIso, maxIso, DAY_START_MIN, DAY_END_MIN)
  ];

  for (const attempt of attempts) {
    const list = attempt();
    if (list.length) return list[Math.floor(random() * list.length)];
  }
  return slotToDate(addDaysIso(todayIso, 1), DAY_START_MIN);
}

async function pickAppointmentTime({ phrase, apiKey, now = new Date() }) {
  const today = sastNow(now);
  const todayIso = isoOf(today.y, today.m, today.d);

  let constraint;
  if (!phrase || !String(phrase).trim()) {
    constraint = fallbackConstraint("", todayIso, today.weekday);
  } else {
    try {
      constraint = await constraintFromModel({ phrase, apiKey, todayIso, weekday: today.weekday });
    } catch (err) {
      console.error("pickAppointmentTime: model failed, using simple rules:", err.message);
      constraint = fallbackConstraint(phrase, todayIso, today.weekday);
    }
  }
  console.log(`pickAppointmentTime: "${phrase || ""}" -> ${JSON.stringify(constraint)}`);
  return chooseSlot(constraint, now);
}

module.exports = { pickAppointmentTime, chooseSlot, fallbackConstraint };
