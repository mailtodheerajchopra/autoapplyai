import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const NotificationsView: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setItems(await api.getNotifications()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const markRead = async (id: string) => { await api.markNotificationRead(id); load(); };
  const markAll = async () => { await api.markAllNotificationsRead(); load(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Notifications</h2>
        <button onClick={markAll} className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-200">Mark all read</button>
      </div>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {items.length === 0 && <p className="text-sm text-slate-400">No notifications.</p>}
      {items.map((n) => (
        <div key={n.id} className={`rounded-xl border border-slate-800 p-4 ${n.read ? 'bg-slate-950' : 'bg-slate-900'}`}>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-white">{n.title}</p>
            {!n.read && <button onClick={() => markRead(n.id)} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white">Mark read</button>}
          </div>
          <p className="text-xs text-slate-400 mt-1">{n.body}</p>
          <p className="text-[10px] text-slate-600 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
};

export default NotificationsView;
