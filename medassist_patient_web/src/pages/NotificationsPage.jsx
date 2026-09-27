import React from 'react';

// NOTE: there's no notifications collection/backend yet — this is placeholder
// demo data (owned by PatientShell) so the tab has something to show. Wire
// this up to real appointment-reminder / follow-up jobs once those exist
// server-side.
export const DEMO_NOTIFICATIONS = [
  { id: 'n1', title: 'Appointment reminder', body: 'Your appointment at Sunrise Clinic is tomorrow at 10:00.', when: 'Today', unread: true },
  { id: 'n2', title: 'Follow-up check-in', body: "How are you feeling after your last visit? Tap Chat Check-in to start a new one.", when: '2 days ago', unread: true },
  { id: 'n3', title: 'Case reviewed', body: 'A healthcare worker reviewed your last check-in.', when: '1 week ago', unread: false },
];

export default function NotificationsPage({ notifications, onMarkRead }) {
  return (
    <div className="panel">
      <h2 className="pt">Notifications</h2>
      {notifications.length ? notifications.map(n => (
        <div className={`notif ${n.unread ? 'unread' : ''}`} key={n.id}>
          <div>
            <div className="ntitle">{n.title}</div>
            <div className="nmeta">{n.body}</div>
            <div className="nmeta" style={{ marginTop: 4 }}>{n.when}</div>
          </div>
          {n.unread && <button className="btn btn-outline" onClick={() => onMarkRead(n.id)}>Mark read</button>}
        </div>
      )) : <div className="empty">No notifications.</div>}
    </div>
  );
}
