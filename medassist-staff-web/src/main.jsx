import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginPage from './pages/LoginPage';
import HospitalShell from './pages/HospitalShell';
import EmergencyOperatorPage from './pages/EmergencyOperatorPage';
import ParamedicPage from './pages/ParamedicPage';
import { ToastHost } from './components/Toast';
import './styles.css';

// Which portal a staff member lands on is decided purely by their role in
// the `staff` Firestore collection — there is no manual role switcher.
// Emergency Operators go straight to the emergency queue, Paramedics/EMTs
// go straight to the handoff queue, and every other hospital role (Doctor,
// Emergency Doctor, Nurse, Hospital Administrator) gets the full sidebar
// dashboard.
function portalFor(role) {
  if (role === 'Emergency Operator') return 'operator';
  if (role === 'Paramedic / EMT') return 'ems';
  return 'hospital';
}

function LoggedOutScreen({ onReturn }) {
  return (
    <div className="logout-overlay">
      <div className="obox">
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>You've been logged out</div>
        <div className="subtle" style={{ color: '#cbd5e1', marginBottom: 18 }}>Your MedAssist session has ended.</div>
        <button className="btn btn-primary" onClick={onReturn}>Return to sign in</button>
      </div>
    </div>
  );
}

function App() {
  const [staff, setStaff] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);

  function handleLogin(staffRecord) {
    setStaff(staffRecord);
    setLoggedOut(false);
  }
  function handleLogout() {
    setStaff(null);
    setLoggedOut(true);
  }

  if (loggedOut) return <LoggedOutScreen onReturn={() => setLoggedOut(false)} />;
  if (!staff) return <LoginPage onLogin={handleLogin} />;

  const portal = portalFor(staff.role);
  if (portal === 'operator') return <EmergencyOperatorPage staff={staff} onLogout={handleLogout} />;
  if (portal === 'ems') return <ParamedicPage staff={staff} onLogout={handleLogout} />;
  return <HospitalShell staff={staff} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <ToastHost />
  </>
);
