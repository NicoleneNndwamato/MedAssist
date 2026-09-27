import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import ChatPage from './ChatPage';
import HistoryPage from './HistoryPage';
import NotificationsPage, { DEMO_NOTIFICATIONS } from './NotificationsPage';
import SettingsPage from './SettingsPage';

export default function PatientShell({ patient, onPatientUpdate, onLogout }) {
  const [activeTab, setActiveTab] = useState('chat');
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const unreadCount = notifications.filter(n => n.unread).length;

  function markRead(id) {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, unread: false } : n));
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand"><span className="dot" style={{ background: '#fff' }} /> MEDASSIST</div>
        <div className="userchip">{patient.name}</div>
      </header>
      <div className="shell">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          unreadCount={unreadCount}
          onSettings={() => setActiveTab('settings')}
          onLogout={onLogout}
        />
        <div className="content">
          {activeTab === 'chat' && <ChatPage patient={patient} onSubmitted={() => {}} />}
          {activeTab === 'history' && <HistoryPage patient={patient} />}
          {activeTab === 'notifications' && <NotificationsPage notifications={notifications} onMarkRead={markRead} />}
          {activeTab === 'settings' && <SettingsPage patient={patient} onPatientUpdate={onPatientUpdate} />}
        </div>
      </div>
    </div>
  );
}
