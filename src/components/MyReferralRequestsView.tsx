import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const MyReferralRequestsView: React.FC = () => {
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setReqs(await api.getMyReferralRequests()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const withdraw = async (id: string) => { await api.withdrawReferralRequest(id); load(); };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">My Referral Requests</h2>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {reqs.length === 0 && <p className="text-sm text-slate-400">No referral requests yet.</p>}
      {reqs.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">Job {r.referralJobId}</p>
              <p className="text-xs text-slate-400">Status: {r.status} · Match: {r.matchScore}%</p>
            </div>
            {r.status === 'requested' || r.status === 'under_review' ? (
              <button onClick={() => withdraw(r.id)} className="text-xs px-3 py-1 rounded bg-rose-900 text-rose-200">Withdraw</button>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-1">Matching: {(r.matchingSkills || []).join(', ')} · Missing: {(r.missingSkills || []).join(', ')}</p>
        </div>
      ))}
    </div>
  );
};

export default MyReferralRequestsView;
