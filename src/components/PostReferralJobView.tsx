import React, { useState } from 'react';
import { api } from '../api';

export const PostReferralJobView: React.FC = () => {
  const [form, setForm] = useState<any>({
    company: '', title: '', requisitionId: '', description: '', skillsRequired: '', minExperience: 0, maxExperience: 0,
    location: '', workMode: 'Remote', employmentType: 'Full-time', jobUrl: '', referralProvider: '', availableSlots: 1,
    expiresAt: '', instructions: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (publish: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        skillsRequired: String(form.skillsRequired).split(',').map((s: string) => s.trim()).filter(Boolean),
        minExperience: Number(form.minExperience || 0),
        maxExperience: Number(form.maxExperience || 0),
        availableSlots: Number(form.availableSlots || 1),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      };
      const job = await api.createReferralJob(payload);
      if (publish) await api.publishReferralJob(job.id);
      setMessage(`Job ${publish ? 'published' : 'saved as draft'}: ${job.title}`);
      setForm({ company: '', title: '', requisitionId: '', description: '', skillsRequired: '', minExperience: 0, maxExperience: 0, location: '', workMode: 'Remote', employmentType: 'Full-time', jobUrl: '', referralProvider: '', availableSlots: 1, expiresAt: '', instructions: '' });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: string, label: string, type = 'text') => (
    <label className="text-sm text-slate-300">
      {label}
      <input type={type} className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Post Referral Job</h2>
      {message && <div className="text-sm text-emerald-300">{message}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {field('company', 'Company name')}
        {field('title', 'Job title')}
        {field('requisitionId', 'Requisition ID')}
        {field('location', 'Location')}
        <label className="text-sm text-slate-300">
          Work mode
          <select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.workMode} onChange={(e) => setForm({ ...form, workMode: e.target.value })}>
            <option>Remote</option><option>Hybrid</option><option>Onsite</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Employment type
          <select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
            <option>Full-time</option><option>Contract</option><option>Part-time</option><option>Internship</option>
          </select>
        </label>
        {field('minExperience', 'Min experience', 'number')}
        {field('maxExperience', 'Max experience', 'number')}
        {field('availableSlots', 'Available slots', 'number')}
        {field('jobUrl', 'Official job posting URL')}
        {field('referralProvider', 'Referral provider')}
        {field('expiresAt', 'Expiry date', 'date')}
        <label className="text-sm text-slate-300 md:col-span-2">
          Skills required (comma separated)
          <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.skillsRequired} onChange={(e) => setForm({ ...form, skillsRequired: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Job description
          <textarea className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Additional instructions
          <textarea className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-white" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-3">
        <button onClick={() => handleCreate(false)} disabled={saving} className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold disabled:opacity-50">Save draft</button>
        <button onClick={() => handleCreate(true)} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50">Publish</button>
      </div>
    </div>
  );
};

export default PostReferralJobView;
