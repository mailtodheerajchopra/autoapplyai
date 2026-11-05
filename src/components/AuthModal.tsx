import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, consumeStoredOAuthError } from '../api';
import { X, Lock, Mail, User, ShieldCheck, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register, switchUser, demoPersonas } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [linkedinEnabled, setLinkedinEnabled] = useState(false);
  // One-shot OAuth failure surfaced from the callback redirect (?oauthError=...).
  const [oauthError] = useState<string | null>(() => consumeStoredOAuthError());

  React.useEffect(() => {
    api.getAuthProviders()
      .then((p) => {
        setGoogleEnabled(p.google);
        setLinkedinEnabled(p.linkedin);
      })
      .catch(() => {
        setGoogleEnabled(false);
        setLinkedinEnabled(false);
      });
  }, []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Please enter your full name');
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Multi-User Isolated Sessions</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegister ? 'Create Candidate Account' : 'Sign In to AutoApply AI'}
          </h2>
          <p className="text-xs text-slate-400">
            Your candidate profile, resumes, and Workday credentials are encrypted and isolated per user.
          </p>
        </div>

        {(error || oauthError) && (
          <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
            {error || (oauthError === 'cancelled' ? 'Sign-in was cancelled.' : `Sign-in failed: ${oauthError}`)}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            {isRegister && (
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-950"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegister ? 'Register Account' : 'Sign In'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
              <div className="relative flex justify-center"><span className="px-3 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">or</span></div>
            </div>

            {googleEnabled && (
              <a
                href="/api/auth/google/start"
                className="w-full h-10 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                <span>{isRegister ? 'Sign up with Google' : 'Sign in with Google'}</span>
              </a>
            )}

            {linkedinEnabled && (
              <a
                href="/api/auth/linkedin/start"
                className="w-full h-10 rounded-lg bg-[#0A66C2] hover:bg-[#004182] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"/></svg>
                <span>{isRegister ? 'Sign up with LinkedIn' : 'Sign in with LinkedIn'}</span>
              </a>
            )}
          </form>

        <div className="text-center">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            {isRegister
              ? 'Already have an account? Sign In'
              : "Don't have an account? Register"}
          </button>
        </div>

        {/* Quick Demo Switcher Section — dev-only (demo endpoints 404 in prod) */}
        {demoPersonas.length > 0 && (
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Pre-Loaded Sandbox Personas:
            </span>
            <span className="text-[10px] text-emerald-400">Isolated Sessions</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {demoPersonas.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={async () => {
                  await switchUser(u.id);
                  onClose();
                }}
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white truncate">{u.name}</p>
                  <span className={`text-[9px] px-1 rounded uppercase font-semibold ${
                    u.role === 'admin' ? 'bg-indigo-950 text-indigo-400' : 'bg-emerald-950 text-emerald-400'
                  }`}>
                    {u.role}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate font-mono mt-0.5">{u.email}</p>
              </button>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
