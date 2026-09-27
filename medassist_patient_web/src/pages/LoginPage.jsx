import React, { useState } from 'react';
import { SUPPORTED_LANGUAGES } from '../data/questions';
import { signInWithGoogle, getPatientProfile, createPatientProfile } from '../services/firestoreService';

const svgG = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 45c5.3 0 10.2-2 13.9-5.4l-6.4-5.4C29.4 35.7 26.8 36.5 24 36.5c-5.3 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.6 40.4 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.4 5.4C40.9 36.3 45 30.7 45 24c0-1.4-.1-2.7-.4-3.5z"/></svg>`;

export default function LoginPage({ onLogin }) {
  const [step, setStep] = useState('signin'); // signin | register
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      setFirebaseUser(user);
      const existing = await getPatientProfile(user.uid);
      if (existing) {
        onLogin(existing);
      } else {
        setStep('register');
      }
    } catch (err) {
      setError('Google sign-in failed or was cancelled. Please try again.');
    }
    setLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    const profile = await createPatientProfile(firebaseUser.uid, {
      name: firebaseUser.displayName,
      email: firebaseUser.email,
      age,
      phone,
      language,
    });
    setLoading(false);
    onLogin(profile);
  }

  if (step === 'register') {
    return (
      <div className="auth">
        <div className="authCard">
          <div className="brand"><span className="dot" /> MEDASSIST</div>
          <h1>Finish setting up</h1>
          <p>Just a couple of details, then the chat will speak your language from here on.</p>
          <form onSubmit={handleRegister}>
            <label>Age</label>
            <input type="number" min="0" max="120" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 34" required />
            <label>Phone (optional — links your record if you ever call in instead)</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 071 234 5678" />
            <label>Preferred language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
              {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button className="primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Continue'}</button>
          </form>
          <small>Signed in as {firebaseUser?.email}. You can change your language anytime in Settings.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="authCard">
        <div className="brand"><span className="dot" /> MEDASSIST</div>
        <h1>Patient sign-in</h1>
        <p>Type your check-in instead of calling — sign in with Google to get started.</p>
        <button className="gbtn" onClick={handleGoogle} disabled={loading}>
          <span className="gicon" dangerouslySetInnerHTML={{ __html: svgG }} />
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>
        {error && <div className="error">{error}</div>}
        <small>
          By continuing you agree to let MedAssist store your check-ins so a healthcare worker can
          review them and follow up with you. First-time sign-in will also ask your preferred
          language — the chat will speak to you in that language every time after.
        </small>
      </div>
    </div>
  );
}
