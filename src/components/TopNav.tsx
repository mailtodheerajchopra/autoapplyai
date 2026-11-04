import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { Briefcase, UserCheck, ShieldCheck, ChevronDown, LogOut, RefreshCw, Shield, Sparkles, User, ExternalLink, KeyRound } from 'lucide-react';

interface TopNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: () => void;
  pendingReviewsCount: number;
}

// Sandbox persona UI is dev-only; the demo-switch endpoint 404s in production.
const DEMO_UI_ENABLED = import.meta.env.DEV;

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenAuth,
  pendingReviewsCount,
}) => {
  const { user, demoPersonas, switchUser, logout, activePortal, setActivePortal } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showSandboxPersonas, setShowSandboxPersonas] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const candidateNavItems = [
    { id: 'jobs', label: 'Discovered Jobs' },
    {
      id: 'workday',
      label: pendingReviewsCount > 0 ? `Workday Reviews (${pendingReviewsCount})` : 'Workday Staging',
    },
    { id: 'tracker', label: 'Tracked Applications' },
    { id: 'profile', label: 'My Resume & Profile' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          {/* Zone 1: Brand Wordmark & Mode Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm ${
              activePortal === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}>
              {activePortal === 'admin' ? <Shield className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
            </div>
            <div className="flex items-baseline gap-2">
              <button
                onClick={() => {
                  if (activePortal === 'candidate') {
                    setActiveTab('jobs');
                  }
                }}
                className="text-lg font-bold tracking-tight text-white hover:text-indigo-300 transition-colors whitespace-nowrap text-left"
              >
                AutoApply AI
              </button>
              <span
                className={`hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  activePortal === 'admin'
                    ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {activePortal === 'admin' ? 'Admin Console' : 'Candidate Portal'}
              </span>
            </div>
          </div>

          {/* Zone 2: Portal-Specific Navigation Links */}
          {activePortal === 'candidate' ? (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {candidateNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'text-white font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-emerald-500'
                        : 'hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <span className="font-medium text-slate-300 shrink-0">Platform Supervision Mode:</span>
              <span className="whitespace-nowrap">Tenant Security · 45-Day Policy · Conflict Shield · Audit Logs</span>
            </div>
          )}

          {/* Zone 3: Portal Switcher & Multi-User Session Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Direct Portal Toggle Button — admin portal visibility requires admin role */}
            {user?.role === 'admin' ? (
              activePortal === 'candidate' ? (
                <button
                  onClick={() => setActivePortal('admin')}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-indigo-300 border border-indigo-900/60 transition-colors"
                  title="Switch to Admin Console to inspect audit logs, 45d telemetry, and tenant manager"
                >
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold">Admin Console</span>
                </button>
              ) : (
              <button
                onClick={() => {
                  setActivePortal('candidate');
                  setActiveTab('jobs');
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-emerald-300 border border-emerald-900/60 transition-colors"
                title="Return to Candidate Portal to view jobs, staging, and apply to Workday"
              >
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold">Candidate View</span>
              </button>
              ))
              : null}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 hover:border-slate-700 transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase border ${
                    user.role === 'admin' 
                      ? 'bg-indigo-900/80 border-indigo-600 text-indigo-200' 
                      : 'bg-emerald-900/80 border-emerald-600 text-emerald-200'
                  }`}>
                    {user.name.slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <span className="font-medium max-w-[110px] truncate block">{user.name}</span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                      {user.role}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-800 mb-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-200">{user.name}</p>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase ${
                          user.role === 'admin'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                      <p className="text-slate-400 truncate text-[11px] font-mono">{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Isolated Session Active</span>
                      </div>
                    </div>

                    {(user.role === 'admin' || DEMO_UI_ENABLED) && (
                      <div className="pt-1 border-t border-slate-800">
                        <button
                          onClick={() => setShowSandboxPersonas(!showSandboxPersonas)}
                          className="w-full px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 flex items-center justify-between transition-colors"
                        >
                          <span className="font-semibold uppercase tracking-wider">
                            Test Personas (Sandbox Only)
                          </span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${showSandboxPersonas ? 'rotate-180' : ''}`} />
                        </button>

                        {showSandboxPersonas && (
                          <div className="space-y-1 mt-1 max-h-40 overflow-y-auto pr-1">
                            <p className="px-2 py-0.5 text-[9px] text-slate-400">
                              Registered accounts are private and hidden from other users.
                            </p>
                            {demoPersonas.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => {
                                  switchUser(u.id);
                                  setUserDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                                  u.id === user.id
                                    ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 font-medium'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                              >
                                <div className="truncate pr-2">
                                  <p className="font-medium truncate flex items-center gap-1.5 text-[11px]">
                                    <span>{u.name}</span>
                                    <span className={`text-[8px] px-1 rounded uppercase ${
                                      u.role === 'admin' ? 'bg-indigo-950 text-indigo-400' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                      {u.role}
                                    </span>
                                  </p>
                                  <p className="text-[9px] text-slate-400 truncate font-mono">{u.email}</p>
                                </div>
                                {u.id === user.id ? (
                                  <UserCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                ) : (
                                  <RefreshCw className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-2 pt-2 border-t border-slate-800 px-2 space-y-2">
                      {user && (
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            setShowChangePassword(true);
                          }}
                          className="w-full flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors text-[11px] font-medium"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                          <span>Change Password</span>
                        </button>
                      )}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            onOpenAuth();
                          }}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-[11px]"
                        >
                          + Register New Account
                        </button>
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                        className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors text-[11px]"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Sign Out</span>
                      </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
      {user && (
        <ChangePasswordModal
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </>
  );
};
