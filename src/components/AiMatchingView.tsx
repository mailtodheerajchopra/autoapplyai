import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const AiMatchingView: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobId, setJobId] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.listReferralJobs().then(setJobs).catch(() => {}); }, []);

  const run = async () => {
    setLoading(true);
    try { setResults(await api.searchCandidates({ jobId, skills: '' })); } catch {}
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">AI Matching</h2>
      <div className="flex gap-2">
        <select className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">Select referral job</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} @ {j.company}</option>)}
        </select>
        <button onClick={run} disabled={!jobId || loading} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50">Match candidates</button>
      </div>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {results.map((c, i) => (
        <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="font-semibold text-white">{c.anonymous ? 'Anonymous candidate' : (c.name || 'Candidate')}</p>
          <p className="text-xs text-slate-400">Experience: {c.experienceRange} · Match: {c.matchScore ?? 0}%</p>
          {c.matchSummary && <p className="text-xs text-slate-400 mt-1">{c.matchSummary}</p>}
          <p className="text-xs text-slate-500 mt-1">Matching: {(c.matchingSkills || []).join(', ')} · Missing: {(c.missingSkills || []).join(', ')}</p>
        </div>
      ))}
    </div>
  );
};

export default AiMatchingView;
