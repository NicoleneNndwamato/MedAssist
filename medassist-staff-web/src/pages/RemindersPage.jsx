import React, { useEffect, useState } from 'react';
import { listReminders, addReminder, toggleReminder, listPatients } from '../services/firestoreService';
import { toast } from '../components/Toast';

export default function RemindersPage({ staff }) {
  const [reminders, setReminders] = useState([]);
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [r, p] = await Promise.all([listReminders(), listPatients()]);
    setReminders(r);
    setPatients(p);
    if (!patientId && p.length) setPatientId(p[0].id);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function handleAdd() {
    if (!note.trim()) { toast('Enter a reminder note first'); return; }
    const patient = patients.find(p => p.id === patientId);
    await addReminder({ patientId, patientName: patient?.name || 'Unknown', note: note.trim(), date, createdBy: staff.name });
    setNote(''); setDate('');
    toast('Reminder added');
    load();
  }

  async function handleToggle(r) {
    await toggleReminder(r.id, !r.done);
    load();
  }

  return (
    <main className="wrap">
      <div className="panel">
        <h2 className="panelTitle">Reminders & Follow-ups</h2>
        <div className="addrem">
          <select value={patientId} onChange={e => setPatientId(e.target.value)}>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Reminder note (e.g. follow-up call)" value={note} onChange={e => setNote(e.target.value)} />
          <input placeholder="Due date (e.g. 02 Oct 2026)" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn btn-primary" onClick={handleAdd}>Add</button>
        </div>
        {loading ? <div className="empty">Loading…</div> :
          reminders.length ? reminders.map(r => (
            <div className={`remcard ${r.done ? 'done' : ''}`} key={r.id}>
              <div>
                <div className="rtitle">{r.patientName} {r.done ? '✔' : ''}</div>
                <div className="rmeta">{r.note} · Due {r.date || 'TBD'}</div>
              </div>
              <button className="btn btn-outline" onClick={() => handleToggle(r)}>{r.done ? 'Undo' : 'Mark done'}</button>
            </div>
          )) : <div className="empty">No reminders yet.</div>}
      </div>
    </main>
  );
}
