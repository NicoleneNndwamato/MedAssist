import React, { useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import DashboardPage from './DashboardPage';
import PatientsPage from './PatientsPage';
import AppointmentsPage from './AppointmentsPage';
import RemindersPage from './RemindersPage';
import SettingsPage from './SettingsPage';
import { listReminders } from '../services/firestoreService';

export default function HospitalShell({ staff, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    listReminders().then(r => setReminderCount(r.filter(x => !x.done).length));
  }, [activeTab]);

  return (
    <div>
      <header className="topbar">
        <div className="brand"><Stethoscope /> MedAssist <span>Clinical Dashboard</span></div>
        <div className="userchip">{staff.name} · {staff.role}{staff.facilityId ? ` · ${staff.facilityId}` : ''}</div>
      </header>
      <div className="shell">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          reminderCount={reminderCount}
          onSettings={() => setActiveTab('settings')}
          onLogout={onLogout}
        />
        <div className="content">
          {activeTab === 'dashboard' && <DashboardPage staff={staff} />}
          {activeTab === 'patients' && <PatientsPage staff={staff} />}
          {activeTab === 'appointments' && <AppointmentsPage staff={staff} />}
          {activeTab === 'reminders' && <RemindersPage staff={staff} />}
          {activeTab === 'settings' && <SettingsPage staff={staff} />}
        </div>
      </div>
    </div>
  );
}
