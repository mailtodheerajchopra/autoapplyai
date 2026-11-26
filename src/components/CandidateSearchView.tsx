import React, { useState } from 'react';
import { api } from '../api';

export const CandidateSearchView: React.FC = () => {
  const [skills, setSkills] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const search = async () => {
    setLoading(true);
    try { setResults(await api.searchCandidates({ skills })); } catch {}
    setLoading(false);
  };
  const shortlist = async (candidateUserId: string) => {
    await api.createShortlist(candidateUserId);
    alert('Shortlisted');
  };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Candidate Search</h2>
      <div className="flex gap-2">
        <input className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" placeholder="Skills (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} />
        <button onClick={search} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Search</button>
      </div>
      {loading && <span className="text-xs text-slate-400">Loading…</span>}
      {results.map((c, i) => (
        <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="font-semibold text-white">{c.anonymous ? 'Anonymous candidate' : (c.name || 'Candidate')}</p>
          <p className="text-xs text-slate-400">Experience: {c.experienceRange} · Visibility: {c.visibility}</p>
          <p className="text-xs text-slate-500 mt-1">Skills: {(c.skills || []).join(', ')}</p>
          {c.matchScore != null && <p className="text-xs text-slate-500">Match: {c.matchScore}%</p>}
          {c.matchSummary && <p className="text-xs text-slate-400 mt-1">{c.matchSummary}</p>}
          <button onClick={() => shortlist(c.userId)} className="mt-2 text-xs px-3 py-1 rounded bg-emerald-600 text-white">Shortlist</button>
        </div>
      ))}
    </div>
  );
};

export default CandidateSearchView;
