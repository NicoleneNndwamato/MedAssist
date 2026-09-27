import React from 'react';
import { MessageCircle, History, Bell, Settings, LogOut } from 'lucide-react';

const TABS = [
  { key: 'chat', label: 'Chat Check-in', icon: MessageCircle },
  { key: 'history', label: 'My History', icon: History },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function Sidebar({ activeTab, onTabChange, unreadCount, onSettings, onLogout }) {
  return (
    <div className="sidebar">
      {TABS.map(t => {
        const Icon = t.icon;
        return (
          <button key={t.key} className={`navbtn ${activeTab === t.key ? 'active' : ''}`} onClick={() => onTabChange(t.key)}>
            <Icon size={16} /> {t.label}
            {t.key === 'notifications' && unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
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
