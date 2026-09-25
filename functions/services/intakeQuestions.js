// The MedAssist phone/voice intake script.
//
// Each question is authored once, in English - azureTranslate.js translates
// it into whichever language the patient is speaking, on demand, and caches
// the result. This means adding a new language later is just adding it to
// languages.js, not re-writing every question by hand.
//
// `profileField: true`  -> the answer is saved on the patient's permanent
//                          profile (name, surname, age, network provider)
//                          and is asked ONCE, ever.
// `profileField: false` -> the answer only matters for this call, and gets
//                          saved into this call's entry in the patient's
//                          `history` subcollection (symptoms, duration, etc).
// `skipIfKnown: true`   -> if we already have this field on file for this
//                          phone number, don't ask again on future calls.
const QUESTIONS = [
  {
    id: "name",
    text: "What is your name?",
    field: "name",
    profileField: true,
    skipIfKnown: true
  },
  {
    id: "surname",
    text: "What is your surname?",
    field: "surname",
    profileField: true,
    skipIfKnown: true
  },
  {
    id: "age",
    text: "How old are you?",
    field: "age",
    profileField: true,
    skipIfKnown: true
  },
  {
    id: "provider",
    text: "Which cellphone network are you using? For example Vodacom, MTN, Cell C, or Telkom.",
    field: "provider",
    profileField: true,
    skipIfKnown: true
  },
  {
    id: "location",
    text: "Where are you right now? Please tell us your address or the name of the area.",
    field: "location",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "symptoms",
    text: "What symptoms are you experiencing?",
    field: "symptoms",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "symptomDuration",
    text: "How long have you been feeling this way?",
    field: "symptomDuration",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "lastVisit",
    text: "When was the last time you visited a hospital or clinic?",
    field: "lastVisit",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "medicalHistory",
    text: "Have you had any illnesses, other conditions, or surgery in the past? If so, please tell us.",
    field: "medicalHistory",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "medications",
    text: "Are you currently taking any medication? If yes, please tell us what it is and what it is for.",
    field: "medications",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "ambulance",
    text: "Do you need an ambulance right now?",
    field: "needsAmbulance",
    profileField: false,
    skipIfKnown: false
  },
  {
    id: "emergencyContact",
    text: "Please give us an emergency contact number we can call if we are not able to reach you.",
    field: "emergencyContactNumber",
    profileField: false,
    skipIfKnown: false
  }
];

function questionById(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

// Finds the next question the patient still needs to answer this call,
// skipping profile questions we already have an answer for from a
// previous call (skipIfKnown), and anything already answered THIS call.
function nextUnansweredQuestion(profile, answeredIds) {
  return (
    QUESTIONS.find((q) => {
      if (answeredIds.includes(q.id)) return false;
      if (
        q.skipIfKnown &&
        profile &&
        profile[q.field] !== undefined &&
        profile[q.field] !== null &&
        profile[q.field] !== ""
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

module.exports = { QUESTIONS, questionById, nextUnansweredQuestion };
