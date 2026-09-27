import React, { useState } from 'react';
import { SUPPORTED_LANGUAGES } from '../data/questions';
import { updatePatientSettings } from '../services/firestoreService';
import { toast } from '../components/Toast';

export default function SettingsPage({ patient, onPatientUpdate }) {
  const [language, setLanguage] = useState(patient.language || 'English');
  const [apptReminders, setApptReminders] = useState(patient.apptReminders !== false);
  const [followUpReminders, setFollowUpReminders] = useState(patient.followUpReminders !== false);
  const [emergencyAlerts, setEmergencyAlerts] = useState(patient.emergencyAlerts !== false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const settings = { language, apptReminders, followUpReminders, emergencyAlerts };
    await updatePatientSettings(patient.id, settings);
    onPatientUpdate({ ...patient, ...settings });
    setSaving(false);
    toast('Settings saved');
  }

  return (
    <div className="panel">
      <h2 className="pt">Settings</h2>
      <div className="settings-list">
        <div className="settings-row"><label>Name</label><input type="text" value={patient.name} disabled /></div>
        <div className="settings-row"><label>Email</label><input type="text" value={patient.email} disabled /></div>
        <div className="settings-row">
          <label>Preferred language</label>
          <select value={language} onChange={e => setLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="settings-toggle">
          <div><div className="stlabel">Appointment reminders</div><div className="stsub">Get notified before a booked appointment</div></div>
          <label className="switch"><input type="checkbox" checked={apptReminders} onChange={e => setApptReminders(e.target.checked)} /><span className="slider" /></label>
        </div>
        <div className="settings-toggle">
          <div><div className="stlabel">Follow-up reminders</div><div className="stsub">Get asked how you're doing after a visit</div></div>
          <label className="switch"><input type="checkbox" checked={followUpReminders} onChange={e => setFollowUpReminders(e.target.checked)} /><span className="slider" /></label>
        </div>
        <div className="settings-toggle">
          <div><div className="stlabel">Emergency alerts</div><div className="stsub">Urgent updates about an emergency check-in</div></div>
          <label className="switch"><input type="checkbox" checked={emergencyAlerts} onChange={e => setEmergencyAlerts(e.target.checked)} /><span className="slider" /></label>
        </div>
        <div className="actions"><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </div>
    </div>
  );
}
