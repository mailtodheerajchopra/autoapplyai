# ApplyMatica (AutoApply AI) — Autonomous Job Discovery & Workday Auto-Fill Agent

> **Live: [https://www.applymatica.com](https://www.applymatica.com)** — production on Vercel (Hobby, $0/mo).

## The problem it solves

Job hunting fails in boring, mechanical ways:

1. **Discovery is manual and repetitive.** You re-search the same portals every day; fresh postings are buried under week-old listings you've already seen.
2. **Every company's Workday/ATS portal makes you re-type the same answers** — profile, education, work authorization, questionnaire, cover letter — for every single posting.
3. **Real risk of self-sabotage:** applying to your own current employer, or to roles that demand 10 years of experience when you have 3.
4. **Quota reality of AI tools:** naive "ask the LLM to find jobs per user per click" designs burn model quota instantly and fall over on the free tier.

AutoApply AI is a production-grade agent platform that:

- **Discovers relevant openings** across LinkedIn, Naukri, and Workday portals and **remembers history** — the first scan covers a full 45-day window, then a daily cron sweep asks the model *only for postings from the last ~2 days* and merges them into the historical pool. Every next-day search costs almost nothing.
- **Extracts skills from your resume** (PDF/DOCX/MD/TXT via multimodal parsing) — without ever showing or leaking your CV keywords in the UI; they're applied server-side.
- **Pre-fills Workday applications and reasons through ATS questionnaires** with transparent step-by-step logging, then holds everything at a **Human Review Gate** — nothing is ever auto-submitted.
- **Enforces candidate-safety rules** before anything reaches you: current/past-employer conflict shield, strict 45-day freshness, location policy (an India candidate never sees US on-site roles — Remote always allowed), and an experience-demand rule ("N+ years" parsing + seniority-title heuristics).
- **Tracks every submitted application** with an applied-date, Workday confirmation code, and a timestamped status history — per candidate, fully isolated.

---

## Key capabilities

### 1. Shared DiscoveryPool + incremental daily sweeps
- One market scan per **(skills fingerprint + filters)** is stored as a shared pool — 10 users with the same profile = **1 AI call instead of 10**.
- Per-user rules are applied **at serve time**, never stored, so the pool stays user-agnostic.
- The cron sweeper (Vercel Cron, guarded by a `CRON_SECRET` bearer) refreshes the most-requested markets with a **recency-window prompt** and folds results into history with dedupe, a 60-posting cap, and a 61-day prune.

### 2. Candidate-safety filter chain (server-enforced, tested)
- **Conflict shield** — your current/last employer and explicit blocklist can never surface.
- **45-day freshness** — postings age per-job with their own fetch timestamp; calendar-rotten entries never render.
- **Location rule** — country inference incl. `City, ST` state-suffix heuristics; cross-country on-site is blocked, Remote is always kept.
- **Experience rule** — `N+ years` demands beyond a +2-year tolerance and seniority-titled roles (Staff/Principal/Director/internships) are hidden, never applied to.
- **Match floor** — optional minimum relevance score.

### 3. Workday credential vault & status tracking
- Applying to multiple openings at the same company **reuses your existing applicant account** (credential vault).
- Full timestamped **status history** (`Application Received` → `Under Recruiter Review` → `Screening Scheduled` → …) plus a per-application **Applied Date** and confirmation-code receipt.

### 4. Explainable matching
- Skill-overlap matrix (matching/missing skills), 0–100 relevance score, and a fit rationale for **every** discovered posting — plus filters diagnostics showing exactly how many jobs each rule dropped.

### 5. Sign-in with Google (optional) + strict auth
- Google OAuth with CSRF-signed state (HMAC-SHA256, 10-min expiry) and **verified-email-only** account linking; passwordless candidate provisioning for new Gmail users.
- HMAC bearer sessions, PBKDF2 password hashing with per-user salts, strict `userId`-scoped tenancy.

### 6. Prompt-injection defense & moderation
- A zero-cost **moderation gate** screens uploaded CVs (hidden/zero-width/bidi chars, injection vocabulary, payload blobs) and rejects hostile documents **before** any model call.
- Every Gemini prompt carries an **UNTRUSTED-DATA rule**; all model inputs/outputs are sanitized (incl. deep-sanitized structured payloads and the shared pool).

### 7. Immutable audit trail
- Every security check, stale/conflict exclusion, account provisioning, questionnaire decision, human review approval, and portal dispatch is logged with timestamps; admin console supports export.

---

## Architecture

```
 React 19 + Tailwind SPA
        │ Authorization: Bearer <token>
        ▼
 Express API on Vercel Functions — single serverless entry (maxDuration=60)
 ├── Auth        (PBKDF2 + salts, Google OAuth, adminGuard)
 ├── Job Agent   (async 202 + poll; stale-job rescue on eviction; 202→poll keeps UI unblocked)
 ├── Autofill    (Workday questionnaire reasoning → Human Review Gate)
 └── Cron        (daily discovery sweep; recency-window prompt)
        │                │
        ▼                ▼
 Gemini 3.8-flash → 3.5-flash → mock     Supabase JSONB snapshot
 (timeout-bounded degradation chain)     (atomic read-modify-write,
                                          3-attempt retry, RLS on)
```

- **Async design:** `POST /agent/discover` returns `202 + jobId in <300ms`; the model call runs in the background and the client polls — with *stale-job rescue* so a serverless eviction can never strand a run.
- **Model degradation chain:** primary 12s → secondary 30s → mock fallback. 429/503 degrade silently; the product keeps working at zero quota.

| Tests | Vitest + Supertest — **45 tests** (auth lockdown, filter chain, moderation, async pipeline, pool merge, storage round-trip) |
| Load | k6 — kickoff p95 ≈ 300 ms under concurrency, 0 errors |
| Cost | $0 — Hobby plan, free Gemini tier amortized by the shared pool, free Supabase tier |

---

## Deployment (Vercel — recommended, what this repo runs on)

1. Import the repository into [vercel.com](https://vercel.com).
2. `vercel.json` maps API routes to the serverless entry and the SPA to the edge CDN, and registers the daily cron (`30 5 * * *`).
3. Configure **all environment variables below** in Project Settings → Environment Variables (Production).
4. Optionally add your custom domain (`A @ → 76.76.21.21` / `CNAME www → cname.vercel-dns.com` at your DNS provider).
5. Deploy. First boot seeds a durable snapshot from the Supabase env vars.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Durable storage endpoint (project URL) |
| `SUPABASE_SECRET_KEY` | ✅ | Storage service key — **server-side only, never ship to browser** |
| `AUTH_SECRET` | ✅ | HMAC secret for bearer tokens / OAuth state (`node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`) |
| `GEMINI_API_KEY` | ✅ | Agent model calls (free-tier ready; degrades gracefully) |
| `CRON_SECRET` | ✅ | Bearer guard for `/api/cron/discovery-sweep` (requests without it get 401/404) |
| `ADMIN_EMAIL` | ✅* | Admin account email — see **Credential ownership** below |
| `ADMIN_PASSWORD` | ✅* | Admin account password (strong & random) |
| `APP_URL` | ⬜ | Self-referential links / callbacks |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ⬜ | Enables "Sign in with Google" (button auto-appears; also list your redirect URI in Google Cloud console) |
| `GROQ_API_KEY` | ⬜ | Open-source fallback tier: when both Gemini tiers are quota-exhausted, discovery degrades to Llama 3.3 70B hosted on Groq (free key at console.groq.com) before the mock |

\* If `ADMIN_EMAIL`/`ADMIN_PASSWORD` are absent, the app generates a random admin password and logs it **once** to the server console — set the env vars before going public.

### Credential ownership (why collaborators can't lock you out)

- **No credential exists in the repository** — not in code, not in seed data. Cloning or forking the repo gives you a working app with no passwords at all.
- The admin account is **derived from env on every boot**: `ADMIN_EMAIL`/`ADMIN_PASSWORD` override the stored record at cold start. Even if the stored database record were somehow modified (e.g. by a bad migration), your Vercel env values re-apply immediately on the next boot.
- **Who can rotate what:**
  - Repository collaborators can change **code** — they cannot affect your running deployment unless they also have write access to your Vercel project. Keep the Vercel project (and Supabase) under your **personal** account, with **2FA enabled**, and never add repo-side deploy hooks to the production project you don't control.
  - User registrations can never escalate: the register endpoint always creates a `candidate`, even for emails containing "admin" (self-grant holes are closed and covered by tests).
- Rotating a password = updating the env var in Vercel and redeploying. Nothing else.

---

## Local development

```bash
git clone https://github.com/mailtodheerajchopra/autoapplyai.git
cd autoapplyai
npm install
cp .env.example .env        # fill in GEMINI_API_KEY, AUTH_SECRET, Supabase keys
npm run dev                 # full-stack dev server at http://localhost:3000
npm run test                # 45 tests
```

With no env config the app still boots in degraded mode (mock agent paths) — good for UI work.

## Verifying user isolation (no demo data)

1. Register a fresh account → you get a clean, empty candidate tenant.
2. Upload your CV → the profile, skills, and targets are parsed from it (keywords stay private in the UI).
3. Run your first search → results are yours alone; every lookup is `userId`-scoped server-side.
4. A second account in the same browser sees none of the first user's jobs, resumes, or applications.

---

## License

Apache-2.0
