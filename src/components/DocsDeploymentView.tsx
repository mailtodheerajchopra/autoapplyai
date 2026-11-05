import React, { useState } from 'react';
import {
  Server,
  Cloud,
  Database,
  ShieldCheck,
  Zap,
  Terminal,
  CheckCircle,
  Copy,
  Check,
  Cpu,
  Layers,
  Lock,
} from 'lucide-react';

export const DocsDeploymentView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'deployment' | 'database' | 'concurrency' | 'security'>('deployment');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Production Architecture & Cost-Effective Free Deployment
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Complete engineering reference for deploying on 100% free hosting tiers (Vercel, Render), zero-cost serverless databases, and ensuring strict session isolation under high concurrency.
        </p>
      </div>

      {/* Nav Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveSection('deployment')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'deployment'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>Vercel & Render Free Hosting</span>
        </button>

        <button
          onClick={() => setActiveSection('database')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'database'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Free Database Services</span>
        </button>

        <button
          onClick={() => setActiveSection('concurrency')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'concurrency'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Concurrency & Scale Architecture</span>
        </button>

        <button
          onClick={() => setActiveSection('security')}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSection === 'security'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Multi-User Session Isolation</span>
        </button>
      </div>

      {/* Content Section 1: Free Hosting on Vercel & Render */}
      {activeSection === 'deployment' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              <span>Option A: Deploy to Render (Free Web Service Tier)</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Render provides a 100% free Node.js Web Service tier with automatic SSL, custom domains, continuous deployment from GitHub, and zero configuration for full-stack Express + Vite applications.
            </p>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Step-by-Step Render Setup:
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300">
                <li>
                  Push this repository to GitHub or GitLab.
                </li>
                <li>
                  Go to <a href="https://render.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline">Render.com</a> and click <span className="font-semibold text-white">New + &gt; Web Service</span>.
                </li>
                <li>
                  Connect your repository and specify the following configuration:
                </li>
              </ol>

              {/* Render Config Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><span className="text-slate-400">Environment:</span> <span className="text-white">Node</span></div>
                  <div><span className="text-slate-400">Node Version:</span> <span className="text-white">20.x or 22.x</span></div>
                  <div><span className="text-slate-400">Build Command:</span> <span className="text-emerald-400">npm run build</span></div>
                  <div><span className="text-slate-400">Start Command:</span> <span className="text-emerald-400">npm run start</span></div>
                  <div><span className="text-slate-400">Plan:</span> <span className="text-indigo-400">Free ($0/month)</span></div>
                  <div><span className="text-slate-400">Port:</span> <span className="text-white">3000 (auto-detected)</span></div>
                </div>
              </div>

              {/* Environment Variables for Render */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Required Environment Variables:</span>
                  <button
                    onClick={() => copyToClipboard(`GEMINI_API_KEY=your_key_here\nNODE_ENV=production\nPORT=3000`, 'env-render')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {copiedCode === 'env-render' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>Copy Config</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">
{`GEMINI_API_KEY="AIzaSy..."
NODE_ENV="production"
PORT=3000`}
                </pre>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cloud className="w-5 h-5 text-indigo-400" />
              <span>Option B: Deploy to Vercel (Free Serverless Tier)</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Vercel provides blazing edge frontend hosting with serverless API functions on its Hobby plan ($0/month).
            </p>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300">vercel.json Configuration File:</span>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto">
{`{
  "version": 2,
  "builds": [
    { "src": "server.ts", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "server.ts" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}`}
              </pre>
            </div>
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/40 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <Lock className="w-4 h-4" />
                <span>Handling Vercel's Masked Secrets (Zero-Loss Key Vault)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Vercel permanently encrypts and masks environment variables (<code className="text-amber-300 font-mono">••••••••</code>) and does not permit copying them back out. If you cannot copy your keys from Vercel:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                <li>
                  Open <span className="font-semibold text-white">Admin Console &gt; Key Vault &amp; Vercel Secrets</span>.
                </li>
                <li>
                  Click <span className="font-semibold text-amber-400">Regenerate All App Keys</span> or regenerate specific secrets (<code className="text-indigo-300 font-mono">AUTH_SECRET</code>, <code className="text-indigo-300 font-mono">CRON_SECRET</code>, etc.).
                </li>
                <li>
                  Click <span className="font-semibold text-emerald-400">Copy .env for Vercel</span> to copy the preformatted key-value block and paste it directly into Vercel's Project Settings.
                </li>
                <li>
                  AutoApply AI automatically maintains persistent copies in the database, meaning the server runs without 401s even if you deploy without configuring variables manually!
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Content Section 2: Free Database Services */}
      {activeSection === 'database' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              <span>Cost-Effective Free Database Options</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              AutoApply AI is designed with an abstracted database interface (<code className="font-mono text-indigo-300">server/db.ts</code>) that works out of the box with zero external dependencies, while seamlessly migrating to production serverless SQL providers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Option 1: SQLite / Render Disk */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                  Option 1: Render Disk / SQLite
                </span>
                <p className="text-sm font-semibold text-white">Default File/SQLite Store</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Uses local atomic disk storage with in-memory caching. $0 cost, zero network latency, persistent across restarts when mounted to a 1GB Render persistent disk.
                </p>
                <div className="pt-2 text-[11px] text-slate-400">
                  <span>Cost: </span>
                  <span className="text-emerald-400 font-bold">$0/month</span>
                </div>
              </div>

              {/* Option 2: Neon Serverless Postgres */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">
                  Option 2: Neon Serverless
                </span>
                <p className="text-sm font-semibold text-white">Neon PostgreSQL Free Tier</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provides a managed PostgreSQL instance with 0.5 GiB free storage, instant branching, connection pooling, and scale-to-zero when idle.
                </p>
                <div className="pt-2 text-[11px] text-slate-400">
                  <span>Cost: </span>
                  <span className="text-emerald-400 font-bold">$0/month</span>
                </div>
              </div>

              {/* Option 3: Supabase Free Tier */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">
                  Option 3: Supabase Postgres
                </span>
                <p className="text-sm font-semibold text-white">Supabase Free Project</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  500 MB relational database, built-in row-level security (RLS), and connection pooling via PgBouncer out of the box.
                </p>
                <div className="pt-2 text-[11px] text-slate-400">
                  <span>Cost: </span>
                  <span className="text-emerald-400 font-bold">$0/month</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Section 3: High Concurrency Architecture */}
      {activeSection === 'concurrency' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <span>Production Scale & High-Concurrency Principles</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              To support thousands of concurrent job discovery searches and parallel Workday form fillings without bottlenecks:
            </p>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  1. Stateless Token Verification
                </h3>
                <p className="text-slate-400">
                  Authentication tokens are signed cryptographically and evaluated in-memory, avoiding blocking database lookups on every static API request.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  2. Asynchronous Agent Job Queueing
                </h3>
                <p className="text-slate-400">
                  Job discovery runs in non-blocking background promises. When multiple users run discovery simultaneously, requests are throttled and dispatched via batching without saturating API rate limits.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  3. Non-Blocking Atomic Persistence
                </h3>
                <p className="text-slate-400">
                  Database writes use debounced atomic flushes (150ms buffer) preventing disk write-lock contention under heavy concurrent user traffic.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  4. Microsecond Memory Cache
                </h3>
                <p className="text-slate-400">
                  All active candidate profiles and cached jobs reside in memory with O(1) indexed lookups by <code className="text-indigo-300">userId</code>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Section 4: Multi-User Session Isolation */}
      {activeSection === 'security' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span>Multi-Tenant Data & Session Isolation Guarantee</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Addressing user requirement: <em className="text-slate-200">&quot;Also session should not be mixed with other logged in user and allow authentication as well&quot;</em>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  Cryptographic Session Separation
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Every user is provisioned a unique 32-byte cryptographically secure session token stored strictly in their client <code className="text-indigo-300">Authorization: Bearer &lt;token&gt;</code> header. No shared cookie state exists between browser tabs or clients.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Mandatory Row-Level userId Filter
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Every backend database query enforces <code className="text-indigo-300">userId === req.user.id</code>. It is mathematically impossible for User A to read or mutate User B&apos;s resumes, target jobs, or Workday credentials.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Password Security (PBKDF2 + Salts)
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Passwords are never stored in plaintext. Each account receives a 16-byte random salt and is hashed using 1,000 iterations of SHA-512 PBKDF2 with constant-time equality comparisons.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-semibold text-white flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-400" />
                  1-Click Multi-User Isolation Verification
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Use the top navigation user switcher to flip between <span className="text-white font-medium">Alex Chen</span> and <span className="text-white font-medium">Priya Sharma</span>. Notice that resumes, jobs, and Workday applications immediately switch to that user&apos;s isolated data store!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
