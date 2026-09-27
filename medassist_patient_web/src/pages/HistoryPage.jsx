import React, { useEffect, useState } from 'react';
import { listMyCheckIns } from '../services/firestoreService';

function statusLabel(status) {
  if (!status) return 'Awaiting review';
  return status.replace(/_/g, ' ').replace(/\w\S*/g, w => w[0] + w.slice(1).toLowerCase());
}
function statusClass(status) {
  return { AWAITING_REVIEW: 'awaiting', REVIEWED: 'reviewed', APPOINTMENT_BOOKED: 'booked', COMPLETED: 'completed' }[status] || 'awaiting';
}

export default function HistoryPage({ patient }) {
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyCheckIns(patient.id).then(rows => { setCheckIns(rows); setLoading(false); }); }, [patient.id]);

  return (
    <div className="panel">
      <h2 className="pt">My Profile & History</h2>
      <div className="lockednote">🔒 This history is maintained by MedAssist from your check-ins and healthcare worker reviews — you can't edit it here.</div>
      <div className="grid2">
        <div className="field"><div className="label">Name</div><div className="val">{patient.name}</div></div>
        <div className="field"><div className="label">Email</div><div className="val">{patient.email}</div></div>
        <div className="field"><div className="label">Signed in with</div><div className="val">Google</div></div>
        <div className="field"><div className="label">Preferred language</div><div className="val">{patient.language}</div></div>
      </div>
      <h2 className="pt" style={{ marginTop: 8 }}>Check-in history</h2>
      <div className="timeline">
        {loading ? <div className="empty">Loading…</div> :
          checkIns.length ? checkIns.map(c => (
            <div className="tlitem" key={c.id}>
              <div className="tldot" />
              <div>
                <div className="tldate">{c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Just now'}</div>
                <div className="tltext">{c.symptomsSummary || 'Check-in submitted'}</div>
                {c.facilityName && (
                  <div className="tlmeta">
                    {c.doctorName ? `${c.doctorName} · ` : ''}{c.facilityName}
                    {c.appointmentDate ? ` · ${c.appointmentDate}` : ''}{c.appointmentTime ? ` at ${c.appointmentTime}` : ''}
                  </div>
                )}
                <div className="tlmeta">
                  {c.humanPriority ? `Reviewed by a healthcare worker.` : 'Awaiting healthcare worker review.'}
                  <span className={`status-pill ${statusClass(c.status)}`} style={{ marginLeft: 6 }}>{statusLabel(c.status)}</span>
                </div>
              </div>
            </div>
          )) : <div className="empty">No check-ins yet — start one from the Chat tab.</div>}
      </div>
    </div>
  );
}