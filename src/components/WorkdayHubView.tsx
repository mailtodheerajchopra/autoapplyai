import React from 'react';
import { WorkdayApplication } from '../types';
import workdayPreview from '../assets/images/workday_portal_preview_1793616104164.jpg';
import {
  Building2,
  Clock,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  KeyRound,
  FileCheck,
} from 'lucide-react';

interface WorkdayHubViewProps {
  applications: WorkdayApplication[];
  onOpenReview: (app: WorkdayApplication) => void;
  onNavigateToJobs: () => void;
}

export const WorkdayHubView: React.FC<WorkdayHubViewProps> = ({
  applications,
  onOpenReview,
  onNavigateToJobs,
}) => {
  const pendingApps = applications.filter((a) => a.status !== 'submitted');
  const submittedApps = applications.filter((a) => a.status === 'submitted');

  return (
    <div className="space-y-8">
      {/* Workday Pipeline Overview Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            <span>Autonomous Workday Orchestrator</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
            Automated Workday account provisioning & questionnaire reasoning
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            Enterprise sites using Workday require creating unique accounts and answering multi-page screening questionnaires. AutoApply AI handles the tedious registration and form filling, staging everything for your final approval.
          </p>

          {/* 4-Step Architecture Steps */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              <p className="font-semibold text-slate-200">1. Account Provision</p>
              <p className="text-[11px] text-slate-400">Unique credentials per tenant</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <FileCheck className="w-4 h-4 text-indigo-400" />
              <p className="font-semibold text-slate-200">2. Schema Pre-fill</p>
              <p className="text-[11px] text-slate-400">Experience & education mapped</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <Zap className="w-4 h-4 text-indigo-400" />
              <p className="font-semibold text-slate-200">3. AI Reasoner</p>
              <p className="text-[11px] text-slate-400">Answers ATS questionnaires</p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <p className="font-semibold text-slate-200">4. Review Gate</p>
              <p className="text-[11px] text-slate-400">Human signs off final submit</p>
            </div>
          </div>
        </div>

        {/* Workday Portal Mockup Preview */}
        <div className="lg:col-span-5">
          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xl group">
            <img
              src={workdayPreview}
              alt="Workday Applicant Tracking Dashboard Mockup"
              referrerPolicy="no-referrer"
              className="w-full h-52 object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 text-xs flex items-center justify-between">
              <span className="font-medium text-slate-200">Workday ATS Integration Verified</span>
              <span className="text-[11px] text-emerald-400 font-mono">100% Compliant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Staged Applications Awaiting Final Review */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Pending Review & Final Submit</span>
            </h2>
            <p className="text-xs text-slate-400">
              These applications have been autofilled and require your review and final authorization before dispatch.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {pendingApps.length} {pendingApps.length === 1 ? 'application' : 'applications'}
          </span>
        </div>

        {pendingApps.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <p className="text-sm text-slate-300 font-medium">No applications currently pending review</p>
            <p className="text-xs text-slate-400">
              Browse available openings in the discovery feed and click &quot;Autofill Workday App&quot; to stage an application.
            </p>
            <button
              onClick={onNavigateToJobs}
              className="mt-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
            >
              Browse Openings
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingApps.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-400 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {app.company}
                    </span>
                    <span className="text-amber-400 font-medium text-[11px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/80">
                      Needs Review
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white">{app.jobTitle}</h3>

                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Candidate Login Email:</span>
                      <span className="font-mono text-emerald-300 font-medium truncate max-w-[180px]">
                        {app.generatedAccount.username}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Email Verification:</span>
                      {app.emailVerification?.isVerified ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          <span>OTP Required</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>AI Solved Questions:</span>
                      <span className="font-mono text-indigo-300">
                        {app.questionAnswers.length} questions mapped
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <a
                    href={app.workdayPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <span>View Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={() => onOpenReview(app)}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <span>Review & Final Submit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submitted Applications History */}
      {submittedApps.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Submitted Applications Receipt Archive</span>
              </h2>
              <p className="text-xs text-slate-400">
                Official proof receipts and confirmation IDs received from employer Workday portals.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {submittedApps.length} {submittedApps.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="space-y-3">
            {submittedApps.map((app) => (
              <div
                key={app.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{app.jobTitle}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-indigo-400">{app.company}</span>
                    <span className="text-slate-400">·</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-[10px] border border-indigo-800">
                      Workday Status: {app.workdayCandidateStatus || 'Under Recruiter Review'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 flex-wrap">
                    <span>Receipt:</span>
                    <span className="font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-900">
                      {app.submissionAudit?.confirmationCode || 'WD-SUBMITTED'}
                    </span>
                    <span>·</span>
                    <span>Vault Login:</span>
                    <span className="font-mono text-slate-300">{app.generatedAccount.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenReview(app)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                  >
                    Audit Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
