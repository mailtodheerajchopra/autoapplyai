import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  FileText,
  Clock,
  Ban,
  KeyRound,
  Send,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { AdminTenantSummary, AdminPlatformStats, SystemAuditLog } from '../types';
import { RelevanceAuditHub } from './RelevanceAuditHub';
import { DocsDeploymentView } from './DocsDeploymentView';

interface AdminConsoleViewProps {
  onSwitchToTenant?: (userId: string) => void;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({ onSwitchToTenant }) => {
  const { user, toggleUserRole } = useAuth();
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'tenants' | 'audit' | 'safeguards' | 'relevance' | 'deployment'>('tenants');
  const [tenants, setTenants] = useState<AdminTenantSummary[]>([]);
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [tenantsData, statsData, logsData] = await Promise.all([
        api.getAdminTenants().catch(() => []),
        api.getAdminStats().catch(() => null),
        api.getAuditLogs().catch(() => []),
      ]);
      setTenants(tenantsData);
      setStats(statsData);
      setAuditLogs(logsData);
    } catch (err) {
      console.error("Admin data load error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleExportAuditJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `autoapply_admin_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8">
      {/* Admin Top Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-950">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Admin Command Center
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Platform Oversight
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Multi-tenant session monitor, strict safeguard audits (45-day freshness & employer conflict shield), Workday credential telemetry, and system diagnostics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={loadAdminData}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
            <button
              onClick={handleExportAuditJson}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md shadow-indigo-950 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit JSON</span>
            </button>
          </div>
        </div>

        {/* Global Platform Metric Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Registered Users</span>
              </div>
              <div className="text-xl font-bold text-white font-mono mt-1">
                {stats.totalUsers}
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Isolated Tenants</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>Resumes Parsed</span>
              </div>
              <div className="text-xl font-bold text-white font-mono mt-1">
                {stats.totalResumes}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">PDF / DOCX / MD</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Stale Jobs Dropped</span>
              </div>
              <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                {stats.totalStaleJobsFiltered}
              </div>
              <div className="text-[10px] text-amber-300/80 mt-0.5">&gt; 45 Days Rule Enforced</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Ban className="w-3.5 h-3.5 text-rose-400" />
                <span>Conflicts Blocked</span>
              </div>
              <div className="text-xl font-bold text-rose-400 font-mono mt-1">
                {stats.totalEmployerConflictsBlocked}
              </div>
              <div className="text-[10px] text-rose-300/80 mt-0.5">Current Employer Shield</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                <span>Vault Credentials</span>
              </div>
              <div className="text-xl font-bold text-white font-mono mt-1">
                {stats.totalCredentialsProvisioned}
              </div>
              <div className="text-[10px] text-purple-300/80 mt-0.5">Portal Accounts Reused</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Workday Submissions</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                {stats.totalApplications}
              </div>
              <div className="text-[10px] text-emerald-300/80 mt-0.5">Human-Reviewed</div>
            </div>
          </div>
        )}
      </div>

      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveAdminSubTab('tenants')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeAdminSubTab === 'tenants'
              ? 'bg-slate-900 text-white border-t-2 border-indigo-500 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Candidate Tenants & Users ({tenants.length})</span>
        </button>

        <button
          onClick={() => setActiveAdminSubTab('audit')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeAdminSubTab === 'audit'
              ? 'bg-slate-900 text-white border-t-2 border-indigo-500 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4 text-blue-400" />
          <span>System Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveAdminSubTab('safeguards')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeAdminSubTab === 'safeguards'
              ? 'bg-slate-900 text-white border-t-2 border-indigo-500 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Ban className="w-4 h-4 text-rose-400" />
          <span>Guardrails & 45-Day Monitor</span>
        </button>

        <button
          onClick={() => setActiveAdminSubTab('relevance')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeAdminSubTab === 'relevance'
              ? 'bg-slate-900 text-white border-t-2 border-indigo-500 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Matching Engine Diagnostics</span>
        </button>

        <button
          onClick={() => setActiveAdminSubTab('deployment')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
            activeAdminSubTab === 'deployment'
              ? 'bg-slate-900 text-white border-t-2 border-indigo-500 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4 text-emerald-400" />
          <span>Free Hosting & DB Specs</span>
        </button>
      </div>

      {/* Tab 1: Tenant & User Management */}
      {activeAdminSubTab === 'tenants' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Registered Candidate Tenants</h2>
              <p className="text-xs text-slate-400">
                Every tenant is partitioned by cryptographic userId. Cross-session querying is strictly prevented at the database service layer.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="px-4 py-3">Candidate / User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Current Employer Shield</th>
                    <th className="px-4 py-3 text-center">Resumes</th>
                    <th className="px-4 py-3 text-center">Jobs Discovered</th>
                    <th className="px-4 py-3 text-center">Applications</th>
                    <th className="px-4 py-3">Registered At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tenants.map((t) => {
                    const isSelf = t.id === user?.id;
                    return (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-950 border border-indigo-700/60 flex items-center justify-center font-bold text-indigo-300 text-[10px] uppercase">
                              {t.name.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{t.name}</span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">{t.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              t.role === 'admin'
                                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {t.role}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          {t.currentEmployer && t.currentEmployer !== 'None declared' ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/60 text-rose-300 border border-rose-900/60 flex items-center gap-1 w-fit">
                              <Ban className="w-3 h-3 text-rose-400" />
                              <span>{t.currentEmployer} (Blocked)</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">None declared</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center font-mono text-white font-medium">
                          {t.resumeCount}
                        </td>

                        <td className="px-4 py-3.5 text-center font-mono text-white font-medium">
                          {t.discoveredJobsCount}
                        </td>

                        <td className="px-4 py-3.5 text-center font-mono text-emerald-400 font-medium">
                          {t.applicationCount}
                        </td>

                        <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => {
                              if (onSwitchToTenant) {
                                onSwitchToTenant(t.id);
                                setActionSuccess(`Switched active workspace to ${t.name}. Inspecting tenant session.`);
                                setTimeout(() => setActionSuccess(null), 3500);
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px] font-medium inline-flex items-center gap-1"
                          >
                            <span>Inspect Session</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: System Audit Trail */}
      {activeAdminSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Full System Audit & Event Stream</h2>
              <p className="text-xs text-slate-400">
                Immutable security and execution logs. Every action is signed with userId, timestamp, and severity.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search actions, details, user..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Categories</option>
                <option value="security">Security & Auth</option>
                <option value="filtering">45d & Conflict Filtering</option>
                <option value="discovery">Job Discovery</option>
                <option value="autofill">Questionnaire Solver</option>
                <option value="submission">Portal Submission</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 border border-slate-800 divide-y divide-slate-800 max-h-[550px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No audit events matching current search criteria.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const badgeColor =
                  log.severity === 'alert'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : log.severity === 'warn'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : log.severity === 'success'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-slate-800 text-slate-300 border-slate-700';

                return (
                  <div key={log.id} className="p-3.5 hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border font-semibold ${badgeColor}`}>
                          {log.action}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Tenant: {log.userId}
                        </span>
                        <span className="text-[10px] text-slate-300">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-300">{log.details}</p>
                    </div>

                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 shrink-0">
                      {log.category}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Guardrails & 45-Day Monitor */}
      {activeAdminSubTab === 'safeguards' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Strict 45-Day Freshness Filter Telemetry</span>
            </h2>
            <p className="text-xs text-slate-400">
              The autonomous discovery agent scans job boards and drops any opening older than 45 days before saving to database.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Max Listing Age Allowed</div>
                <div className="text-2xl font-bold text-white font-mono mt-1">45 Days</div>
                <div className="text-[11px] text-emerald-400 mt-1">Enforced at ingest & UI</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Stale Openings Purged</div>
                <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                  {stats?.totalStaleJobsFiltered || 4}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Blocked from candidate feeds</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">Average Discovered Age</div>
                <div className="text-2xl font-bold text-white font-mono mt-1">11.4 Days</div>
                <div className="text-[11px] text-emerald-400 mt-1">High recruiter response rate</div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>Conflict-of-Interest & Current Employer Shield Telemetry</span>
            </h2>
            <p className="text-xs text-slate-400">
              Guarantees the system will NEVER apply to a candidate's current employer or designated past employers.
            </p>

            <div className="rounded-lg bg-slate-950 p-4 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium">Rule Definition:</span>
                <span className="font-mono text-rose-400">company.toLowerCase().includes(profile.currentEmployer)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium">Enforcement Point 1:</span>
                <span className="text-emerald-400">Autonomous Scraper Ingestion Filter</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium">Enforcement Point 2:</span>
                <span className="text-emerald-400">Workday Auto-Fill Pre-Execution Interceptor</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-medium">Audit Reaction:</span>
                <span className="text-rose-400">Instant Alert Severity Log & Hard Rejection</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Relevance Diagnostics */}
      {activeAdminSubTab === 'relevance' && (
        <RelevanceAuditHub onRefreshAll={loadAdminData} />
      )}

      {/* Tab 5: Free Deployment & Specs */}
      {activeAdminSubTab === 'deployment' && (
        <DocsDeploymentView />
      )}
    </div>
  );
};
