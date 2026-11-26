import React, { useEffect, useState } from 'react';
import { api } from '../api';

const STATUSES = ['under_review', 'shortlisted', 'accepted', 'rejected', 'referral_submitted', 'interview_scheduled', 'selected'];

export const CandidateRequestsView: React.FC = () => {
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setReqs(await api.getEmployeeReferralRequests()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const update = async (id: string, status: string) => { await api.updateReferralRequest(id, status); load(); };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Candidate Requests</h2>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {reqs.length === 0 && <p className="text-sm text-slate-400">No candidate requests.</p>}
      {reqs.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="font-semibold text-white">Request {r.id}</p>
          <p className="text-xs text-slate-400">Candidate: {r.candidateUserId} · Status: {r.status} · Match: {r.matchScore}%</p>
          <p className="text-xs text-slate-500 mt-1">Matching: {(r.matchingSkills || []).join(', ')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => update(r.id, s)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700">{s}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CandidateRequestsView;
