import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDQWyNKFfscqQq1NRYCKkpZwEvLlf5ea-E",
  authDomain: "medassist-397be.firebaseapp.com",
  projectId: "medassist-397be",
  storageBucket: "medassist-397be.firebasestorage.app",
  messagingSenderId: "39614620161",
  appId: "1:39614620161:web:62afbb4db55c65aefe9600"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app);