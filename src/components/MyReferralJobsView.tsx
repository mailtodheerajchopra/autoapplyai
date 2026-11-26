import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const MyReferralJobsView: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setJobs(await api.getMyReferralJobs()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const handleClose = async (id: string) => { await api.closeReferralJob(id); load(); };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">My Referral Jobs</h2>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {jobs.length === 0 && <p className="text-sm text-slate-400">No referral jobs yet.</p>}
      {jobs.map((j) => (
        <div key={j.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">{j.title} @ {j.company}</h3>
              <p className="text-xs text-slate-400">{j.location} · {j.workMode} · {j.status}</p>
            </div>
            <div className="flex gap-2">
              {j.status !== 'closed' && <button onClick={() => handleClose(j.id)} className="text-xs px-3 py-1 rounded bg-rose-900 text-rose-200">Close</button>}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">Slots: {j.filledSlots}/{j.availableSlots} · Skills: {(j.skillsRequired || []).join(', ')}</p>
        </div>
      ))}
    </div>
  );
};

export default MyReferralJobsView;
