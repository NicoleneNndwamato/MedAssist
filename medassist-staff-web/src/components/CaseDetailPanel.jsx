import React from 'react';
import PriorityBadge from './PriorityBadge';
import TranscriptPlayer from './TranscriptPlayer';
import { PRIORITY_META, STATUS_OPTIONS, statusLabel } from '../services/firestoreService';

function Field({ label, value }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

const HANDOFF_STEPS = ['Awaiting EMS', 'En Route', 'Patient Reached', 'Handover Complete'];

export default function CaseDetailPanel({
  appointment,
  history = [],
  permissions = {},
  onPriorityChange,
  onStatusChange,
  onBook,
  onStartHandoff,
  onAdvanceHandoff,
}) {
  if (!appointment) {
    return <div className="empty">Select a case to review the details.</div>;
  }
  const a = appointment;
  const priority = a.humanPriority || a.aiPriority;

  return (
    <div className="detail">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3>{a.patientName || 'Patient'}</h3>
        <PriorityBadge priority={priority} />
        {permissions.canChangeStatus ? (
          <select
            className="statusSelect"
            value={a.status || 'AWAITING_REVIEW'}
            onChange={e => onStatusChange && onStatusChange(e.target.value)}
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        ) : (
          <span className="status-tag">{statusLabel(a.status)}</span>
        )}
      </div>
      <div className="subtle" style={{ marginTop: 4 }}>
        {a.id} · Age {a.patientAge ?? '—'} · {a.patientPhone || 'No phone on file'} · {a.patientLanguage || ''}
      </div>

      <div className="grid2">
        <Field label="Main complaint" value={a.symptomsSummary || '—'} />
        <Field label="Facility" value={a.facilityName || '—'} />
        <Field label="Location" value={a.location || '—'} />
        <Field label="Transport requested" value={a.transportRequested ? 'Yes' : 'No'} />
        {permissions.showMeds ? (
          <>
            <Field label="Medical history" value={a.medicalHistory || 'None reported'} />
            <Field label="Medications" value={a.medications ? `${a.medications} (${a.medicationReason || 'reason not given'})` : 'None reported'} />
          </>
        ) : (
          <>
            <div className="field"><div className="label">Medical history</div><div className="val">🔒 Restricted</div></div>
            <div className="field"><div className="label">Medications</div><div className="val">🔒 Restricted</div></div>
          </>
        )}
      </div>

      <div className="section">
        <h4>AI Preliminary Assessment</h4>
        <div className="field"><div className="val" style={{ fontWeight: 500 }}>{PRIORITY_META[a.aiPriority]?.label || 'Not yet assessed'} — from MedAssist voice intake.</div></div>
        {a.humanPriority
          ? <div className="subtle" style={{ marginTop: 6 }}>✔ Confirmed by {a.reviewedBy || 'a staff member'}</div>
          : <div className="subtle" style={{ marginTop: 6 }}>Awaiting hospital confirmation</div>}
      </div>

      {permissions.showTranscript ? (
        <div className="section">
          <h4>Conversation Transcript</h4>
          <TranscriptPlayer transcript={a.transcript} />
        </div>
      ) : (
        <div className="section">
          <h4>Conversation Transcript</h4>
          <div className="locked">🔒 Not available at this access level</div>
        </div>
      )}

      {permissions.showHistory && (
        <div className="section">
          <h4>Patient History</h4>
          {history.length ? (
            <div className="timeline">
              {history.map(h => (
                <div className="tlitem" key={h.id}>
                  <div className="tldot" />
                  <div className="tlbody">
                    <div className="tldate">{h.date} · {h.visitType}</div>
                    <div className="tltext">{h.summary}{h.outcome ? ` — ${h.outcome}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="empty" style={{ padding: 14 }}>No prior visits on record.</div>}
        </div>
      )}

      <div className="section">
        <h4>Actions</h4>
        {permissions.canChangePriority && (
          <div className="priority-picker">
            <button className="btn btn-outline" onClick={() => onPriorityChange('NON_URGENT')}>Routine</button>
            <button className="btn btn-outline" onClick={() => onPriorityChange('STANDARD')}>Standard</button>
            <button className="btn btn-orange" onClick={() => onPriorityChange('URGENT')}>Urgent</button>
            <button className="btn btn-amber" onClick={() => onPriorityChange('VERY_URGENT')}>Very Urgent</button>
            <button className="btn btn-danger" onClick={() => onPriorityChange('IMMEDIATE')}>Emergency</button>
          </div>
        )}
        <div className="actions">
          {permissions.canBookAppointment && (
            <button className="btn btn-primary" onClick={onBook}>Book Appointment</button>
          )}
          {permissions.canStartHandoff && a.aiPriority === 'IMMEDIATE' && typeof a.handoffStep !== 'number' && (
            <button className="btn btn-danger" onClick={onStartHandoff}>Prepare Emergency Handoff</button>
          )}
        </div>
      </div>

      {permissions.showHandoff && a.aiPriority === 'IMMEDIATE' && typeof a.handoffStep === 'number' && (
        <div className="section">
          <h4>🚑 Emergency Handoff — Ref {a.handoffRef || '—'}</h4>
          <div className="handoff-steps">
            {HANDOFF_STEPS.map((s, i) => (
              <div key={s} className={`hstep ${i < a.handoffStep ? 'done' : ''} ${i === a.handoffStep ? 'active' : ''}`}>
                <div className="circ" /> {s}
              </div>
            ))}
          </div>
          {permissions.canAdvanceHandoff && a.handoffStep < 3 && (
            <div className="actions">
              <button className="btn btn-primary" onClick={onAdvanceHandoff}>Advance Status</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
