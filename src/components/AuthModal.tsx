import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, Mail, User, ShieldCheck, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register, switchUser, demoPersonas } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
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

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
            {error}
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
