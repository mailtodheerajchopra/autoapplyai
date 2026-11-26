import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const EmploymentVerificationView: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ employer: '', designation: '', startDate: '', endDate: '', isCurrent: false, corporateEmail: '', method: 'document_review' });
  const [otp, setOtp] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.listEmploymentVerifications()); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMessage(null);
    try {
      const ev = await api.createEmploymentVerification(form);
      setMessage('Created. Grant consent to proceed.');
      setActiveId(ev.id);
      await load();
    } catch (e) { setMessage((e as Error).message); }
  };

  const grant = async (id: string) => {
    try { await api.grantEmploymentConsent(id); setMessage('Consent granted.'); await load(); } catch (e) { setMessage((e as Error).message); }
  };
  const withdraw = async (id: string) => {
    try { await api.withdrawEmploymentConsent(id); setMessage('Consent withdrawn.'); await load(); } catch (e) { setMessage((e as Error).message); }
  };
  const sendOtp = async (id: string) => {
    try {
      const r = await api.sendEmploymentEmailOtp(id);
      setDevCode(r.verificationCode || null);
      setMessage('OTP sent.');
    } catch (e) { setMessage((e as Error).message); }
  };
  const confirmOtp = async (id: string) => {
    try {
      await api.confirmEmploymentEmailOtp(id, otp);
      setMessage('Corporate email verified.');
      await load();
    } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Employment Verification</h2>
      {message && <div className="text-sm text-emerald-300">{message}</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">New verification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" placeholder="Employer" value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} />
          <input className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <input type="date" className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input type="date" className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <input className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" placeholder="Corporate email" value={form.corporateEmail} onChange={(e) => setForm({ ...form, corporateEmail: e.target.value })} />
          <select className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="document_review">Document review</option>
            <option value="email_otp">Corporate email OTP</option>
            <option value="hr_verification">HR verification</option>
            <option value="third_party">Third-party (sandbox)</option>
          </select>
        </div>
        <label className="text-sm text-slate-300 flex items-center gap-2">
          <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
          Current employer
        </label>
        <button onClick={create} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Create</button>
      </div>

      <div className="space-y-3">
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
        {items.map((ev) => (
          <div key={ev.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{ev.employer} — {ev.designation}</p>
                <p className="text-xs text-slate-400">Status: {ev.status} · Method: {ev.method}</p>
              </div>
              <div className="flex gap-2">
                {!ev.consentGivenAt && <button onClick={() => grant(ev.id)} className="text-xs px-3 py-1 rounded bg-emerald-600 text-white">Grant consent</button>}
                {ev.consentGivenAt && !ev.consentWithdrawnAt && <button onClick={() => withdraw(ev.id)} className="text-xs px-3 py-1 rounded bg-rose-900 text-rose-200">Withdraw consent</button>}
              </div>
            </div>
            {ev.method === 'email_otp' && ev.corporateEmail && (
              <div className="flex gap-2 items-center">
                <button onClick={() => sendOtp(ev.id)} className="text-xs px-3 py-1 rounded bg-slate-800 text-slate-200">Send OTP</button>
                {devCode && activeId === ev.id && <span className="text-xs text-amber-300">Dev code: {devCode}</span>}
                <input className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-white text-xs" placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <button onClick={() => { setActiveId(ev.id); confirmOtp(ev.id); }} className="text-xs px-3 py-1 rounded bg-emerald-600 text-white">Verify</button>
              </div>
            )}
            {ev.consentWithdrawnAt && <p className="text-xs text-rose-400">Consent withdrawn.</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">We never contact your current employer without explicit consent. Verification status only reflects completed authorized processes.</p>
    </div>
  );
};

export default EmploymentVerificationView;
