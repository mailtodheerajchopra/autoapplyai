import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  ShieldAlert,
  Calendar,
  CheckCircle2,
  KeyRound,
  History,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  Building2,
  Eye,
  AlertTriangle,
  Download,
} from 'lucide-react';

interface RelevanceAuditHubProps {
  onRefreshAll: () => Promise<void>;
}

export const RelevanceAuditHub: React.FC<RelevanceAuditHubProps> = ({ onRefreshAll }) => {
  const [activeTab, setActiveTab] = useState<'relevance' | 'vault' | 'audit'>('relevance');
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [vaultAccounts, setVaultAccounts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncingAppId, setSyncingAppId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<string>('all');

  const loadHubData = async () => {
    setIsLoading(true);
    try {
      const [diag, vault, logs] = await Promise.all([
        api.getRelevanceDiagnostics().catch(() => null),
        api.getWorkdayVault().catch(() => []),
        api.getAuditLogs().catch(() => []),
      ]);
      setDiagnosticData(diag);
      setVaultAccounts(vault);
      setAuditLogs(logs);
    } catch (e) {
      console.error('Failed to load audit hub data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHubData();
  }, []);

  const handleSyncStatus = async (applicationId: string) => {
    setSyncingAppId(applicationId);
    try {
      await api.syncWorkdayStatus(applicationId);
      await loadHubData();
      await onRefreshAll();
    } catch (err) {
      alert('Status check failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSyncingAppId(null);
    }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportAuditLogs = () => {
    const jsonStr = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autoapply-audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (auditFilter === 'all') return true;
    return log.category === auditFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Relevance Verification, Workday Vault & Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time verification of job matching accuracy, 45-day freshness cutoffs, employer conflict safeguards, saved Workday credentials, and full audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadHubData}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Diagnostics</span>
          </button>
          <button
            onClick={exportAuditLogs}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('relevance')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'relevance'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Job Relevance & Match Proof</span>
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'vault'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Workday Credential Vault & Tracking ({vaultAccounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>System Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: HOW DO I KNOW IT IS REALLY WORKING / BRINGING THE RIGHT SET OF JOBS? */}
      {activeTab === 'relevance' && diagnosticData && (
        <div className="space-y-6">
          {/* Diagnostic KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Avg Skill Match Fit
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {diagnosticData.metrics.averageMatchScore}%
              </div>
              <p className="text-[11px] text-slate-400">Validated against candidate resume</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                45-Day Freshness Filter
              </span>
              <div className="text-2xl font-bold font-mono text-indigo-300 tabular-nums">
                {diagnosticData.metrics.jobsUnder45Days} Active
              </div>
              <p className="text-[11px] text-slate-400">
                {diagnosticData.metrics.jobsOver45DaysBlocked} stale postings blocked (&gt;45d)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Employer Conflict Shield
              </span>
              <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                {diagnosticData.metrics.currentEmployerConflictsBlocked} Intercepted
              </div>
              <p className="text-[11px] text-slate-400">
                Blocked from &quot;{diagnosticData.profileAnalyzed.currentEmployer || 'None'}&quot;
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Resume Skills Indexed
              </span>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {diagnosticData.profileAnalyzed.totalSkillsIdentified}
              </div>
              <p className="text-[11px] text-slate-400">Across Frontend, Backend, Cloud</p>
            </div>
          </div>

          {/* Verification Rules Explainer */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>How AutoApply AI Guarantees High-Relevance Job Matches</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {diagnosticData.relevanceCriteria.map((c: any, i: number) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{c.criterion}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono">
                      {c.status}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">{c.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Matched Technologies Frequency Breakdown */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              <span>Top Skills Driving Current Job Matches</span>
            </h2>
            <p className="text-xs text-slate-400">
              The agent specifically targets openings that heavily demand these skills from your resume:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {diagnosticData.topMatchedTechnologies.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{item.skill}</span>
                  <span className="font-mono text-emerald-400 font-bold tabular-nums">
                    {item.occurrences} {item.occurrences === 1 ? 'match' : 'matches'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WORKDAY CREDENTIAL VAULT & STATUS TRACKING USING SAME CREDENTIALS */}
      {activeTab === 'vault' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-400" />
              <span>Workday Candidate Credential Vault</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              When applying to multiple positions at the same employer on Workday (e.g. Salesforce or Adobe), AutoApply AI reuses the same portal account credentials so all your applications remain consolidated in your official candidate dashboard.
            </p>
          </div>

          {vaultAccounts.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
              No Workday portal accounts provisioned yet. Accounts are automatically saved here whenever you autofill a Workday job application.
            </div>
          ) : (
            <div className="space-y-4">
              {vaultAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-base text-white">{acc.company}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-indigo-300">{acc.portalDomain}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Linked Applications: {acc.linkedApplicationIds?.length || 1} position(s) managed
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyText(`Username: ${acc.username}\nPassword: ${acc.temporaryPasswordMasked}`, acc.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
                      >
                        {copiedId === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === acc.id ? 'Copied' : 'Copy Credentials'}</span>
                      </button>

                      {acc.linkedApplicationIds?.[0] && (
                        <button
                          onClick={() => handleSyncStatus(acc.linkedApplicationIds[0])}
                          disabled={syncingAppId === acc.linkedApplicationIds[0]}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingAppId === acc.linkedApplicationIds[0] ? 'animate-spin' : ''}`} />
                          <span>Sync Live Status</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Credentials View */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">
                        Workday Portal Username
                      </span>
                      <p className="text-slate-200 select-all truncate">{acc.username}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-0.5">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">
                        Saved Portal Password
                      </span>
                      <p className="text-slate-200 select-all truncate">{acc.temporaryPasswordMasked}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Filter Event Category:</span>
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 focus:outline-none"
              >
                <option value="all">All Events ({auditLogs.length})</option>
                <option value="security">Security & Conflict Checks</option>
                <option value="filtering">45-Day Freshness Filters</option>
                <option value="discovery">Job Discovery Runs</option>
                <option value="autofill">Workday Account Autofills</option>
                <option value="submission">Portal Submissions</option>
                <option value="status_sync">Live Status Syncs</option>
              </select>
            </div>
            <span className="text-slate-400 font-mono tabular-nums">
              {filteredLogs.length} audit entries
            </span>
          </div>

          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const isAlert = log.severity === 'alert';
              const isSuccess = log.severity === 'success';
              const isWarn = log.severity === 'warn';

              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                          isAlert
                            ? 'bg-rose-950 text-rose-300 border border-rose-900'
                            : isSuccess
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-900'
                            : isWarn
                            ? 'bg-amber-950 text-amber-300 border border-amber-900'
                            : 'bg-slate-950 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-slate-400 capitalize text-[11px] font-sans">
                        [{log.category}]
                      </span>
                    </div>

                    <span className="text-slate-400 font-mono text-[11px] tabular-nums">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-slate-200 leading-relaxed font-sans">{log.details}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
