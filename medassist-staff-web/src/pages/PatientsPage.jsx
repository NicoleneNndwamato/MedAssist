import React, { useEffect, useState } from 'react';
import CaseDetailPanel from '../components/CaseDetailPanel';
import {
  listPatients, getPatientHistory, getPatientAppointments,
  updateAppointmentPriority, updateAppointmentStatus,
} from '../services/firestoreService';
import { toast } from '../components/Toast';

const HOSPITAL_PERMISSIONS = {
  showHistory: true, showMeds: true, showTranscript: true,
  canChangePriority: true, canChangeStatus: true, canBookAppointment: true,
};

export default function PatientsPage({ staff }) {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [openAppointment, setOpenAppointment] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listPatients().then(rows => { setPatients(rows); setLoading(false); }); }, []);

  const q = search.trim().toLowerCase();
  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))
  );

  async function openProfile(patientId) {
    setOpenId(patientId);
    const [hist, appts] = await Promise.all([getPatientHistory(patientId), getPatientAppointments(patientId)]);
    setHistory(hist);
    // Show the most recent case for that patient, if any.
    const latest = appts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;
    setOpenAppointment(latest);
  }

  async function handlePriorityChange(priority) {
    if (!openAppointment) return;
    await updateAppointmentPriority(openAppointment.id, priority, staff.name);
    toast(`Priority set to ${priority.replace('_', ' ')}`);
    openProfile(openId);
  }
  async function handleStatusChange(status) {
    if (!openAppointment) return;
    await updateAppointmentStatus(openAppointment.id, status);
    toast('Status updated');
    openProfile(openId);
  }
  async function handleBook() {
    if (!openAppointment) return;
    await updateAppointmentStatus(openAppointment.id, 'APPOINTMENT_BOOKED');
    toast('Appointment booked');
    openProfile(openId);
  }

  return (
    <main className="wrap">
      <div className="panel">
        <h2 className="panelTitle">Patients</h2>
        <div className="searchbar">
          <input placeholder="Search by name or phone number…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <table className="table">
          <thead><tr><th>Name</th><th>Age</th><th>Phone</th><th>Language</th><th>Location</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty">Loading…</td></tr> :
              filtered.length ? filtered.map(p => (
                <tr key={p.id} onClick={() => openProfile(p.id)}>
                  <td>{p.name}</td><td>{p.age}</td><td>{p.phone}</td><td>{p.language}</td><td>{p.location}</td>
                </tr>
              )) : <tr><td colSpan={5} className="empty">No patients match your search.</td></tr>}
          </tbody>
        </table>
      </div>

      {openId && (
        <div className="panel" style={{ marginTop: 16 }}>
          {openAppointment ? (
            <CaseDetailPanel
              appointment={openAppointment}
              history={history}
              permissions={HOSPITAL_PERMISSIONS}
              onPriorityChange={handlePriorityChange}
              onStatusChange={handleStatusChange}
              onBook={handleBook}
            />
          ) : (
            <div className="empty">This patient has no MedAssist case on record yet.</div>
          )}
        </div>
      )}
    </main>
  );
}
