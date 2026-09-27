import React, { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { findStaffByEmail } from '../services/firestoreService';

const DEMO_ACCOUNTS = [
  { label: 'Doctor', email: 'naledi.mokoena@medassist.demo' },
  { label: 'Nurse', email: 'nomsa.nkosi@medassist.demo' },
  { label: 'Emergency Operator', email: 'lindiwe.mabuza@medassist.demo' },
  { label: 'Paramedic / EMT', email: 'mpho.radebe@medassist.demo' },
];

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState('MED-2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const staff = await findStaffByEmail(email.trim().toLowerCase());
      if (!staff) {
        setError('No staff record found for that email. Try one of the demo accounts below, or run npm run seed:mock.');
        setLoading(false);
        return;
      }
      if (staff.active === false) {
        setError('This staff identity has been deactivated.');
        setLoading(false);
        return;
      }
      onLogin(staff);
    } catch (err) {
      setError('Could not reach Firestore. Check your connection and Firebase config.');
    }
    setLoading(false);
  }

  return (
    <div className="auth">
      <div className="authCard">
        <div className="brand"><Stethoscope /> MedAssist <span>Staff</span></div>
        <h1>Staff sign in</h1>
        <p>For doctors, nurses, emergency operators and paramedics/EMTs.</p>
        <form onSubmit={handleSubmit}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Work email" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          <button className="primary" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        <small>
          Prototype authentication only — this looks up your role from the <code>staff</code> Firestore
          collection by email and does not verify the password. Replace with verified Firebase
          Authentication before production. Your dashboard is chosen automatically from your role:
          hospital roles land on the clinical dashboard, Emergency Operators land on the emergency
          queue, and Paramedics/EMTs land on the handoff queue.
        </small>
        <div className="demoRow">
          {DEMO_ACCOUNTS.map(acc => (
            <button type="button" key={acc.email} onClick={() => setEmail(acc.email)}>{acc.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
