import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDQWyNKFfscqQq1NRYCKkpZwEvLlf5ea-E',
  authDomain: 'medassist-397be.firebaseapp.com',
  projectId: 'medassist-397be',
  storageBucket: 'medassist-397be.firebasestorage.app',
  messagingSenderId: '39614620161',
  appId: '1:39614620161:web:62afbb4db55c65aefe9600',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
