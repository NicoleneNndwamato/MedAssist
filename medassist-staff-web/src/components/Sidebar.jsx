import React from 'react';
import { LayoutDashboard, Search, CalendarClock, Bell, Settings, LogOut } from 'lucide-react';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Patients', icon: Search },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'reminders', label: 'Reminders', icon: Bell },
];

export default function Sidebar({ activeTab, onTabChange, reminderCount, onSettings, onLogout }) {
  return (
    <div className="sidebar">
      {TABS.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            className={`navbtn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            <Icon size={16} /> {t.label}
            {t.key === 'reminders' && reminderCount > 0 && <span className="badge-count">{reminderCount}</span>}
          </button>
        );
      })}
      <div className="sidebar-footer">
        <button className={`icon-btn ${activeTab === 'settings' ? 'active' : ''}`} title="Settings" onClick={onSettings}>
          <Settings size={16} />
        </button>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Log out
        </button>
      </div>
    </div>
  );
}
