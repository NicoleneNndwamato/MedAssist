export const PRIORITY = {
  IMMEDIATE: { name: "IMMEDIATE", label: "Immediate - Life Threatening", weight: 5 },
  VERY_URGENT: { name: "VERY_URGENT", label: "Very Urgent", weight: 4 },
  URGENT: { name: "URGENT", label: "Urgent", weight: 3 },
  STANDARD: { name: "STANDARD", label: "Standard", weight: 2 },
  NON_URGENT: { name: "NON_URGENT", label: "Non-Urgent", weight: 1 }
};

export const questions = {
  consciousness: {
    id: "consciousness",
    text: "Is the person awake, alert, and able to respond to you?",
    options: [
      { text: "Yes, fully alert", redFlag: false, nextQuestionId: "breathing" },
      { text: "No, drowsy or unresponsive", redFlag: true, nextQuestionId: "end" }
    ]
  },
  breathing: {
    id: "breathing",
    text: "Is the person having severe difficulty breathing?",
    options: [
      { text: "No", redFlag: false, nextQuestionId: "chestPain" },
      { text: "Yes, severe difficulty", redFlag: true, nextQuestionId: "end" }
    ]
  },
  chestPain: {
    id: "chestPain",
    text: "Is there chest pain or pressure?",
    options: [
      { text: "No", redFlag: false, nextQuestionId: "bleeding" },
      { text: "Yes", redFlag: true, nextQuestionId: "end" }
    ]
  },
  bleeding: {
    id: "bleeding",
    text: "Is there heavy bleeding that won't stop?",
    options: [
      { text: "No", redFlag: false, nextQuestionId: "painLevel" },
      { text: "Yes", redFlag: true, nextQuestionId: "end" }
    ]
  },
  painLevel: {
    id: "painLevel",
    text: "On a scale of 1 to 10, how severe is the pain or discomfort?",
    options: [
      { text: "1 to 3, mild", redFlag: false, nextQuestionId: "duration" },
      { text: "4 to 6, moderate", redFlag: false, nextQuestionId: "duration" },
      { text: "7 to 10, severe", redFlag: false, nextQuestionId: "duration" }
    ]
  },
  duration: {
    id: "duration",
    text: "How long has this been going on?",
    options: [
      { text: "Less than 1 hour", redFlag: false, nextQuestionId: "end" },
      { text: "A few hours", redFlag: false, nextQuestionId: "end" },
      { text: "More than a day", redFlag: false, nextQuestionId: "end" }
    ]
  }
};

export function firstQuestion() {
  return questions.consciousness;
}

export function questionById(id) {
  return questions[id] || null;
}

export function calculatePriority(answers) {
  if (answers.some((a) => a.redFlag)) {
    return PRIORITY.IMMEDIATE;
  }
  const painAnswer = answers.find((a) => a.questionId === "painLevel")?.answerText || "";
  const durationAnswer = answers.find((a) => a.questionId === "duration")?.answerText || "";

  if (painAnswer.includes("7 to 10")) return PRIORITY.VERY_URGENT;
  if (painAnswer.includes("4 to 6") && durationAnswer.includes("Less than 1 hour")) return PRIORITY.URGENT;
  if (painAnswer.includes("4 to 6")) return PRIORITY.STANDARD;
  return PRIORITY.NON_URGENT;
}

export function comfortGuidance(priority) {
  if (priority.name === "IMMEDIATE") {
    return "Please call emergency services now. Keep the person calm, do not give them food or water, and stay with them until help arrives.";
  }
  return "While you wait, keep the person comfortable and seated or lying in a relaxed position. If anything changes suddenly or gets worse, call emergency services immediately.";
}
