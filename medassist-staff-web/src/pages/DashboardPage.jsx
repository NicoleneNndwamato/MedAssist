import React, { useEffect, useState } from 'react';
import PriorityBadge from '../components/PriorityBadge';
import CaseDetailPanel from '../components/CaseDetailPanel';
import { toast } from '../components/Toast';
import {
  listAppointmentsByFacility, listAppointments, getPatientHistory,
  updateAppointmentPriority, updateAppointmentStatus,
} from '../services/firestoreService';

const HOSPITAL_PERMISSIONS = {
  showHistory: true, showMeds: true, showTranscript: true,
  canChangePriority: true, canChangeStatus: true, canBookAppointment: true,
};

export default function DashboardPage({ staff }) {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    // Doctors/nurses see their own facility's queue; administrators see everything.
    const rows = staff.role === 'Hospital Administrator' || !staff.facilityId
      ? await listAppointments()
      : await listAppointmentsByFacility(staff.facilityId);
    setCases(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const selected = cases.find(c => c.id === selectedId);
    if (selected) getPatientHistory(selected.patientId).then(setHistory);
    else setHistory([]);
  }, [selectedId, cases]);

  const selected = cases.find(c => c.id === selectedId);

  async function handlePriorityChange(priority) {
    await updateAppointmentPriority(selected.id, priority, staff.name);
    toast(`Priority set to ${priority.replace('_', ' ')}`);
    load();
  }
  async function handleStatusChange(status) {
    await updateAppointmentStatus(selected.id, status);
    toast('Status updated');
    load();
  }
  async function handleBook() {
    await updateAppointmentStatus(selected.id, 'APPOINTMENT_BOOKED');
    toast('Appointment booked — patient will be seen without queueing');
    load();
  }

  return (
    <main className="wrap split">
      <div className="panel">
        <h2 className="panelTitle">Incoming Patients</h2>
        <div className="searchbar"><button className="btn btn-outline" onClick={load}>Refresh</button></div>
        <div className="queue">
          {loading ? <div className="empty">Loading Firestore…</div> :
            cases.length ? cases.map(c => (
              <div
                key={c.id}
                className={`pcard ${(c.aiPriority || '').toLowerCase()} ${c.id === selectedId ? 'selected' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <PriorityBadge priority={c.humanPriority || c.aiPriority} />
                <div className="pname">{c.patientName || 'Patient'} <span className="subtle">· {c.patientAge ?? '—'}y</span></div>
                <div className="psub">{c.symptomsSummary || 'No symptom summary'}</div>
              </div>
            )) : <div className="empty">No cases found. Run <code>npm run seed:mock</code>.</div>}
        </div>
      </div>
      <div className="panel">
        <CaseDetailPanel
          appointment={selected}
          history={history}
          permissions={HOSPITAL_PERMISSIONS}
          onPriorityChange={handlePriorityChange}
          onStatusChange={handleStatusChange}
          onBook={handleBook}
        />
      </div>
    </main>
  );
}
