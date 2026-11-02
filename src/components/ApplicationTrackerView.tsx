import React, { useState } from 'react';
import { JobPosting, WorkdayApplication } from '../types';
import { api } from '../api';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
} from 'lucide-react';

interface ApplicationTrackerViewProps {
  jobs: JobPosting[];
  applications: WorkdayApplication[];
  onRefreshJobs: () => Promise<void>;
  onOpenReview: (app: WorkdayApplication) => void;
}

export const ApplicationTrackerView: React.FC<ApplicationTrackerViewProps> = ({
  jobs,
  applications,
  onRefreshJobs,
  onOpenReview,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleUpdateStatus = async (jobId: string, newStatus: any) => {
    try {
      await api.updateJob(jobId, { status: newStatus });
      await onRefreshJobs();
    } catch (err) {
      alert('Failed to update status: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const getApplicationForJob = (jobId: string) => {
    return applications.find((a) => a.jobId === jobId);
  };

  const filteredJobs = jobs.filter((j) => {
    if (statusFilter === 'all') return true;
    return j.status === statusFilter;
  });

  const stages = [
    { id: 'discovered', label: 'Discovered', count: jobs.filter((j) => j.status === 'discovered').length },
    { id: 'pending_review', label: 'In Review', count: jobs.filter((j) => j.status === 'pending_review').length },
    { id: 'submitted', label: 'Submitted', count: jobs.filter((j) => j.status === 'submitted').length },
    { id: 'interviewing', label: 'Interviewing', count: jobs.filter((j) => j.status === 'interviewing').length },
  ];

  return (
    <div className="space-y-6">
      {/* Header and Stage KPI counters */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Applications Pipeline</h1>
        <p className="text-xs text-slate-400 mt-1">
          Track end-to-end status of all discovered openings, staged Workday applications, and submitted credentials.
        </p>
      </div>

      {/* Pipeline Status Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setStatusFilter(statusFilter === stage.id ? 'all' : stage.id)}
            className={`p-4 rounded-xl border text-left transition-all ${
              statusFilter === stage.id
                ? 'bg-indigo-950/50 border-indigo-500 shadow-md'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              {stage.label}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono tabular-nums text-white">
                {stage.count}
              </span>
              <span className="text-xs text-slate-400">roles</span>
            </div>
          </button>
        ))}
      </div>

      {/* Filter and Table View */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Filter status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value="all">All Statuses ({jobs.length})</option>
              <option value="discovered">Discovered</option>
              <option value="pending_review">Pending Review</option>
              <option value="submitted">Submitted</option>
              <option value="interviewing">Interviewing</option>
            </select>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Showing {filteredJobs.length} records
          </span>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No applications match the selected stage filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Role & Company</th>
                  <th className="py-3 px-4">Portal / Source</th>
                  <th className="py-3 px-4">Match %</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4">Proof / Receipt</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredJobs.map((job) => {
                  const app = getApplicationForJob(job.id);
                  const isSubmitted = job.status === 'submitted';
                  const isPending = job.status === 'pending_review';

                  return (
                    <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white max-w-xs">
                        <div className="font-semibold text-slate-100 truncate">{job.title}</div>
                        <div className="text-[11px] text-indigo-400 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span>{job.company}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        <span className="font-medium text-white block capitalize">
                          {job.portalType}
                        </span>
                        <span className="text-[11px] text-slate-400">via {job.source}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-emerald-400 tabular-nums">
                          {job.matchScore}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={job.status}
                          onChange={(e) => handleUpdateStatus(job.id, e.target.value)}
                          className={`rounded px-2 py-1 text-xs border bg-slate-950 font-medium focus:outline-none ${
                            isSubmitted
                              ? 'text-emerald-400 border-emerald-800'
                              : isPending
                              ? 'text-amber-400 border-amber-800'
                              : 'text-slate-300 border-slate-800'
                          }`}
                        >
                          <option value="discovered">Discovered</option>
                          <option value="pending_review">Pending Review</option>
                          <option value="submitted">Submitted</option>
                          <option value="interviewing">Interviewing</option>
                          <option value="rejected">Archived</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        {app?.submissionAudit?.confirmationCode ? (
                          <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900 font-bold">
                            {app.submissionAudit.confirmationCode}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Pending submit</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {app ? (
                            <button
                              onClick={() => onOpenReview(app)}
                              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                                isSubmitted
                                  ? 'bg-slate-800 text-slate-300 hover:text-white'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              }`}
                            >
                              {isSubmitted ? 'View Receipt' : 'Review & Submit'}
                            </button>
                          ) : (
                            <a
                              href={job.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white"
                              title="Direct link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
