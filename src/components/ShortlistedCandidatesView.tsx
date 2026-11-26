import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const ShortlistedCandidatesView: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setItems(await api.getShortlists()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const remove = async (id: string) => { await api.deleteShortlist(id); load(); };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Shortlisted Candidates</h2>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {items.length === 0 && <p className="text-sm text-slate-400">No shortlisted candidates.</p>}
      {items.map((s) => (
        <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">{s.candidateUserId}</p>
            <p className="text-xs text-slate-400">{s.note || 'No note'}</p>
          </div>
          <button onClick={() => remove(s.id)} className="text-xs px-3 py-1 rounded bg-rose-900 text-rose-200">Remove</button>
        </div>
      ))}
    </div>
  );
};

export default ShortlistedCandidatesView;
