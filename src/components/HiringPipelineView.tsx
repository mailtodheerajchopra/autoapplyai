import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const HiringPipelineView: React.FC = () => {
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setReqs(await api.getEmployeeReferralRequests()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Hiring Pipeline</h2>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {reqs.length === 0 && <p className="text-sm text-slate-400">No candidates in pipeline.</p>}
      {reqs.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="font-semibold text-white">{r.candidateUserId}</p>
          <p className="text-xs text-slate-400">Status: {r.status} · Match: {r.matchScore}%</p>
        </div>
      ))}
    </div>
  );
};

export default HiringPipelineView;
