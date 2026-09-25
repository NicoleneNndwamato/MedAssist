import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebaseConfig";

const startCallFn = httpsCallable(functions, "startCall");
const submitLanguageSampleFn = httpsCallable(functions, "submitLanguageSample");
const answerQuestionFn = httpsCallable(functions, "answerQuestion");
const completeIntakeFn = httpsCallable(functions, "completeIntake");

export async function startCall(phoneNumber) {
  const result = await startCallFn({ phoneNumber });
  return result.data;
}

export async function submitLanguageSample(phoneNumber, audioBase64, mimeType) {
  const result = await submitLanguageSampleFn({ phoneNumber, audioBase64, mimeType });
  return result.data;
}

export async function answerQuestion({ phoneNumber, questionId, audioBase64, mimeType, language, answeredIds }) {
  const result = await answerQuestionFn({ phoneNumber, questionId, audioBase64, mimeType, language, answeredIds });
  return result.data;
}

export async function completeIntake({ phoneNumber, language, answers }) {
  const result = await completeIntakeFn({ phoneNumber, language, answers });
  return result.data;
}
