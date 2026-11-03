# AutoApply AI — Interview / Technical Overview

One-page deep-dive: what the application is, the architecture, the tech choices, the hard problems, and the guardrails. Use this to walk an interviewer through the project in 5–10 minutes.

---

## 1. What it is

**AutoApply AI** is a production-deployed, autonomous job-discovery and Workday auto-fill platform. It:

1. Parses a candidate's CV with AI (PDF/DOCX/MD/TXT) into a structured profile.
2. Runs an **async agent** that scans for matching jobs across portals (LinkedIn, Naukri, Workday tenants, Indeed-style listings), scores the fit, and stages applications.
3. Prepares **Workday applications**: portal accounts, question answers, tailored cover letters — **always stopped at a human Review Gate** before anything submits.

Live: `https://autoapplyai-gules.vercel.app`

---

## 2. Architecture (one paragraph to say aloud)

React (TypeScript) SPA → Express API deployed as a **single serverless entry on Vercel** → Firestore-style **document snapshot in Supabase** (one JSONB row, secret-key-only with RLS) → **Gemini AI** for parsing/discovery/form-prep → **Vercel Cron** sweeper keeping a shared discovery pool fresh. All heavy AI work is kicked off **asynchronously** (`202 Accepted` + poll), so the UI never blocks on a model call.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | fast build (~300ms), type-safe contracts |
| API | Node/Express on Vercel Functions | single entry (`maxDuration=60`) for long AI calls |
| Storage | Supabase JSONB snapshot (RLS, secret key only) | serverless-friendly "durable blob with atomic read-modify-write" — persisted on every mutation with **3-attempt retry** on network blips |
| AI | Google Gemini (`gemini-3.8-flash` → `3.5-flash` degradation chain) | structured JSON output via response schemas; free-tier aware |
| Tests | Vitest + Supertest — **36 tests** | API-level contract tests incl. auth lockdown, filters, moderation, async pipeline, storage round-trip |
| Load | k6 | verified p95 ≈ 300ms kickoff under concurrent load, 0 API errors |
| Infra | Vercel (Hobby) + Vercel Cron + GitHub CI-less manual sync | zero-cost deployment with production alias |

---

## 4. The 5 interesting engineering problems (lead with these)

### 4.1 Async agents that stay fast on serverless
- `POST /agent/discover` returns **202 + jobId in <300ms**; the model runs in the background; client polls status (progress stages: scanning → parse → freshness → conflict → stored).
- **Stale-job rescue**: serverless instances get evicted mid-run; a job stranded >45s is seamlessly resumed by the next status poll (idempotent per job record).

### 4.2 Model degradation chain (free-tier resilience)
```
gemini-3.8-flash (12s attempt budget) → gemini-3.5-flash (30s) → mock fallback
```
- Per-attempt timeouts via `Promise.race`, known-bad models cached per process, 429/503 treated as "degrade", never crash. The product keeps working even when Gemini quota is exhausted.

### 4.3 Shared DiscoveryPool (quota amortization)
- One market scan per **(skills fingerprint + filters)**, TTL 4h, stored as a shared pool of template jobs.
- Per-user rules applied **at serve time** (never stored): 45-day freshness (postings age as the pool ages), current-employer conflict shield, preferred-location rule, min match score.
- 10 users with the same profile = **1 AI call instead of 10**.
- Daily **cron sweeper** refreshes the most-requested scans so users find *new* postings without triggering runs (guarded by `CRON_SECRET` bearer).

### 4.4 The location/culture rule
- "A person in India should not see a US on-site job unless it's remote": country inference (country words + `City, ST` state-suffix heuristics), cross-state US postings allowed, `Remote` always kept, explicit `targetLocations` supported.

### 4.5 Free-tier data durability
- One optimistic snapshot write per mutation; transient Supabase `fetch failed` retried with bounded backoff; registration writes are **awaited & acknowledged** (`persisted: true/false` in the response).

---

## 5. Security & guardrails (interviewer donut: auth → perspective → guardrails)

### Auth hardening (server-enforced, not just UI)
- HMAC bearer tokens; PBKDF2 password hashing.
- **Registration always creates candidates** — role is never inferred from the request body or even from an email containing "admin" (both classic self-grant holes, both found and closed).
- Role change, demo endpoints, user list: admin-only (403).
- Demo persona backdoors: **404 in production** unless explicitly enabled.
- Admin data endpoints behind an `adminGuard` middleware; admin deletion endpoint for account management.
- Change-password flow (verify current + min length); bad logins answer 401.

### Prompt-injection defense (4 layers)
1. **Moderation gate** (static, zero-cost): hidden/zero-width/bidi character density, prompt-injection vocabulary (~10 patterns), payload blobs → reject (422) / flag / allow before any model call.
2. **Untrusted-data system rule** on every Gemini prompt: CV text, profile fields, and scraped descriptions are DATA — embedded directives are never followed.
3. **Input/output scrubbing**: control chars smuggle-removed, length caps, deep-sanitized model payloads (so anything slipping out of one prompt can't re-inject the next one, or the shared pool).
4. **Review Gate**: everything entering a Workday form (answers, cover letter, account) is human-reviewed. Nothing auto-submits.

### Data privacy
- `.env` secrets never committed; Supabase secret key with RLS; credentials hashed; per-user data isolation; the shared pool carries no user-specific filters (applied per user at serve time).

---

## 6. Numbers to remember

| Metric | Value |
|---|---|
| Kickoff latency under load (k6, concurrent users) | p95 ≈ 300 ms |
| Discovery run (background) | ~10–30s (model-bound, never blocks UI) |
| Tests | 36 passing (API contract + filters + moderation + async pipeline) |
| Deploy | Vercel production alias, single `api/index.ts` entry (60s budget) |
| Free-tier cost | $0 — Hobby plan, daily cron, Gemini free tier amortized by the pool |

---

## 7. Anticipated interview Q&A

**Q: Why a single JSONB snapshot instead of tables?**
Day-1 serverless pragmatism: atomic snapshot swap, trivial hydrate path, no per-request connection strings leaking across cold starts. Trade-off: update contention at scale — the DB seam (`DatabaseService`) isolates the swap to one file if we outgrow it.

**Q: Why poll instead of WebSockets/SSE?** Serverless functions are short-lived; polling is transport-agnostic, survives instance eviction, and lets any instance *resume* a stranded job.

**Q: What breaks at 100× users?** Gemini quota (solved by pool + degradation), Supabase snapshot write contention (move to real SQL), cron cadence limit (Pro plan). All named, measured, and isolated by seams.

**Q: Why not auto-submit applications?** Human Review Gate by design: bot-hostile Workday steps (captcha/OTP/2FA) require humans anyway, and fully-automated submission is ToS-hostile and reputationally risky.

**Q: How do you test AI features without AI costs?** Mock-fallback paths are exercised in tests (`GEMINI_API_KEY` deleted in test bootstrap); the degradation chain's last tier IS the test harness.

---

## 8. What's next (shows growth mindset)

- Real Workday tenant probing for *live* portal metadata (today: portal-pattern-driven)
- SQL/Postgres migration + optimistic-concurrency revisions of the snapshot writer
- Pro plan cron (4h cadence) once user count justifies it
- Rate-limit login attempts / IP throttling, password reset via email
- New-job notifications (email/Telegram digest from the sweeper)
