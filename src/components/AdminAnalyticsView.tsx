import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const AdminAnalyticsView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await api.getAdminReferralAnalytics()); } catch (e) { setMessage((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cleanup = async () => {
    try {
      const r = await api.runAdminCleanup();
      setMessage(`Removed ${r.removedDocuments} expired documents.`);
    } catch (e) { setMessage((e as Error).message); }
  };

  if (loading) return <div className="text-xs text-slate-400">Loading…</div>;
  if (!data) return <div className="text-xs text-rose-400">{message || 'No data'}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Referral Analytics</h2>
        <button onClick={cleanup} className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-200">Run cleanup</button>
      </div>
      {message && <div className="text-sm text-emerald-300">{message}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(data).filter(([k]) => k !== 'mostActiveCompanies').map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">{k}</p>
            <p className="text-2xl font-bold text-white">{String(v)}</p>
          </div>
        ))}
      </div>
      {Array.isArray(data.mostActiveCompanies) && data.mostActiveCompanies.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="font-semibold text-white mb-2">Most active companies</h3>
          <ul className="text-sm text-slate-300 space-y-1">
            {data.mostActiveCompanies.map((c: any) => (
              <li key={c.company}>{c.company}: {c.jobs} jobs</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AdminAnalyticsView;
