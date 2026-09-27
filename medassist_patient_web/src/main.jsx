import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginPage from './pages/LoginPage';
import PatientShell from './pages/PatientShell';
import { ToastHost } from './components/Toast';
import { watchAuth, getPatientProfile, logOut } from './services/firestoreService';
import './styles.css';

function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    // Restores the session on page refresh: if Firebase already has a signed-in
    // user, load their patient profile straight away instead of showing the
    // sign-in screen again.
    const unsubscribe = watchAuth(async (user) => {
      if (user) {
        const profile = await getPatientProfile(user.uid);
        setPatient(profile); // null profile (mid-registration) is handled by LoginPage's own flow
      } else {
        setPatient(null);
      }
      setCheckingAuth(false);
    });
    return unsubscribe;
  }, []);

  async function handleLogout() {
    await logOut();
    setPatient(null);
  }

  if (checkingAuth) return null;
  if (!patient) return <LoginPage onLogin={setPatient} />;
  return <PatientShell patient={patient} onPatientUpdate={setPatient} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <ToastHost />
  </>
);
