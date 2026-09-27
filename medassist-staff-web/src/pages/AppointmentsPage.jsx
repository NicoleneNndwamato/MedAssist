import React, { useEffect, useState } from 'react';
import { listAppointments, statusLabel } from '../services/firestoreService';

export default function AppointmentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listAppointments().then(r => { setRows(r); setLoading(false); }); }, []);

  return (
    <main className="wrap">
      <div className="panel">
        <h2 className="panelTitle">All Appointments</h2>
        <p className="subtle">
          MedAssist books every reviewed patient into an appointment — this keeps clinic lines short,
          especially for elderly patients who would otherwise queue in person.
        </p>
        <table className="table">
          <thead><tr><th>Patient</th><th>Phone</th><th>Facility</th><th>Complaint</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty">Loading…</td></tr> :
              rows.length ? rows.map(r => (
                <tr key={r.id}>
                  <td>{r.patientName}</td>
                  <td>{r.patientPhone}</td>
                  <td>{r.facilityName}</td>
                  <td>{r.symptomsSummary}</td>
                  <td><span className={`status-pill ${(r.status || 'awaiting_review').toLowerCase()}`}>{statusLabel(r.status)}</span></td>
                </tr>
              )) : <tr><td colSpan={5} className="empty">No appointments yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
