import React, { useEffect, useState } from 'react';
import { Stethoscope, LogOut } from 'lucide-react';
import PriorityBadge from '../components/PriorityBadge';
import CaseDetailPanel from '../components/CaseDetailPanel';
import { listEmergencyAppointments } from '../services/firestoreService';

// Emergency Operators see only IMMEDIATE-priority cases, with limited history
// and no transcript/medication access, and cannot change priority (per the
// role-permission table: hospital confirms/changes priority, not comms staff).
const OPERATOR_PERMISSIONS = {
  showHistory: false, showMeds: false, showTranscript: false,
  canChangePriority: false, canChangeStatus: false, canBookAppointment: false,
};

export default function EmergencyOperatorPage({ staff, onLogout }) {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const rows = await listEmergencyAppointments();
    setCases(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const selected = cases.find(c => c.id === selectedId);

  return (
    <div>
      <header className="topbar">
        <div className="brand"><Stethoscope /> MedAssist <span>Emergency Comms</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="userchip">{staff.name} · Emergency Operator</div>
          <button className="ghost" onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </header>
      <main className="wrap split">
        <div className="panel">
          <h2 className="panelTitle">Emergency Queue</h2>
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
          <CaseDetailPanel appointment={selected} permissions={OPERATOR_PERMISSIONS} />
        </div>
      </main>
    </div>
  );
}
