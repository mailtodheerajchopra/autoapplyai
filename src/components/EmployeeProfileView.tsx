import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { EmployeeProfile } from '../types';

export const EmployeeProfileView: React.FC = () => {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EmployeeProfile>>({
    corporateEmail: '',
    company: '',
    title: '',
    department: '',
    headline: '',
    summary: '',
    linkedinUrl: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const p = await api.getEmployeeProfile();
      setProfile(p);
      if (p) setForm(p);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateEmployeeProfile(form);
      setProfile(updated);
      setForm(updated);
      setMessage('Employee profile saved.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendOtp = async () => {
    setMessage(null);
    try {
      const res = await api.verifyCorporateEmail();
      setDevCode(res.verificationCode || null);
      setMessage(`OTP sent. Expires ${new Date(res.expiresAt).toLocaleTimeString()}.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const handleConfirmOtp = async () => {
    try {
      const res = await api.confirmCorporateEmail(otp);
      setMessage(`Email verified. Affiliation status: ${res.affiliationStatus}.`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Employee / Referrer Profile</h2>
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>
      {message && <div className="text-sm text-emerald-300">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm text-slate-300">
          Corporate email
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.corporateEmail || ''} onChange={(e) => setForm({ ...form, corporateEmail: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Company
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Title
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Department
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Headline
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.headline || ''} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Summary
          <textarea className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.summary || ''} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          LinkedIn URL
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.linkedinUrl || ''} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
        </label>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div className="text-sm text-slate-300">
          Corporate email verification: {profile?.emailVerified ? 'Verified' : 'Not verified'} | Affiliation: {profile?.affiliationStatus || 'unverified'}
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={handleSendOtp} className="px-4 py-2 rounded-lg bg-slate-800 text-white font-semibold">Send OTP</button>
          {devCode && <span className="text-xs text-amber-300">Dev code: {devCode}</span>}
        </div>
        <div className="flex gap-3 items-center">
          <input className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
          <button onClick={handleConfirmOtp} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">Verify</button>
        </div>
        <p className="text-xs text-slate-500">Verification requires corporate email ownership. Selecting a company name does not verify affiliation; an admin/verifier must approve affiliation.</p>
      </div>
    </div>
  );
};

export default EmployeeProfileView;
