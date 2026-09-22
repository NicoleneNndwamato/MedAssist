import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebaseConfig";

const voiceTurnCallable = httpsCallable(functions, "voiceTurn");

export async function sendVoiceTurn(audioBase64, conversationHistory) {
  const result = await voiceTurnCallable({ audioBase64, conversationHistory });
  return result.data;
}
