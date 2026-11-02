# AutoApply AI - Autonomous Job Discovery & Workday Auto-Fill Agent

> **Production-grade AI agent platform that autonomously monitors job openings across LinkedIn, Naukri, and Workday portals, extracts candidate skills from resumes (PDF, DOCX, MD, TXT), provisions employer portal accounts, solves ATS questionnaires with transparent AI reasoning, and presents everything in a staging dashboard for Human-in-the-Loop review and one-click final submission.**

---

## 🌟 Key Capabilities

### 1. 🛡️ Conflict-of-Interest & Current Employer Shield
- **Last/Current Employer Blacklist**: AutoApply AI automatically detects your current/last employer from your resume and profile (e.g. `HyperScale Cloud Tech`) and places it on a strict blocklist.
- **Interception Guarantee**: The discovery agent and Workday autofill engine are forbidden from applying to current or blacklisted past employers. Any attempt triggers an immediate security alert and audit block.

### 2. ⏳ Strict 45-Day Job Posting Freshness Policy
- **Stale Listing Rejection**: Automatically evaluates original posting timestamps and strictly discards any openings older than **45 days** (`postedDaysAgo > 45`).
- **Freshness Transparency**: Every job card clearly displays its posting age (e.g., `Posted 4d ago (Freshness <= 45d verified)`).

### 3. 🔑 Workday Credential Vault & Same-Credential Position Tracking
- **Multi-Position Credential Reuse**: When applying to multiple openings at the same company (e.g., Salesforce, Adobe), AutoApply AI checks the **Credential Vault** and reuses your existing applicant account.
- **Live Status Tracking**: Track your application status over time (`Application Received` &rarr; `Under Recruiter Review` &rarr; `Screening Scheduled` &rarr; `Interview Scheduled`) via your saved credentials.
- **Full History**: View timestamped status transition logs for each employer portal.

### 4. 📊 Relevance & Matching Diagnostics ("How do I know it's bringing the right jobs?")
- **Explainable Skill Match Matrix**: Inspect exact skill overlap percentages, matching technical competencies, and missing skills for every discovered job.
- **Relevance Scoreboard**: Visual diagnostic metrics on average match score, top matched technologies across openings, and precision verification.
- **Live Diagnostic Prober**: Interactive diagnostics explaining why each opening was selected and why stale/conflict jobs were rejected.

### 5. 📜 Comprehensive Audit Trail & Event Logging
- **Immutable System Audit Trail**: Complete event history logging security checks, stale job exclusions, account provisioning, questionnaire reasoning, human review approvals, and portal dispatch timestamps.
- **Exportable Records**: Export full audit logs in JSON/CSV format for verification and record-keeping.

### 5. 🔒 Strict Multi-User Authentication & Session Isolation
- **No Mixed Sessions**: Cryptographic 32-byte bearer tokens isolate session memory.
- **Row-Level Tenant Security**: Every database lookup enforces `userId === req.user.id`. User A cannot access, query, or mutate User B's profile, resumes, or applications.
- **PBKDF2 Password Hashing**: Passwords stored with individual 16-byte cryptographic salts and 1,000 SHA-512 iterations.
- **Pre-Loaded Test Accounts**: Switch instantly between **Alex Chen** (Senior Full-Stack Engineer) and **Priya Sharma** (Cloud & DevOps Architect) to verify zero data bleed between sessions.

---

## 🏗️ System Architecture

```
                                  ┌─────────────────────────────┐
                                  │       Client Browser        │
                                  │  (React 19 + Tailwind v4)   │
                                  └──────────────┬──────────────┘
                                                 │ Authorization: Bearer <token>
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Express Server (server.ts)                                                              │
│                                                                                         │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────────┐  │
│  │  Auth & Session Layer │   │ Job Discovery Agent   │   │ Workday Autofill Engine   │  │
│  │  (PBKDF2 + Salts)     │   │ (Multi-Portal Scraper)│   │ (Questionnaire Solver)    │  │
│  └──────────┬────────────┘   └──────────┬────────────┘   └─────────────┬─────────────┘  │
│             │                           │                              │                │
│             ▼                           ▼                              ▼                │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Gemini 3.8 Flash Engine (@google/genai SDK)                                       │  │
│  │ - Multimodal Resume Extraction (PDF/DOCX/MD)                                      │  │
│  │ - Real-Time Job Synthesis & Fit Rationale                                         │  │
│  │ - Workday Questionnaire Reasoning & Custom Cover Letters                          │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
│                                                 │                                       │
│                                                 ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Isolated Database Service (server/db.ts)                                          │  │
│  │ - Strict Tenant Partitioning (userId scoped)                                      │  │
│  │ - High-Throughput In-Memory Caching + Atomic Non-Blocking Disk Flush              │  │
│  │ - Zero-Cost Serverless Ready (Render Disk / Neon Postgres / Supabase)             │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Cost-Effective Free Deployment Guide

### Option 1: Render (100% Free Web Service)

Render provides a completely free tier with automatic Git deployments and full Express + Vite support:

1. Create a free account at [render.com](https://render.com).
2. Click **New + > Web Service** and select your GitHub repository.
3. Configure the build parameters:
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: `Free ($0/month)`
4. Under **Environment Variables**, add:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   NODE_ENV=production
   PORT=3000
   ```
5. Click **Create Web Service**. Your app is live with free SSL!

*(Optional: For persistent storage across restarts on Render, attach a 1 GB free Persistent Disk mounted to `/.data`)*.

---

### Option 2: Vercel (Free Serverless Tier)

1. Import the repository into [vercel.com](https://vercel.com).
2. The included `vercel.json` maps API routes to `@vercel/node` and static client files to the edge CDN.
3. Add `GEMINI_API_KEY` in Project Settings > Environment Variables.
4. Deploy!

---

### Option 3: Free Database Services

AutoApply AI's database layer (`server/db.ts`) can be connected to any free SQL provider:
- **Neon Serverless PostgreSQL** (Free 0.5 GiB, auto-sleep, scale-to-zero)
- **Supabase** (Free 500 MB Postgres database with instant REST)
- **Local SQLite / JSON** ($0 cost, built-in, zero external dependencies)

---

## ⚡ Concurrency & Scale Architecture

To handle high traffic and concurrent discovery operations:
1. **Stateless Authorization**: Tokens are verified in memory with zero database round-trips for authenticated requests.
2. **Debounced Atomic Persistence**: Database state writes are debounced (150ms buffer) to eliminate disk I/O contention.
3. **Async Queue Workers**: Multi-portal job discovery and resume parsing execute in non-blocking background threads, preventing HTTP event-loop lag.
4. **Memory Indexed Lookups**: All active user datasets are cached in memory with $O(1)$ key lookups by `userId`.

---

## 💻 Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/your-username/autoapply-ai.git
cd autoapply-ai

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Set GEMINI_API_KEY in .env

# 4. Start full-stack dev server
npm run dev

# App runs at http://localhost:3000
```

---

## 🧪 Verifying Multi-User Isolation

To confirm that candidate sessions never bleed:
1. Open the app in your browser (defaults to **Alex Chen**, Senior Full-Stack Engineer).
2. View his saved applications (Salesforce, Adobe, Netflix).
3. Click the user badge in the top-right corner and select **Priya Sharma** (Principal DevOps Engineer).
4. Notice that the entire dashboard immediately switches to Priya's unique data: Cloud infrastructure openings, Kubernetes resume skills, and distinct Workday applications.
5. Create a brand new account via **New Account / Register** to see a completely blank, isolated tenant environment.

---

## 📜 License
Apache-2.0
