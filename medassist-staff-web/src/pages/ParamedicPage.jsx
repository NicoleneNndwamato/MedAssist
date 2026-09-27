import React, { useEffect, useState } from 'react';
import { Stethoscope, LogOut } from 'lucide-react';
import PriorityBadge from '../components/PriorityBadge';
import CaseDetailPanel from '../components/CaseDetailPanel';
import { toast } from '../components/Toast';
import { listEmergencyAppointments, getPatientHistory, updateHandoffStep } from '../services/firestoreService';

// Paramedics/EMTs get the full clinical picture for emergency cases (history,
// medications, allergies, transcript) but cannot change hospital priority or
// book appointments — they can only progress the handoff.
const PARAMEDIC_PERMISSIONS = {
  showHistory: true, showMeds: true, showTranscript: true,
  canChangePriority: false, canChangeStatus: false, canBookAppointment: false,
  showHandoff: true, canStartHandoff: true, canAdvanceHandoff: true,
};

export default function ParamedicPage({ staff, onLogout }) {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const rows = await listEmergencyAppointments();
    setCases(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const s = cases.find(c => c.id === selectedId);
    if (s) getPatientHistory(s.patientId).then(setHistory); else setHistory([]);
  }, [selectedId, cases]);

  const selected = cases.find(c => c.id === selectedId);

  async function handleStartHandoff() {
    await updateHandoffStep(selected.id, 0);
    toast('Emergency handoff created — status: Awaiting EMS');
    load();
  }
  async function handleAdvanceHandoff() {
    const next = Math.min((selected.handoffStep ?? 0) + 1, 3);
    await updateHandoffStep(selected.id, next);
    load();
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand"><Stethoscope /> MedAssist <span>EMS / Paramedic</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="userchip">{staff.name} · Paramedic / EMT</div>
          <button className="ghost" onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <main className="wrap split">
        <div className="panel">
          <h2 className="panelTitle">Emergency Handoff Queue</h2>
          <div className="searchbar"><button className="btn btn-outline" onClick={load}>Refresh</button></div>
          <div className="queue">
            {loading ? <div className="empty">Loading…</div> :
              cases.length ? cases.map(c => (
                <div key={c.id} className={`pcard immediate ${c.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(c.id)}>
                  <PriorityBadge priority="IMMEDIATE" />
                  <div className="pname">{c.patientName || 'Patient'} <span className="subtle">· {c.patientAge ?? '—'}y</span></div>
                  <div className="psub">{c.symptomsSummary}</div>
                </div>
              )) : <div className="empty">No active emergency cases right now.</div>}
          </div>
        </div>
        <div className="panel">
          <CaseDetailPanel
            appointment={selected}
            history={history}
            permissions={PARAMEDIC_PERMISSIONS}
            onStartHandoff={handleStartHandoff}
            onAdvanceHandoff={handleAdvanceHandoff}
          />
        </div>
      </main>
    </div>
  );
}
