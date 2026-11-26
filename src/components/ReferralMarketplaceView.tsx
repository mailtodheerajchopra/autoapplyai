import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const ReferralMarketplaceView: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setJobs(await api.listReferralJobs({ company: company || undefined })); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const requestReferral = async (jobId: string) => {
    setMessage(null);
    try {
      await api.createReferralRequest(jobId, coverNote);
      setMessage('Referral request submitted.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Referral Marketplace</h2>
      <div className="flex gap-2">
        <input className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" placeholder="Filter by company" value={company} onChange={(e) => setCompany(e.target.value)} />
        <button onClick={load} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Search</button>
      </div>
      <textarea className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" placeholder="Cover note (optional)" value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
      {message && <div className="text-sm text-emerald-300">{message}</div>}
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {jobs.length === 0 && <p className="text-sm text-slate-400">No referral opportunities.</p>}
      {jobs.map((j) => (
        <div key={j.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="font-semibold text-white">{j.title} @ {j.company}</h3>
          <p className="text-xs text-slate-400">{j.location} · {j.workMode} · {j.status}</p>
          <p className="text-xs text-slate-500 mt-1">Skills: {(j.skillsRequired || []).join(', ')}</p>
          <p className="text-xs text-slate-500">Slots: {j.filledSlots}/{j.availableSlots}</p>
          <button onClick={() => requestReferral(j.id)} className="mt-2 text-xs px-3 py-1 rounded bg-emerald-600 text-white">Request referral</button>
        </div>
      ))}
    </div>
  );
};

export default ReferralMarketplaceView;
