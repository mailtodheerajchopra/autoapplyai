import React, { useEffect, useState } from 'react';
import { api } from '../api';

const CHECKS: string[] = ['identity', 'employment_history', 'education', 'address', 'reference'];

export const BackgroundVerificationView: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedChecks, setSelectedChecks] = useState<string[]>(CHECKS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.listBgvRequests()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMessage(null);
    try {
      const r = await api.createBgvRequest(selectedChecks);
      setMessage('BGV request created. Grant consent to proceed.');
      setActiveId(r.id);
      await load();
    } catch (e) { setMessage((e as Error).message); }
  };

  const grant = async (id: string) => {
    try { await api.grantBgvConsent(id); setMessage('Consent granted.'); await load(); } catch (e) { setMessage((e as Error).message); }
  };
  const withdraw = async (id: string) => {
    try { await api.withdrawBgvConsent(id); setMessage('Consent withdrawn.'); await load(); } catch (e) { setMessage((e as Error).message); }
  };

  const toggleCheck = (c: string) => {
    setSelectedChecks((prev) => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Background Verification</h2>
      {message && <div className="text-sm text-emerald-300">{message}</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">New BGV request (sandbox provider)</h3>
        <div className="flex flex-wrap gap-2">
          {CHECKS.map((c) => (
            <label key={c} className="text-xs text-slate-300 flex items-center gap-1">
              <input type="checkbox" checked={selectedChecks.includes(c)} onChange={() => toggleCheck(c)} />
              {c}
            </label>
          ))}
        </div>
        <button onClick={create} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Create request</button>
      </div>

      <div className="space-y-3">
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
        {items.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">BGV {r.id}</p>
                <p className="text-xs text-slate-400">Status: {r.status} · Provider: {r.provider}</p>
              </div>
              <div className="flex gap-2">
                {!r.consentGivenAt && <button onClick={() => grant(r.id)} className="text-xs px-3 py-1 rounded bg-emerald-600 text-white">Grant consent</button>}
                {r.consentGivenAt && !r.consentWithdrawnAt && <button onClick={() => withdraw(r.id)} className="text-xs px-3 py-1 rounded bg-rose-900 text-rose-200">Withdraw consent</button>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(r.checks || []).map((c: any) => (
                <div key={c.type} className="text-xs text-slate-300 border border-slate-800 rounded p-2">
                  {c.type}: <span className="font-semibold">{c.status}</span>
                  {c.result ? ` — ${c.result}` : ''}
                </div>
              ))}
            </div>
            {r.consentWithdrawnAt && <p className="text-xs text-rose-400">Consent withdrawn.</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Background verification uses a clearly identified sandbox/mock provider in development. No fake completion claims are made.</p>
    </div>
  );
};

export default BackgroundVerificationView;
