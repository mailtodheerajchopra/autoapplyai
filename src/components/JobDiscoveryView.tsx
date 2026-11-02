import React, { useState } from 'react';
import { JobPosting, AgentRunLog, WorkdayApplication } from '../types';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Filter,
  ArrowRight,
  History,
  Building2,
  MapPin,
  DollarSign,
  Briefcase,
} from 'lucide-react';

interface JobDiscoveryViewProps {
  jobs: JobPosting[];
  agentLogs: AgentRunLog[];
  onRefreshJobs: () => Promise<void>;
  onOpenReview: (app: WorkdayApplication) => void;
  onOpenWorkdayTab: () => void;
}

export const JobDiscoveryView: React.FC<JobDiscoveryViewProps> = ({
  jobs,
  agentLogs,
  onRefreshJobs,
  onOpenReview,
  onOpenWorkdayTab,
}) => {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [portalFilter, setPortalFilter] = useState<string>('all');
  const [minMatch, setMinMatch] = useState<number>(80);

  // Agent configuration modal / trigger state
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [agentProgress, setAgentProgress] = useState<number | null>(null);
  const [agentKeywords, setAgentKeywords] = useState<string>(
    profile?.targetRoles.join(', ') || 'Software Engineer, Full Stack Developer'
  );
  const [selectedSources, setSelectedSources] = useState<string[]>([
    'LinkedIn',
    'Naukri',
    'Workday Portal',
    'Indeed',
  ]);
  const [remoteOnly, setRemoteOnly] = useState<boolean>(false);
  const [autofillingJobId, setAutofillingJobId] = useState<string | null>(null);
  const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(false);

  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      if (selectedSources.length > 1) {
        setSelectedSources(selectedSources.filter((s) => s !== source));
      }
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  const handleRunAgent = async () => {
    setIsAgentRunning(true);
    const keywords = agentKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const kickoff = await api.kickoffAgentDiscovery({
        keywords,
        sources: selectedSources,
        location: profile?.location || 'Remote',
        remoteOnly,
        minMatchScore: minMatch,
      });

      // Cached results resolve on the spot — no polling needed.
      if (kickoff.status === 'completed') {
        await onRefreshJobs();
        return;
      }

      // Poll the async job until a terminal status.
      const pollIntervalMs = 800;
      const maxWaitMs = 60_000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < maxWaitMs) {
        const job = await api.getDiscoveryJob(kickoff.jobId);
        setAgentProgress(job.progress);
        if (job.status === 'completed' || job.status === 'failed') {
          if (job.status === 'failed') {
            alert('Agent discovery failed: ' + (job.error || 'unknown error'));
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
      await onRefreshJobs();
    } catch (err) {
      alert('Agent kickoff failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsAgentRunning(false);
      setAgentProgress(null);
    }
  };

  const handleAutofillJob = async (job: JobPosting) => {
    setAutofillingJobId(job.id);
    try {
      const app = await api.triggerWorkdayAutofill(job.id);
      await onRefreshJobs();
      onOpenReview(app);
    } catch (err) {
      alert('Autofill failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAutofillingJobId(null);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.requiredSkills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSource = sourceFilter === 'all' || job.source === sourceFilter;
    const matchesPortal = portalFilter === 'all' || job.portalType === portalFilter;
    const matchesScore = job.matchScore >= minMatch;

    return matchesSearch && matchesSource && matchesPortal && matchesScore;
  });

  return (
    <div className="space-y-6">
      {/* Hero & Autonomous Search Engine Controller */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium">
            <Sparkles className="w-4 h-4" />
            <span>Autonomous Discovery Engine Active</span>
            <span className="text-slate-400">·</span>
            <span>LinkedIn, Naukri, Workday & Career Portals</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
            Find openings & auto-prepare Workday applications
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            The agent continuously aggregates positions matching your parsed resume skills, creates portal applicant accounts, solves Workday questionnaires with transparent reasoning, and stages everything for your final review.
          </p>

          {/* Quick Agent Configuration Controls */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={agentKeywords}
                onChange={(e) => setAgentKeywords(e.target.value)}
                placeholder="Search keywords or roles (e.g. Staff Engineer, React, Node.js)"
                className="w-full h-10 px-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleRunAgent}
              disabled={isAgentRunning}
              className="h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-indigo-950"
            >
              {isAgentRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{agentProgress !== null ? `Scanning Portals… ${agentProgress}%` : 'Scanning Portals...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run Discovery Agent</span>
                </>
              )}
            </button>
          </div>

          {/* Active Safeguards Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block text-[11px]">
                  Conflict Shield (Current Employer):
                </span>
                <span className="text-slate-400 text-[11px]">
                  Protected against applying to &quot;{profile?.currentEmployer || 'HyperScale Cloud Tech'}&quot;
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block text-[11px]">
                  45-Day Freshness Filter:
                </span>
                <span className="text-slate-400 text-[11px]">
                  Stale postings older than 45 days automatically excluded
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Logs Drawer */}
      {showLogsDrawer && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Autonomous Search Agent Execution History
            </span>
            <span className="text-slate-400">{agentLogs.length} runs recorded</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {agentLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-indigo-300">{log.message}</span>
                  <span className="text-slate-400 font-mono text-[11px] tabular-nums">
                    {new Date(log.triggeredAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  {log.details.map((d, i) => (
                    <p key={i}>· {d}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by role, company, or skill..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Portal:</span>
            <select
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="all">All Portals</option>
              <option value="workday">Workday Only</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="direct">Direct</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Min Match:</span>
            <select
              value={minMatch}
              onChange={(e) => setMinMatch(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value={70}>70%+</option>
              <option value={80}>80%+</option>
              <option value={85}>85%+</option>
              <option value={90}>90%+</option>
            </select>
          </div>

          <span className="text-slate-400 font-mono tabular-nums text-xs ml-auto">
            {filteredJobs.length} {filteredJobs.length === 1 ? 'opening' : 'openings'}
          </span>
        </div>
      </div>

      {/* Jobs Feed List */}
      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <Briefcase className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-semibold text-white">No job openings match current filters</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search criteria or click &quot;Run Discovery Agent&quot; to scan LinkedIn, Naukri, and Workday portals for new positions.
            </p>
            <button
              onClick={handleRunAgent}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
            >
              Run Discovery Agent
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const isWorkday = job.portalType === 'workday';
            const isSubmitted = job.status === 'submitted';
            const isPendingReview = job.status === 'pending_review';
            const isAutofilling = autofillingJobId === job.id;

            return (
              <div
                key={job.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
              >
                {/* Header: Title, Company, Source, Match Score */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-indigo-400 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {job.company}
                      </span>
                      <span>·</span>
                      <span>Source: {job.source}</span>
                      <span>·</span>
                      <span className="capitalize">{job.portalType} Portal</span>
                    </div>
                    <h2 className="text-lg font-bold text-white hover:text-indigo-300 transition-colors">
                      {job.title}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400 pt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {job.location} ({job.remoteType})
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-mono tabular-nums">
                        <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                        {job.salaryRange}
                      </span>
                      <span>·</span>
                      <span className="text-emerald-400 font-mono tabular-nums text-[11px] flex items-center gap-1">
                        Posted {job.postedDaysAgo || 4}d ago (Freshness &le; 45d verified)
                      </span>
                      {job.isConflictOfInterest && (
                        <span className="text-rose-400 font-semibold text-[11px] bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900">
                          Current Employer Conflict
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Match Score Badge (Tabular numerals, no pill clutter) */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Match</span>
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          job.matchScore >= 90
                            ? 'text-emerald-400'
                            : job.matchScore >= 80
                            ? 'text-indigo-300'
                            : 'text-amber-400'
                        }`}
                      >
                        {job.matchScore}%
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      Discovered {new Date(job.discoveredAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Job Description Summary */}
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                  {job.description}
                </p>

                {/* Skills Analysis: Matching vs Missing */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Matching Skills:
                    </span>
                    {job.matchingSkills.map((skill, i) => (
                      <span key={i} className="text-emerald-400 font-medium">
                        {skill}
                        {i < job.matchingSkills.length - 1 ? ' ·' : ''}
                      </span>
                    ))}
                  </div>

                  {job.missingSkills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        Target Skills to Highlight:
                      </span>
                      {job.missingSkills.map((skill, i) => (
                        <span key={i} className="text-slate-400">
                          {skill}
                          {i < job.missingSkills.length - 1 ? ' ·' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Fit Rationale */}
                <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
                  <span className="font-semibold text-indigo-400 shrink-0">Agent Analysis:</span>
                  <span>{job.fitRationale}</span>
                </div>

                {/* Actions Bar */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <span>Direct Portal Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSubmitted ? (
                      <button
                        onClick={async () => {
                          if (job.applicationId) {
                            const app = await api.getWorkdayReview(job.applicationId);
                            onOpenReview(app);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-900 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Submitted (View Receipt)</span>
                      </button>
                    ) : isPendingReview ? (
                      <button
                        onClick={async () => {
                          if (job.applicationId) {
                            const app = await api.getWorkdayReview(job.applicationId);
                            onOpenReview(app);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md transition-colors"
                      >
                        <span>Review & Final Submit</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAutofillJob(job)}
                        disabled={isAutofilling}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-950 transition-colors"
                      >
                        {isAutofilling ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Auto-Filling Workday...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {isWorkday
                                ? 'Autofill & Prepare Workday App'
                                : 'Autofill Application'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
