import React, { useState } from 'react';
import { toast } from '../components/Toast';

export default function SettingsPage({ staff }) {
  const [alertsNew, setAlertsNew] = useState(true);
  const [alertsEmergency, setAlertsEmergency] = useState(true);
  const [digest, setDigest] = useState(false);

  return (
    <main className="wrap">
      <div className="panel">
        <h2 className="panelTitle">Settings</h2>
        <div className="settings-list">
          <div className="settings-row"><label>Full name</label><input type="text" defaultValue={staff.name} /></div>
          <div className="settings-row"><label>Facility</label><input type="text" defaultValue={staff.facilityId || '—'} disabled /></div>
          <div className="settings-row"><label>Email</label><input type="email" defaultValue={staff.email} disabled /></div>
          <div className="settings-row"><label>Role</label><input type="text" defaultValue={staff.role} disabled /></div>
          <div className="settings-row"><label>Staff number</label><input type="text" defaultValue={staff.staffNumber} disabled /></div>

          <div className="settings-toggle">
            <div><div className="stlabel">New patient alerts</div><div className="stsub">Notify when a new case enters the queue</div></div>
            <label className="switch"><input type="checkbox" checked={alertsNew} onChange={e => setAlertsNew(e.target.checked)} /><span className="slider" /></label>
          </div>
          <div className="settings-toggle">
            <div><div className="stlabel">Emergency alerts</div><div className="stsub">Sound + push alert for emergency-priority cases</div></div>
            <label className="switch"><input type="checkbox" checked={alertsEmergency} onChange={e => setAlertsEmergency(e.target.checked)} /><span className="slider" /></label>
          </div>
          <div className="settings-toggle">
            <div><div className="stlabel">Follow-up reminders</div><div className="stsub">Daily digest of reminders due</div></div>
            <label className="switch"><input type="checkbox" checked={digest} onChange={e => setDigest(e.target.checked)} /><span className="slider" /></label>
          </div>

          <div className="actions">
            <button className="btn btn-primary" onClick={() => toast('Settings saved')}>Save changes</button>
            <button className="btn btn-outline" onClick={() => toast('Password reset link sent')}>Change password</button>
          </div>
        </div>
      </div>
    </main>
  );
}
