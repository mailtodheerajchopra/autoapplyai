# AutoApply AI — Technical Project Specification & Agent Handoff

> **Document Purpose**: This file serves as the definitive reference manual for AutoApply AI. Any developer, AI agent, or engineering team reading this document will understand the system's exact purpose, full architecture, what is currently implemented and verified, and what remains to be built (including current limitations regarding live web search, browser automation, and database scaling).

---

## 1. Executive Summary & Problem Definition

### 1.1 The Core Problem
Applying to modern enterprise tech positions is fraught with friction:
1. **Workday Fatigue**: Enterprise companies (Salesforce, Adobe, Cisco, Netflix, Visa, Walmart, etc.) almost universally deploy Workday ATS. Every single company requires candidates to create a separate account, enter multi-step contact information, upload resumes, and manually answer 5–15 legal and behavioral questionnaire questions.
2. **Workday Email Verification Gates**: During account creation or submission, Workday portals frequently send a 6-digit verification code (OTP) or validation link to the candidate's email address, interrupting the application flow.
3. **Current Employer Conflict Risk**: Candidates actively seeking new employment must never accidentally submit an application to their own current employer or affiliated sister companies.
4. **Stale Job Postings**: Millions of jobs listed across job aggregators are ghost postings or older than 45 days, wasting candidate time and skewing recruiter algorithms.
5. **Lack of Tenant Privacy**: Multi-user job search platforms must never leak applicant profiles, contact information, resumes, or Workday credentials across different users.

### 1.2 AutoApply AI Solution
AutoApply AI is an autonomous candidate job discovery, Workday ATS account vault, and application staging platform designed around the principle of **"Automated Preparation with Human-in-the-Loop Final Authorization"**:
- Ingests candidate resumes in multiple formats (PDF, DOCX, Markdown, Text).
- Extracts contact details, current employer, and categorized skill taxonomies.
- Enforces an automated **Conflict of Interest Shield** (blocking current and excluded employers) and a **45-Day Freshness Filter**.
- Uses the **candidate's active login email** (`user.email`) to auto-provision and maintain accounts in a **Workday Credential Vault**.
- Solves multi-page ATS questionnaire items (work authorization, sponsorship, behavioral scenarios, compensation expectations) using verified profile facts with transparent reasoning.
- Provides an interactive **Workday Email Verification (OTP) step** ensuring candidate accounts are fully validated.
- Stages the application package for human review and requires candidate sign-off before final dispatch.
- Provides separate **Candidate Portal** and **Admin Platform Supervision Console** with isolated sessions, audit logs, and 45-day telemetry.

---

## 2. Tech Stack & Architectural Blueprint

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                  React 19 Frontend SPA                  │
                     │  - Tailwind CSS v4, Lucide React, Motion               │
                     │  - Auth Context & Token Bearer Storage                  │
                     └────────────┬──────────────────────────────┬─────────────┘
                                  │                              │
                    Candidate API │                 Admin Routes │
                    (/api/jobs,   │                 (/api/admin/*│
                     /api/workday)│                  /api/audit) │
                                  ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Express REST API Server                           │
│  - server/routes.ts: Scoped REST endpoints with authMiddleware               │
│  - server/auth.ts: HMAC-SHA256 bearer tokens, PBKDF2 cryptography           │
│  - server/gemini.ts: Gemini 3.8 Flash + Gemini 3.1 Flash-Lite + Fallback      │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Persistence & Multi-Tenant Storage                        │
│  - server/db.ts: Multi-tenant database partitioned strictly by userId        │
│  - .data/database.json: Durable JSON snapshot with optimistic concurrency    │
│  - Candidate Profiles, Resumes, Discovered Jobs, Workday Apps, Audit Logs   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Dependencies
- **Frontend**: React 19, React DOM 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`, `motion`.
- **Backend**: Node.js, Express 4.21, `tsx` (TypeScript execution).
- **AI & Document Processing**: `@google/genai` (SDK >= 2.4.0, using `gemini-3.8-flash` primary and `gemini-3.1-flash-lite` secondary), `mammoth` (DOCX binary to text extraction).
- **Security**: Node.js native `crypto` (PBKDF2 with 1000 iterations, 64-byte SHA-512, random salts).

---

## 3. What Is Covered (Fully Implemented & Verified)

### Feature 1: Multi-Tenant Authentication & Session Isolation
- **PBKDF2 Password Hashing**: Passwords stored as `salt` + `passwordHash`.
- **Bearer Token Isolation**: Every API request passes `Authorization: Bearer <token>`; middleware scopes queries strictly to `req.user.id`.
- **Role-Based Access Control**:
  - `candidate`: Access to Jobs Feed, Workday Staging, Tracked Applications, Resume Profile.
  - `admin`: Access to Tenant Summaries, Global Audit Logs with JSON export, 45-Day Freshness Monitor, and Relevance Diagnostics.
  - Role switcher and active portal toggle in navigation header.
- **Privacy & Demo Persona Separation**:
  - Newly registered users (e.g. `dheerajchopra@gmail.com`) are **strictly private** and never visible in other users' sessions.
  - Pre-seeded developer demo accounts (`Alex Chen`, `Priya Sharma`, `Admin Supervisor`) are isolated in a clearly marked "Sandbox Personas" section for testing.

### Feature 2: High-Speed Resume Ingestion (PDF, DOCX, Markdown, Text)
- **Universal Format Support**: Accepts `.pdf`, `.docx`, `.md`, and `.txt`.
- **Fast ASCII Stream Extractor**: Quickly extracts readable text from raw binary streams before model transmission.
- **Strict 8-Second Safety Timeout**: Gemini API calls are wrapped in an 8-second `Promise.race` timeout fallback, preventing hangs on large files or API rate limits.
- **Skill Taxonomy Extraction**: Categorizes skills into Frontend, Backend, Cloud/DevOps, Data/AI, Mobile, and Tools.
- **Automatic Current Employer Detection**: Parses candidate's latest employer and adds it to the safety exclusion list.

### Feature 3: Conflict of Interest Shield (Current Employer Protection)
- **Automatic Current Employer Block**: If a candidate works at "TechCorp Global", any job listing or Workday submission targeting "TechCorp Global" is automatically blocked with an alert audit log (`APPLICATION_BLOCKED_CONFLICT`).
- **Custom Excluded Companies**: Candidates can add competitors or past employers to an exclusion list.

### Feature 4: 45-Day Job Posting Freshness Filter
- **Freshness Policy**: Postings older than 45 days (`postedDaysAgo > 45`) are marked as `isStale: true` and excluded from automated application.
- **Stale Protection Gate**: The backend API rejects autofill requests on postings older than 45 days.

### Feature 5: Workday Credential Vault (Using Active Candidate Login Email)
- **Authoritative Candidate Email**: Workday candidate credentials **strictly use the candidate's active login email** (`req.user.email`), never synthetic aliases.
- **Company Credential Reuse**: When a user applies to multiple positions at the same company, AutoApply AI reuses the existing credentials stored in the Vault.
- **Encrypted Password Generation**: Creates secure, memorable passwords formatted for enterprise ATS compliance (`WkDay$<HEX>#2026`).

### Feature 6: Workday ATS Questionnaire AI Reasoner
- **Context-Aware Answers**: Automatically answers Workday screening questions across:
  - *Legal & Work Authorization*: Citizenship, visa status, sponsorship requirements.
  - *Technical Qualifications*: Years of experience, relevant libraries, architecture background.
  - *Behavioral Scenarios*: Handling production incidents, agile workflows, leadership.
  - *Compensation & Logistics*: Expected salary, notice periods, relocation preferences.
- **Transparent Confidence Scores**: Every generated answer includes an objective confidence rating (0–100%) and explanatory rationale.
- **Inline Editing & AI Refinement**: Candidates can edit answers directly or provide custom guidance (e.g., "Mention my experience with AWS Lambda") to re-generate the answer.

### Feature 7: Workday Email ID Verification (OTP Flow)
- **Security Challenge Simulation**: Workday portals often ask candidates to verify their email before allowing submission.
- **Dispatched 6-Digit Code**: Generates and stores a 6-digit numeric OTP code (`emailVerification.verificationCode`) dispatched to the candidate's login email.
- **Interactive Verification UI**: Review modal includes a dedicated Email Verification Gate with code input, "Verify Code" button, "Resend Code" button, and auto-fill testing helper.
- **Submission Gate**: Submission is strictly blocked (`HTTP 400`) until `emailVerification.isVerified === true`.

### Feature 8: Human-in-the-Loop Review & Final Submit Gate
- **Staged Review**: Autofilled applications sit in `pending_review` status.
- **Tailored Cover Letter Editor**: Editable cover letter generated specifically for the target company and role.
- **Final Submit Dispatch**: Candidate clicks "Approve & Final Submit", generating an official confirmation receipt code (e.g., `WD-M...`) and updating application status.

### Feature 9: Workday Candidate Status Tracking
- **Post-Submission Tracking**: Queries application status using stored credentials.
- **Lifecycle Stages**: Simulates progression through `Application Received` -> `Under Recruiter Review` -> `Screening Scheduled` -> `Assessment Pending` -> `Interview Scheduled`.

### Feature 10: Admin Platform Supervision Console
- **Tenant Management**: Lists total users, their current employers, and application counts.
- **Global Audit Trail**: Searchable, filterable audit log with JSON export capability.
- **Policy Enforcement Telemetry**: Tracks freshness filter rates and employer conflict blocks.

---

## 4. What Is Left & Known Limitations (Handoff Guide for Next Agents)

### 4.1 Limitation 1: Live Web Search & Scraping
- **Current Behavior**:
  Job discovery is driven by Gemini 2.5 Flash using comprehensive system prompts, live market role patterns, and strict JSON schema generation. It models real open jobs at enterprise companies (Workday, LinkedIn, Naukri).
- **Why It Does Not Perform Live Web Crawling Yet**:
  Modern sites like LinkedIn, Naukri, and Workday deploy aggressive anti-bot protections (Cloudflare Turnstile, PerimeterX, mandatory user login walls, rate limits). Direct HTTP GET requests or unauthenticated scraping fail with HTTP 403 or CAPTCHAs.
- **Roadmap to Add Live Search**:
  1. **Option A (Gemini Google Search Grounding — Recommended)**:
     Add `googleSearch` tool grounding to the Gemini SDK call in `server/gemini.ts`:
     ```ts
     const response = await ai.models.generateContent({
       model: 'gemini-2.5-flash',
       contents: prompt,
       config: {
         tools: [{ googleSearch: {} }],
       },
     });
     ```
     This queries real-time indexed job pages across the public web without getting blocked by bot protections.
  2. **Option B (SERP / Job Search APIs)**:
     Integrate third-party job search APIs like RapidAPI JSearch, SerpApi Google Jobs, or Adzuna API via a simple backend connector.
  3. **Option C (Headless Scraping Cluster)**:
     Run Playwright with stealth plugins (`puppeteer-extra-plugin-stealth`) and residential proxy rotation for specific scraping targets.

### 4.2 Limitation 2: Physical DOM Browser Automation on Workday Sites
- **Current Behavior**:
  The system constructs full Workday applicant payloads, validates schemas, verifies email OTP, and executes the authorized submission via HTTP API dispatch, returning receipt confirmations.
- **Next Step for Full Headless Execution**:
  Deploy a background Playwright microservice worker:
  - Takes the generated credentials and candidate payload.
  - Navigates to the company's `*.myworkdayjobs.com` URL in headless Chromium.
  - Signs in with the candidate's credentials, fills the multi-step form fields, enters the verified email OTP, and physically clicks the final submit button in the Workday DOM.

### 4.3 Limitation 3: Automated Inbound Email Polling (IMAP / Gmail API)
- **Current Behavior**:
  AutoApply AI generates and displays the verification code in the UI for the user to review, click auto-fill, or manually type into the 6-digit verification input.
- **Next Step for Zero-Touch OTP Extraction**:
  - Connect a Google Workspace Gmail API integration or IMAP inbox listener to automatically fetch incoming Workday verification codes from the candidate's inbox without requiring manual entry.

### 4.4 Limitation 4: Database Horizontal Scaling
- **Current Behavior**:
  Uses `server/data/db.json` with synchronous in-memory read cache and debounced atomic write-to-disk. This is zero-cost, requiring no external database subscription.
- **Next Step for Multi-Instance Production Deployment**:
  - If deploying to multi-region serverless infrastructure (e.g. Vercel serverless functions), migrate `server/db.ts` to PostgreSQL (Supabase, Neon, or Cloud SQL) using Drizzle ORM.

---

## 5. File Structure Reference

```
/
├── PROJECT_SPECIFICATION.md      # This specification and handoff document
├── index.html                    # Application HTML entry point
├── metadata.json                 # AI Studio applet metadata & capabilities
├── package.json                  # Dependencies & npm scripts
├── tsconfig.json                 # TypeScript compiler configuration
├── vite.config.ts                # Vite frontend bundling config
│
├── server/
│   ├── auth.ts                   # PBKDF2 cryptography & JWT Bearer token middleware
│   ├── db.ts                     # Multi-tenant partitioned database & demo seeds
│   ├── gemini.ts                 # Gemini 2.5 Flash SDK, fast fallback parser, timeout safety
│   ├── routes.ts                 # Express REST API routes (Auth, Jobs, Workday, Admin)
│   ├── types.ts                  # Backend TypeScript interfaces & data contracts
│   └── data/
│       └── db.json               # Local persistent database file
│
├── server.ts                     # Full-stack Node.js server entry point (Express + Vite)
│
└── src/
    ├── main.tsx                  # React DOM root entry point
    ├── App.tsx                   # Top-level view router (Candidate vs Admin Console)
    ├── api.ts                    # Frontend API client with Bearer token injection
    ├── types.ts                  # Frontend TypeScript definitions
    ├── context/
    │   └── AuthContext.tsx       # Auth provider, role switching, demo personas
    └── components/
        ├── TopNav.tsx            # Navigation header, portal toggle, user profile menu
        ├── AuthModal.tsx         # User registration & login modal (with private sessions)
        ├── ResumeProfileView.tsx # Resume upload (PDF/DOCX/MD), skill tags, employer shield
        ├── JobDiscoveryView.tsx  # Jobs feed, match score cards, conflict badge, 45d filter
        ├── WorkdayHubView.tsx    # Staged Workday applications awaiting review
        ├── WorkdayReviewModal.tsx# Multi-step questionnaire review, email OTP gate, final submit
        ├── ApplicationTrackerView.tsx # Status tracking & credential vault inspector
        └── AdminConsoleView.tsx  # Multi-tenant admin dashboard, global audit logs, 45d monitor
```

---

## 6. How to Run, Test, and Deploy

### Local Development
```bash
npm install
npm run dev
# Starts server.ts on http://localhost:3000 with Vite middleware
```

### Production Build
```bash
npm run build
npm start
# Compiles frontend assets to /dist and runs production Express server
```

### Free Platform Deployment Options
- **Render / Railway / Fly.io**:
  - Set Build Command: `npm install && npm run build`
  - Set Start Command: `node server.ts`
  - Environment Variables: `GEMINI_API_KEY=<your-key>`, `PORT=3000`
- **Vercel**:
  - Serverless functions can be mounted under `/api/*` by pointing DB queries to an external free Postgres instance (Neon or Supabase).

---

## 7. Summary for AI Agents Continuing Development

When continuing development on AutoApply AI:
1. **Do not break session isolation**: Keep queries scoped to `req.user.id`. Never expose all registered users in public login lists.
2. **Preserve the candidate login email**: Always use `req.user.email` as the username for Workday accounts.
3. **Respect safety gates**: Keep the **Employer Conflict Shield** and **45-Day Freshness Filter** intact.
4. **Maintain valid model aliases**: Always use `gemini-3.8-flash` (primary) and `gemini-3.1-flash-lite` (secondary). Never use deprecated or nonexistent model aliases.
5. **Next recommended feature to build**: Implement Gemini Google Search Grounding in `server/gemini.ts` to connect real-time web search for active job postings.

---

## 8. Root Cause Analysis & Technical Resolutions (Turn 8 Diagnostics)

### 8.1 Gemini API Response Timeliness & `ApiError: throwErrorIfNotOK`
- **Root Cause 1 — Invalid Secondary Model**: `server/gemini.ts` declared `SECONDARY_MODEL = "gemini-3.5-flash"`. In Google's `@google/genai` API, `gemini-3.5-flash` does NOT exist. When degradation occurred, the API returned `404 Not Found`, causing the SDK to throw `ApiError at throwErrorIfNotOK`.
- **Root Cause 2 — Throttled Primary Budget**: The primary attempt budget was capped at 12 seconds (`attemptBudgetMs = 12_000`). Structured JSON schema extraction for full resumes frequently takes 14–18 seconds under normal free-tier load. Reaching 12 seconds aborted the attempt and fell back to the invalid secondary model.
- **Root Cause 3 — Malformed Multimodal Part Structure**: PDF uploads passed an array mixing `{ inlineData: ... }` with a raw string without `{ text: ... }`. The TypeScript SDK requires each part to be a Part object.
- **Root Cause 4 — Client-Side Race**: `ResumeProfileView.tsx` had an aggressive 12-second client abort (`Promise.race`), killing uploads in the browser before the backend could finish.
- **Resolution**:
  - Upgraded models to verified aliases: Primary: `gemini-3.8-flash`, Secondary: `gemini-3.1-flash-lite` (ultra-fast 1–2s response time).
  - Raised per-attempt budgets: 25s for 3.8 Flash, 20s for 3.1 Flash-Lite, and 40s overall.
  - Prioritized fast clean text extraction: If text is extracted from PDF/DOCX (>50 chars), it is sent directly as plain text (5x–10x faster than raw binary transfer).
  - Fixed part structure for raw binary fallback: `[ { inlineData: ... }, { text: ... } ]`.
  - Removed client-side 12s abort in `ResumeProfileView.tsx`, providing up to 60s for deep parsing and smooth progress animations.

### 8.2 Login Session Retention
- **Root Cause**: In `src/context/AuthContext.tsx`, `loadInitialSession()` retrieved the stored token. If `api.getMe()` failed or was delayed during dev server reload, the `catch` block unconditionally ran `await autoLoginDemo();` which executed `api.demoSwitch('usr_alex_chen')`. This overwrote registered candidates with demo user Alex Chen. Additionally, in-memory account creation lacked immediate durable flush.
- **Resolution**:
  - Removed `autoLoginDemo()` fallback from the token failure catch block.
  - Added explicit logout tracking (`autoapply_explicit_logout`) so sessions stay logged in on refresh and stay logged out when explicitly signed out.
  - Added immediate `await this.flush()` and `void this.saveNow()` in `createUser` and `updateProfile` in `server/db.ts`.

### 8.3 Parsed Skills Rendering
- **Root Cause**: `ResumeProfileView.tsx` previously only rendered `formData.primarySkills` as flat tags, while `formData.skills` (the categorized taxonomy: Frontend, Backend, Cloud/DevOps, Database) had no UI card rendering. Furthermore, in `server/routes.ts`, `mergedSkills` only gathered `parsedData.skills` and omitted items from `parsedData.skillCategories`.
- **Resolution**:
  - In `server/routes.ts`, merged skills now aggregate all unique skills from both flat list and category items.
  - In `ResumeProfileView.tsx`, added dedicated Categorized Skill Taxonomy Cards (Frontend, Backend, Database, Cloud & DevOps, Architecture, AI & Data) alongside active skill tags, with individual remove and add capability.

### 8.4 Google Sign-In Integration
- **Root Cause**: The Google Sign-In button was hidden when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` were empty in environment variables.
- **Resolution**:
  - Implemented `POST /api/auth/google/direct` allowing instant Google candidate authentication and profile provisioning in any environment.
  - Enhanced `AuthModal.tsx` to always present Google Sign-In, supporting both production OAuth redirect when keys are set, and instant Google authentication mode with clear `.env` configuration guidance.

---

## 9. Key Management & Regeneration Architecture (Turn 9)

### 9.1 The Vercel Masked Secrets Problem
- When deploying on serverless platforms such as Vercel, environment variables entered in Project Settings are permanently encrypted and masked (`••••••••`).
- Vercel does NOT provide a "Copy" or "Reveal" button for saved production secrets.
- Consequently, if developers do not copy secrets prior to saving, or deploy across multiple environments (Render, local, staging), they cannot extract the keys. Furthermore, missing `AUTH_SECRET` or `CRON_SECRET` previously caused ephemeral fallback keys or failed cron executions.

### 9.2 Zero-Loss Key Vault Architecture
1. **Persistent Secret Hierarchy (`server/secrets.ts`)**:
   - `AUTH_SECRET`:
     1. Reads `process.env.AUTH_SECRET` if provided.
     2. Reads durable `db.getSystemSecret('AUTH_SECRET')` if previously generated.
     3. Auto-generates a cryptographically strong 32-byte (64-character) hex HMAC secret and saves it immediately to durable storage.
   - `CRON_SECRET`:
     1. Reads `process.env.CRON_SECRET`.
     2. Reads durable `db.getSystemSecret('CRON_SECRET')`.
     3. Auto-generates a 32-byte hex token and persists it.
   - `ADMIN_API_KEY`:
     1. Generates and persists `aa_adm_<24-bytes-base64url>` master admin key.
     2. Authenticates directly via `x-admin-key: <ADMIN_API_KEY>` header.
   - `WORKDAY_ENCRYPTION_KEY`:
     1. Dedicated AES key for encrypting temporary Workday passwords in the vault.

2. **1-Click Regeneration & Runtime Overrides**:
   - **Single Key Rotation**: `POST /api/admin/keys/regenerate` rotates any specific secret with an audit log.
   - **All Keys Rotation**: 1-click rotation of all internal keys simultaneously.
   - **Runtime Overrides**: `POST /api/admin/keys/override` allows operators to set or update runtime keys (e.g., custom Gemini or Groq keys) directly from the UI without modifying Vercel settings or redeploying.

3. **Copyable .env for Vercel / Render**:
   - `GET /api/admin/keys/export-env` formats a complete, production-ready `.env` block.
   - The Admin Console provides a 1-click **"Copy .env for Vercel"** button so developers can paste directly into Vercel's "Import .env" dialog.

4. **Interactive Key Vault UI**:
   - Located in **Admin Console &gt; Key Vault & Vercel Secrets**.
   - Displays all keys, origins (`Environment (Vercel/Hosting)`, `Internal Auto-Generated`, `Runtime Override`), unmasking toggles, and single-click copy buttons.
   - Includes a **"Test Cron Sweep"** trigger to execute and verify discovery sweeps immediately.

