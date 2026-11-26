import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { CandidateReferralProfile, CandidateVisibility } from '../types';

export const ReferralProfileView: React.FC = () => {
  const [profile, setProfile] = useState<CandidateReferralProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CandidateReferralProfile>>({
    currentEmployer: '',
    previousEmployers: [],
    preferredCompanies: [],
    preferredTitles: [],
    preferredLocations: [],
    noticePeriodDays: 0,
    availabilityDate: '',
    skills: [],
    experienceYears: 0,
    educationSummary: '',
    visibility: 'private',
    referralOptIn: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const p = await api.getCandidateReferralProfile();
      setProfile(p);
      if (p) setForm(p);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Partial<CandidateReferralProfile> = {
        ...form,
        previousEmployers: Array.isArray(form.previousEmployers) ? form.previousEmployers : toList(String(form.previousEmployers || '')),
        preferredCompanies: Array.isArray(form.preferredCompanies) ? form.preferredCompanies : toList(String(form.preferredCompanies || '')),
        preferredTitles: Array.isArray(form.preferredTitles) ? form.preferredTitles : toList(String(form.preferredTitles || '')),
        preferredLocations: Array.isArray(form.preferredLocations) ? form.preferredLocations : toList(String(form.preferredLocations || '')),
        skills: Array.isArray(form.skills) ? form.skills : toList(String(form.skills || '')),
      };
      const updated = await api.updateCandidateReferralProfile(payload);
      setProfile(updated);
      setForm(updated);
      setMessage('Profile saved.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const updated = await api.submitCandidateReferralProfile();
      setProfile(updated);
      setForm(updated);
      setMessage('Submitted for referral consideration.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const listValue = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Referral Profile</h2>
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>
      {message && <div className="text-sm text-emerald-300">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm text-slate-300">
          Current employer
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.currentEmployer || ''} onChange={(e) => setForm({ ...form, currentEmployer: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Previous employers (comma separated)
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={listValue(form.previousEmployers)} onChange={(e) => setForm({ ...form, previousEmployers: toList(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">
          Preferred companies
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={listValue(form.preferredCompanies)} onChange={(e) => setForm({ ...form, preferredCompanies: toList(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">
          Preferred titles
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={listValue(form.preferredTitles)} onChange={(e) => setForm({ ...form, preferredTitles: toList(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">
          Preferred locations
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={listValue(form.preferredLocations)} onChange={(e) => setForm({ ...form, preferredLocations: toList(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">
          Notice period (days)
          <input type="number" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.noticePeriodDays || 0} onChange={(e) => setForm({ ...form, noticePeriodDays: Number(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">
          Availability date
          <input type="date" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.availabilityDate || ''} onChange={(e) => setForm({ ...form, availabilityDate: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Years of experience
          <input type="number" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.experienceYears || 0} onChange={(e) => setForm({ ...form, experienceYears: Number(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Skills (comma separated)
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={listValue(form.skills)} onChange={(e) => setForm({ ...form, skills: toList(e.target.value) })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Education summary
          <textarea className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.educationSummary || ''} onChange={(e) => setForm({ ...form, educationSummary: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300">
          Visibility
          <select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.visibility || 'private'} onChange={(e) => setForm({ ...form, visibility: e.target.value as CandidateVisibility })}>
            <option value="private">Private</option>
            <option value="anonymous">Anonymous referral discovery</option>
            <option value="verified_employees">Visible to verified employees</option>
            <option value="recruiters">Visible to recruiters</option>
          </select>
        </label>
        <label className="text-sm text-slate-300 flex items-center gap-2 mt-6">
          <input type="checkbox" checked={!!form.referralOptIn} onChange={(e) => setForm({ ...form, referralOptIn: e.target.checked })} />
          Enable referral opportunities
        </label>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        <button onClick={handleSubmit} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
          Submit for referral
        </button>
      </div>

      {profile?.submittedForReferral && (
        <div className="text-xs text-slate-400">Submitted for referral consideration.</div>
      )}
    </div>
  );
};

export default ReferralProfileView;
