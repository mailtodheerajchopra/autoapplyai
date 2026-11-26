# ApplyMatica – Transformation Plan (AI-Powered Career & Referral Marketplace)

> This plan is the execution contract for evolving the existing ApplyMatica / AutoApply AI codebase into a trusted AI-powered career and employee-referral ecosystem. It is written against the **current** repository state on branch `OpenCode-Branch` and is intentionally additive: no existing feature, integration, or backward-compatible API is removed.

---

## Product Vision

ApplyMatica is evolving from an AI-powered job application assistant into a free career and community referral platform.

**Positioning:** ApplyMatica – Your Career. Your Network. Your Next Opportunity.

Core pillars:
- Career: job discovery, resume management, application tracking and Workday autofill.
- Referral: community-shared opportunities and employee referrals.
- Trust: current-employer verification, transparent referral status and candidate privacy.

## Most Important Business Rules

### A. Opportunity posting permissions
Every authenticated community member may post opportunities. Support three opportunity types:
1. Regular job opportunity.
2. Employee referral opportunity.
3. Community-shared job opportunity.

Do not restrict opportunity posting to verified employees. Distinguish clearly between:
- An ordinary community member sharing a job.
- A verified employee offering an employee referral.
- A recruiter posting an opportunity.

An unverified member must never be presented as a verified employee or official employee referrer.

### B. Employment verification – current employer only for now
For the initial release, implement only current-employer verification:
- Corporate email OTP is the preferred method.
- Authorized administrators may review supporting employment evidence when necessary.
- Store verification status, company affiliation, verification method and timestamps.
- Display a clear "Current Employer Verified" badge only after successful verification.
- Do not expose uploaded employment documents publicly.
- Require explicit user consent before verification.
- Never contact an employee's current employer without explicit authorization.

Do not implement previous-employer verification, education verification, identity verification, criminal checks, address verification or full background verification at this stage. Do not use the term "Background Verified".

### C. Referral workflow
Maintain a clear distinction between a referral request being accepted and an actual employee referral being submitted.

Statuses:
- Requested
- Under Review
- Shortlisted
- Accepted
- Referral Confirmed
- Referral Submitted
- Interview Scheduled
- Selected
- Rejected
- Withdrawn

Record status history with timestamps and the acting user. Only represent a referral as submitted after the employee confirms actual submission through the employer's referral process.

### D. Completely free platform
ApplyMatica must remain completely free. Do not introduce paid memberships, subscription plans, premium candidate access, paid referral requests, candidate access charges, payment gateways or monetization workflows.

## Recommended Priorities

- P0 – Core foundation: authentication/permissions, candidate and community profiles, current-employer verification, opportunity posting and discovery.
- P1 – Referral marketplace: referral requests, candidate review/shortlisting, referral confirmation and submission, status history and notifications.
- P2 – AI and privacy: AI matching and recommendations, anonymous candidate discovery, consent-based candidate visibility.
- P3 – Enhancements: recruiter dashboard, analytics, additional verification methods.

## 0. Delivery Rules (apply to every milestone)

1. **No big-bang changes.** Each milestone must be independently testable and mergeable.
2. After every milestone: run `npm run lint` and `npm test`; add/extend tests; check regressions; review data-access scoping; update this plan's "Status" notes.
3. Preserve existing job discovery, Workday autofill, credential vault, OTP gate, conflict shield, and 45-day freshness filter.
4. Never weaken existing security controls. All new endpoints sit behind `authMiddleware`; role checks happen on the server in `adminGuard`-style helpers, never only in the UI.
5. Keep the existing React 19 + TypeScript + Tailwind v4 + Express + document-snapshot persistence architecture unless a milestone explicitly justifies a change.
6. No hardcoded demo data in production flows; demo personas remain dev-only (`DEMO_UI_ENABLED`).
7. No secrets in frontend code. Reuse `server/secrets.ts` for any new server-side secret.
8. Prefer reusing existing services (`gemini.ts`, `db.ts`, `auth.ts`, `moderation.ts`) over new dependencies.
9. Every new entity must be added to both `server/types.ts` and `src/types.ts`, and to `DatabaseSchema` in `server/db.ts` with normalization in `normalizeSnapshot`.
10. Every new collection must be cleaned up in `deleteUserAndData`.

---

## 1. Phase 1 – Architecture Assessment (Current State)

### 1.1 Repository layout

```
/
├── server/
│   ├── app.ts            # Express app wiring
│   ├── auth.ts           # HMAC bearer tokens, PBKDF2, authMiddleware, guards
│   ├── db.ts             # In-memory DatabaseService over a JSON snapshot
│   ├── storage.ts        # FileStore | SupabaseStore (single app_state row)
│   ├── gemini.ts         # Gemini 3.8 Flash / 3.1 Flash-Lite, resume parsing, JD analysis
│   ├── routes.ts         # All REST endpoints
│   ├── types.ts          # Backend contracts
│   ├── secrets.ts        # Key vault (AUTH_SECRET, CRON_SECRET, ADMIN_API_KEY, ...)
│   ├── moderation.ts     # Job reporting / moderation helpers
│   ├── boards.ts         # Live board connectors (Greenhouse/Lever/Ashby)
│   ├── discovery.ts      # Discovery orchestration
│   └── data/db.json      # Local durable snapshot (dev)
├── src/
│   ├── App.tsx           # Top-level router (candidate vs admin)
│   ├── api.ts            # Frontend API client
│   ├── types.ts          # Frontend contracts
│   ├── context/AuthContext.tsx
│   └── components/       # TopNav, AuthModal, ResumeProfileView, JobDiscoveryView,
│                         # WorkdayHubView, WorkdayReviewModal, ApplicationTrackerView,
│                         # AdminConsoleView, ...
├── supabase/schema.sql   # Single app_state table (RLS: no anon policies)
├── tests/                # Vitest (auth, boards, discovery, filters, fresh-read, ...)
└── plan.md               # this file
```

### 1.2 Frontend architecture

- React 19 SPA, Vite 8, Tailwind v4, Lucide icons, Motion.
- `AuthContext` manages session token, role (`candidate`/`admin`), active portal toggle.
- `TopNav` renders candidate nav (Discovered Jobs / Workday Staging / Tracked Applications / My Resume & Profile) and admin supervision bar.
- `App.tsx` switches between candidate views and `AdminConsoleView` based on `activePortal` + role.
- Data loading is centralized in `MainDashboard.loadUserData()` (jobs, applications, resumes, agent logs).

### 1.3 Backend architecture

- Single Express server (`server.ts`) with Vite middleware in dev.
- `authMiddleware` verifies HMAC token, resolves `req.user` from snapshot (with one durable re-read on miss).
- Admin access via `adminGuard` (role === 'admin') and `x-admin-key` master key bypass.
- All routes in `server/routes.ts`; validation is ad-hoc per route (needs tightening).

### 1.4 Persistence architecture (important)

- **Document snapshot model**, not per-entity tables. `DatabaseService` holds an in-memory `DatabaseSchema`; persistence is a single JSON snapshot via `StateStore`:
  - `FileStore` (dev) writes `.data/database.json`.
  - `SupabaseStore` (prod) upserts one `app_state` row (`id='v1'`, `data` JSONB).
- `supabase/schema.sql` enables RLS on `app_state` with **zero policies**, so only the service/secret key can read/write. The browser never talks to Supabase directly.
- Optimistic concurrency: `storeVersion` is tracked; `refreshIfStale` re-reads durable store on 401/miss.
- **Implication for this plan:** "Supabase tables/RLS" in the prompt maps to (a) extending `DatabaseSchema` + snapshot, and (b) optional future per-entity tables. RLS isolation between *users* is enforced in application code via `userId` scoping, not via DB row policies, because the whole state is one row. Any future per-entity migration must add real RLS policies.

### 1.5 Authentication & authorization

- `User.role: 'candidate' | 'admin'`.
- Passwords: PBKDF2 (1000 iterations, SHA-512, 64 bytes, random salt).
- Sessions: stateless HMAC-SHA256 bearer tokens, 7-day TTL.
- Role switcher in navigation only for admin/demo.
- **Gap:** no `employee`, `recruiter`, `verifier` roles; no corporate-email verification; no affiliation verification.

### 1.6 AI services

- `server/gemini.ts`: Gemini 3.8 Flash (primary), 3.1 Flash-Lite (secondary), 8s safety timeout, fast ASCII text extraction, strict JSON schema.
- Resume parser extracts contact, skills, categories, work experience, education, current employer.
- JD analysis and matching exist for discovered jobs.
- **Reusable for referral matching:** skill extraction, experience parsing, scoring.

### 1.7 Existing features to preserve (do not duplicate)

- Multi-tenant auth & session isolation.
- Resume upload (PDF/DOCX/MD/TXT) + AI parsing + skill taxonomy.
- Conflict-of-interest shield + custom excluded employers.
- 45-day freshness filter.
- Workday credential vault (login email as username).
- Workday questionnaire AI reasoner with confidence.
- Email OTP verification gate.
- Human-in-the-loop review & final submit.
- Workday candidate status tracking.
- Admin tenant management, audit logs, key vault, cron trigger.

### 1.8 Reusable components/services

| Concern | Reuse |
|---|---|
| Auth, guards | `auth.ts`, `authMiddleware`, `adminGuard` pattern |
| DB access | `DatabaseService` methods + `persist()`/`saveNow()` |
| Audit | `addAuditLog` |
| AI parsing | `gemini.ts` resume + JD functions |
| File upload | `/resumes/upload` route + mammoth/pdf extraction |
| Notifications | none yet – build new (in-app first) |
| Moderation | `moderation.ts` for job reporting |
| Storage | `storage.ts` (snapshot) |

### 1.9 Identified risks / gaps

- **Role model** is binary; needs extension without breaking admin checks.
- **No per-entity RLS**; data isolation relies on `userId` filters in every query. New code must keep this discipline; add tests.
- **No consent/audit primitives** for sensitive docs.
- **No notification system**.
- **No candidate visibility/privacy controls**.
- **No full background-verification scope in initial release** (current-employer verification only).
- **Snapshot size** will grow with marketplace data; monitor and consider per-entity migration in Milestone 5.
- **Corporate email verification** not implemented.
- **No rate limiting / abuse protection** on new public-ish endpoints.

---

## 2. Phase 2+ Target: Role & Permission Model

Extend `User.role` union (backward compatible: existing values remain):

```
'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier'
```

- A user has **one primary role** at a time but may hold **capabilities** (e.g., a candidate can also be an employee referrer). Model this with a `capabilities: string[]` on `User` (default `[]`) rather than multiple accounts, to preserve single identity/session.
- Capability flags: `can_refer`, `can_recruit`, `can_verify`, `can_admin`.
- Corporate affiliation is **data**, not role: `EmployeeProfile.company`, `verificationStatus`.
- Guards:
  - `candidateGuard`: role in {candidate, employee, recruiter, admin} (everyone can be a candidate).
  - `employeeGuard`: capability `can_refer` OR role employee/admin.
  - `verifiedEmployeeGuard`: employee + `affiliationStatus === 'verified'`.
  - `recruiterGuard`: capability `can_recruit` OR role recruiter/admin.
  - `verifierGuard`: capability `can_verify` OR role verifier/admin.
  - `adminGuard`: role admin (unchanged).

**Rule:** selecting a company never verifies an employee. Verification requires corporate email OTP + (optionally) document/HR review.

---

## 3. Database Design (extend `DatabaseSchema`)

Add to `server/types.ts`, `src/types.ts`, `DatabaseSchema`, `normalizeSnapshot`, and `deleteUserAndData`.

### 3.1 New / extended entities

```ts
// Extended User
interface User {
  id; email; name; passwordHash; salt;
  role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier';
  capabilities: string[];
  createdAt; updatedAt;
}

// Candidate referral profile (extends CandidateProfile conceptually; keep separate to avoid breaking existing profile)
interface CandidateReferralProfile {
  id; userId;
  currentEmployer; previousEmployers: string[];
  preferredCompanies: string[];
  preferredTitles: string[];
  preferredLocations: string[];
  noticePeriodDays; availabilityDate; // ISO
  skills: string[]; experienceYears: number;
  educationSummary: string;
  employmentHistory: WorkExperience[]; // reuse
  visibility: 'private' | 'anonymous' | 'verified_employees' | 'recruiters';
  referralOptIn: boolean;
  submittedForReferral: boolean;
  profileCompleteness: number; // 0-100
  updatedAt;
}

// Employee / referrer profile
interface EmployeeProfile {
  id; userId;
  corporateEmail; company; title; department;
  emailVerified: boolean; emailVerifiedAt?;
  affiliationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  affiliationEvidence?: string[]; // document ids
  profile: { headline; summary; linkedinUrl };
  createdAt; updatedAt;
}

// Company (lightweight, deduped by name)
interface CompanyProfile {
  id; name; domain; verified: boolean; createdAt;
}

// Referral job posting
interface ReferralJob {
  id; postedByUserId; companyId?; company: string;
  title; requisitionId; description; skillsRequired: string[];
  minExperience; maxExperience; location;
  workMode: 'Remote' | 'Hybrid' | 'Onsite';
  employmentType: 'Full-time' | 'Contract' | 'Part-time' | 'Internship';
  jobUrl; referralProvider; availableSlots; filledSlots;
  expiresAt; instructions;
  status: 'draft' | 'published' | 'active' | 'filled' | 'expired' | 'closed';
  moderationStatus: 'clean' | 'reported' | 'removed';
  reports: { byUserId; reason; createdAt }[];
  createdAt; updatedAt;
}

// Referral request
interface ReferralRequest {
  id; candidateUserId; referralJobId; employeeUserId;
  status: ReferralStatus; // see below
  matchScore; matchingSkills: string[]; missingSkills: string[];
  resumeId?; coverNote?;
  createdAt; updatedAt;
}
type ReferralStatus =
  'requested' | 'under_review' | 'shortlisted' | 'accepted' |
  'referral_submitted' | 'interview_scheduled' | 'selected' |
  'rejected' | 'withdrawn';

interface ReferralStatusEvent {
  id; requestId; fromStatus?; toStatus; actorUserId; note?; createdAt;
}

// Employment verification
interface EmploymentVerification {
  id; userId; employer; designation;
  startDate; endDate?; isCurrent: boolean;
  corporateEmail; status: EmploymentVerificationStatus;
  method: 'email_otp' | 'document_review' | 'hr_verification' | 'third_party';
  consentGivenAt; consentWithdrawnAt?;
  documents: string[]; // verification_document ids (restricted)
  verifiedAt?; verifiedBy?; expiresAt?; notes?;
  createdAt; updatedAt;
}
type EmploymentVerificationStatus =
  'not_started' | 'pending_consent' | 'submitted' | 'under_review' |
  'verified' | 'rejected' | 'expired';

// Note: full background verification is out of scope for the initial release.
// Only current-employer verification is supported. The codebase contains a
// legacy/experimental BGV module that should not be presented as a product feature.

interface VerificationDocument {
  id; ownerUserId; kind: 'employment_proof' | 'other';
  storagePath; // opaque key; never a public URL
  mimeType; size; uploadedAt; expiresAt?;
  // access is mediated by signed, short-lived URLs + authorization
}

interface ConsentRecord {
  id; userId; scope: string; // e.g. 'employment_verification:<id>', 'resume_access:<candidateId>:<requesterId>'
  grantedAt; withdrawnAt?; ipAddress?; userAgent?; metadata?: Record<string, any>;
}

interface CandidateVisibilitySettings {
  userId;
  visibility; // mirrors CandidateReferralProfile.visibility
  allowAnonymousDiscovery: boolean;
  allowResumeDownloadAfterConsent: boolean;
  updatedAt;
}

interface Notification {
  id; userId; type: string; title; body; link?;
  read: boolean; createdAt;
}

interface AuditEvent { // reuse SystemAuditLog but extend categories
  // add categories: 'referral', 'verification', 'privacy', 'moderation'
}
```

### 3.2 Uniqueness & constraints (application-enforced, since snapshot)

- `ReferralRequest`: unique on `(candidateUserId, referralJobId)`. Enforce in `createReferralRequest` and in tests.
- `EmployeeProfile`: one per `userId`.
- `CandidateReferralProfile`: one per `userId`.
- `EmploymentVerification`: multiple allowed (per employer), but at most one `isCurrent=true` per user.
- `ReferralJob.availableSlots >= filledSlots`.

### 3.3 Indexes (future per-entity migration)

When migrating hot collections to real tables, add indexes on:
- `referral_jobs(status, company, expires_at)`
- `referral_jobs(posted_by_user_id)`
- `referral_requests(candidate_user_id)`, `(referral_job_id)`, `(employee_user_id)`
- `referral_status_history(request_id, created_at)`
- `employment_verifications(user_id, status)`
- (removed: background-verification indexes; not in initial release scope)
- `verification_documents(owner_user_id)`
- `notifications(user_id, read, created_at)`
- `consent_records(user_id, scope)`

### 3.4 RLS policy sketch (future per-entity migration)

- `app_state`: server secret only (current).
- For per-entity tables: RLS enabled, policies scoped by `auth.uid()` = owner OR role-based via a `user_roles`/capabilities table. Service role bypasses for Express. Candidate private fields never selectable by employees; anonymous discovery uses a view exposing only allowed columns.
- Document storage: private bucket, signed URLs (≤ 5 min), authorization check before signing.

### 3.5 Normalization

`normalizeSnapshot` must default all new arrays/collections to `[]` and backfill `role`/`capabilities` for old users (`role` stays; `capabilities` derived: admin → can_admin; others → [] unless promoted).

---

## 4. API Design (extend Express routes)

Follow existing patterns: `authMiddleware`, user scoping, `persist()` + `void saveNow()`, `addAuditLog`. Add a small validation helper (zod not available; use manual checks or add `zod`—guideline says avoid unnecessary deps; prefer manual + shared `validate()` util in `server/validation.ts`).

### 4.1 Auth / roles

- `POST /auth/register`: accept optional `roleIntent: 'candidate' | 'employee' | 'recruiter'`. Default candidate. Creating employee intent creates `EmployeeProfile` with `affiliationStatus='unverified'` and capability `can_refer` only after verification (see below).
- `POST /auth/update-role`: admin-only (already). Extend to set capabilities.
- `POST /employee/verify-corporate-email` → send OTP to corporate email.
- `POST /employee/verify-corporate-email/confirm` → verify OTP; on success set `emailVerified=true` but **not** `affiliationStatus=verified` (still pending review or auto-verify by domain? Decision: domain match alone is insufficient; require admin/HR or document review. For MVP, email OTP + domain allowlist marks `affiliationStatus='verified'` only if company domain matches a known/verified domain; otherwise 'pending'. Document this.)
- `GET /employee/me`, `PUT /employee/me`.

### 4.2 Candidate referral profile

- `GET /referral/candidate-profile`
- `PUT /referral/candidate-profile` (visibility, opt-in, employers, preferences)
- `POST /referral/candidate-profile/submit` (submit for referral consideration)
- Reuse `/resumes/upload` for resume; on upload, optionally refresh `CandidateReferralProfile` skills from parsed resume (with user confirmation).

### 4.3 Referral jobs (employee)

- `POST /referral/jobs` (create draft)
- `PUT /referral/jobs/:id`
- `POST /referral/jobs/:id/publish` (authenticated community member; verified employees/recruiters may carry a verified badge; status draft→published→active)
- `POST /referral/jobs/:id/close`
- `GET /referral/jobs` (discovery; filters)
- `GET /referral/jobs/:id`
- `POST /referral/jobs/:id/report`
- Admin: `GET /admin/referral/jobs`, `POST /admin/referral/jobs/:id/moderate`

### 4.4 Referral requests

- `POST /referral/requests` (candidate submits) with duplicate prevention.
- `GET /referral/requests/mine` (candidate)
- `GET /referral/requests/for-employee` (employee's jobs)
- `PATCH /referral/requests/:id` (employee accept/reject/shortlist/etc.)
- `POST /referral/requests/:id/withdraw` (candidate)
- `GET /referral/requests/:id/history`
- Candidate anonymous discovery: `GET /referral/candidates/search` (employee/recruiter, filtered by visibility).

### 4.5 Employment verification

- `POST /verification/employment` (create/submit)
- `GET /verification/employment/mine`
- `POST /verification/employment/:id/consent` (grant)
- `POST /verification/employment/:id/consent/withdraw`
- `POST /verification/employment/:id/documents` (attach verification_document)
- `PATCH /verification/employment/:id` (admin/verifier update status)
- Corporate email OTP: `POST /verification/employment/:id/email-otp`, `/confirm`.

### 4.6 Background verification (out of scope for initial release)

- (Removed: background-verification endpoints; not in initial release scope)
- Provider: `sandbox_mock` only; clearly labeled. No fake third-party calls.

### 4.7 Documents

- `POST /documents` (upload, returns id; stores opaque path; no public URL)
- `GET /documents/:id/signed-url` (authorization check, short-lived signed URL)
- `DELETE /documents/:id`

### 4.8 Notifications

- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`.
- Created server-side on events (referral received, status change, matching job published, verification completed).

### 4.9 AI matching

- `POST /referral/jobs/:id/match` (employee triggers; returns candidate matches with scores + explainability)
- `GET /referral/jobs/:id/matches` (cached)
- Reuse `gemini.ts` for skill extraction from JD and scoring; matching logic in `server/matching.ts` (new, pure function, testable).

### 4.10 Analytics

- Extend `/admin/stats` with referral metrics; add `/admin/analytics/referrals`.
- Aggregate only; never expose individual candidate PII in aggregates.

---

## 5. UI Modules (extend, don't disrupt)

### 5.1 Navigation

Extend `TopNav` candidate nav conditionally based on role/capabilities. Add tabs:
- Candidate: `referral-marketplace`, `my-referrals`, `employment-verification`, `background-verification`, `notifications` (in addition to existing).
- Employee (when capability): `employee-profile`, `my-referral-jobs`, `post-referral-job`, `candidate-requests`, `candidate-search`, `shortlisted`.
- Recruiter: `recruiter-jobs`, `candidate-search`, `ai-matching`, `pipeline`.
- Admin: extend `AdminConsoleView` with new sections.

Keep existing tabs intact.

### 5.2 Candidate dashboard additions

- `ReferralMarketplaceView` – browse referral jobs, match score, apply.
- `MyReferralRequestsView` – status timeline.
- `EmploymentVerificationView`.
- `BackgroundVerificationView`.
- `NotificationsBell` (in TopNav) + `NotificationsView`.

### 5.3 Employee dashboard

- `EmployeeProfileView`, `PostReferralJobView`, `MyReferralJobsView`, `CandidateRequestsView`, `CandidateSearchView`, `ShortlistedCandidatesView`, `ReferralHistoryView`.

### 5.4 Recruiter dashboard

- `RecruiterJobsView`, `CandidateSearchView` (shared), `AiMatchingView`, `PipelineView`.

### 5.5 Admin dashboard additions

- Candidate management (existing tenants extended).
- Employee verification queue.
- Employment verification queue.
- (Background verification removed from initial release scope)
- Referral job moderation.
- Referral management.
- User reports.
- Audit logs (existing, extended categories).
- Platform analytics.

### 5.6 Shared components to create

- `StatusTimeline` (referral + verification).
- `MatchScoreCard` (overall %, matching, missing, experience/location compat).
- `VisibilitySelector`.
- `ConsentDialog` (explicit, recorded).
- `DocumentUploader` (restricted, no public URL).
- `NotificationBell`.

Reuse existing design tokens (slate/indigo/emerald, rounded-xl, border-slate-800).

---

## 6. Security & Privacy Requirements (non-negotiable)

1. **Opportunity posting is open to every authenticated community member**; corporate email verification is only required to display a verified employee/referrer badge or offer an employee referral.
2. **No auto-verification** by company name selection.
3. **Never contact current employer** without explicit documented consent; separate "current employer" from "previous employers" in verification flows.
4. **Never disclose job-seeking** to current employer.
5. **No exposure of payslips/IDs/employment docs** to referral providers; employees see only match summary + authorized fields.
6. **Minimum necessary verification status** displayed (badge, not documents).
7. **Encrypt sensitive fields** at rest (corporate emails? document contents). At minimum, documents stored as opaque paths; passwords masked; consider AES-GCM for document bytes if stored inline—prefer external storage with signed URLs. Since we use snapshot, store document metadata only + opaque `storagePath`; bytes in a private store. For dev, store base64 in a separate `verification_documents` collection marked sensitive; gate access.
8. **Signed URLs** (short TTL) for document access; authorization check before signing.
9. **Consent records** with grant/withdraw timestamps, IP, UA.
10. **Withdrawal of consent** supported and audited.
11. **No fake completion claims**: verification status only changes via authorized admin/verifier/provider action.
12. **Mock providers only**: `provider: 'sandbox_mock'`, clearly labeled in UI.
13. **Anonymous discovery**: hide name, phone, personal email, current employer, exact docs, resume download until explicit consent.
14. **RLS/data scoping**: every new query filtered by `userId` or role guard; add tests for cross-user access.
15. **Input validation** on every new endpoint (server-side).
16. **Rate limiting** on auth, upload, OTP, matching endpoints (in-memory token bucket acceptable for MVP).
17. **Audit events** for all sensitive actions (verification, consent, document access, moderation, role changes).

### 6.1 Indian DPDP / data protection considerations

- Purpose limitation: collect only necessary data.
- Consent: free, specific, informed, unambiguous; withdrawable.
- Data principal rights: access, correction, erasure (reuse `deleteUserAndData` extended to all new collections).
- Retention: define expiry for documents/OTPs; cleanup job.
- No processing beyond stated purpose; analytics aggregated/anonymized.
- Grievance/officer contact in privacy policy (update `LegalPages.tsx`).

---

## 7. AI Candidate Matching Engine

### 7.1 Flow (on referral job publish)

1. Extract required skills from `ReferralJob.description` + `skillsRequired` (reuse JD analysis).
2. Determine min/max experience, location, work mode.
3. Search eligible `CandidateReferralProfile`s (visibility allows this employee/recruiter).
4. Compute match:
   - Skill overlap (weighted).
   - Experience compatibility (candidate years vs range).
   - Location compatibility.
   - Verification badge bonus (only if authorized).
5. Generate explainable summary: overall %, matching skills, missing skills, partial, experience verdict, location verdict.
6. Persist `ReferralRequest`? No—matching is read-only discovery; candidate must submit request.
7. Notify matching candidates (in-app) if `referralOptIn` and visibility allows.

### 7.2 Explainability rules

- Never invent skills/experience. Use only parsed profile + explicit user input.
- Show source of each matched skill (resume/profile).
- Confidence score for AI-extracted fields carried through.

### 7.3 Implementation

- New `server/matching.ts`: pure functions `extractJobRequirements`, `scoreCandidate`, `explainMatch`. Unit-testable without DB.
- Route orchestrates DB + AI + notifications.

---

## 8. Anonymous Candidate Discovery

- Anonymous profile view exposes: experience range (e.g., "10-12 years"), skills, job preferences, broad industry, verification badges, AI match score.
- Hides: name, phone, personal email, current employer, exact docs, resume download.
- Identity/resume access only after explicit candidate consent (creates `ConsentRecord` scope `resume_access:<requestId>` and notifies candidate).
- Provide consent/access history UI.

---

## 9. Notifications & Analytics

### 9.1 In-app notifications

- Table/collection `notifications`.
- Triggers:
  - matching referral opportunity published → candidate
  - referral request received → employee
  - accepted/rejected/shortlisted → candidate
  - verification completed → candidate
  - referral status change → both parties
- Email notifications configurable (feature flag; default off in dev). Reuse existing email? None—implement optional SMTP/env later; for MVP, in-app only + documented.

### 9.2 Analytics

Extend admin stats:
- total registered candidates, verified employees, active referral jobs, referral requests, acceptance rate, interview conversion rate, successful referrals, most active companies.
- Aggregate only; no individual PII.

---

## 10. Testing Strategy

### 10.1 New test files (under `tests/`)

- `roles.test.ts` – role/capability guards, no self-promotion.
- `referral-profiles.test.ts` – candidate/employee profile CRUD, visibility.
- `referral-jobs.test.ts` - lifecycle, community posting, moderation/report.
- `referral-requests.test.ts` – create, duplicate prevention, status transitions, history.
- `privacy.test.ts` – anonymous discovery fields, resume access consent.
- `matching.test.ts` – pure scoring/explainability (no AI dependency; mock extracted skills).
- `employment-verification.test.ts` – consent, status flow, document access.
- (Removed: bgv.test.ts; not in initial release scope)
- `documents.test.ts` – signed URL authorization.
- `notifications.test.ts`.
- `rls-isolation.test.ts` – cross-user access denied (extend existing fresh-read tests).
- `admin-referral.test.ts`.

### 10.2 Regression

- Keep all existing tests passing.
- Add regression tests for existing job discovery/autofill after each milestone.

---

## 11. Milestones (Execution Order)

### Milestone 1 – Architecture assessment, DB design, role/permission design, candidate & employee profiles (START HERE)

**Status:** Implemented (MVP) – backend + frontend profile flows and tests.

Tasks:
1. Extend `User` type with `capabilities`, `updatedAt`; backfill in `normalizeSnapshot`.
2. Add role union values + guards in `auth.ts` (employee/recruiter/verifier/admin) and helper guards.
3. Add new entities to `server/types.ts` and `src/types.ts`.
4. Extend `DatabaseSchema` + `normalizeSnapshot` + `deleteUserAndData`.
5. Implement DB methods: profiles (candidate referral, employee, company), CRUD.
6. Implement routes: candidate/employee profile, corporate email OTP verification, role intent on register.
7. Frontend: `EmployeeProfileView`, extend `ResumeProfileView` with referral section, visibility selector.
8. Tests: roles, profiles, isolation.
9. Update `LegalPages` privacy/terms with DPDP notes.

**Exit criteria:** candidate can register, upload resume, build referral profile, set visibility; employee can register with corporate email and request verification; no existing test regressions.

### Milestone 2 – Referral marketplace, job posting, request lifecycle

Tasks:
1. `ReferralJob` CRUD + lifecycle + moderation/report.
2. `ReferralRequest` create with duplicate prevention + status history.
3. Anonymous discovery endpoint + UI.
4. Employee candidate search/shortlist.
5. Notifications on request received/accepted/rejected.
6. Tests: jobs, requests, privacy, duplicate.

### Milestone 3 - Current-employer verification, consent & privacy

Tasks:
1. `EmploymentVerification` flow + corporate email OTP + document review + HR/third-party (sandbox) provider abstraction.
2. (Removed: full background verification; current-employer verification only.)
3. `VerificationDocument` storage + signed URLs + authorization.
4. `ConsentRecord` + audit.
5. Admin verification queues.
6. Tests: consent, document access, current-employer protection. (BGV tests removed from initial scope.)

### Milestone 4 – AI candidate matching, anonymous discovery, notifications

Tasks:
1. `server/matching.ts` pure scoring + explainability.
2. Match on publish; notify matching candidates.
3. Employee match UI.
4. In-app notification system (if not done) + bell.
5. Tests: matching.

### Milestone 5 – Recruiter dashboard, admin analytics, hardening

Tasks:
1. Recruiter views + pipeline.
2. Admin analytics extension.
3. Rate limiting, validation hardening, document expiry cleanup.
4. Performance: evaluate per-entity migration for hot collections; add migration notes.
5. Comprehensive regression + security review.
6. Documentation: migrations, env config, runbook.

---

## 12. File-Level Change Plan (Milestone 1 first)

### Backend

- `server/types.ts`: extend `User`, add new interfaces.
- `server/db.ts`: `DatabaseSchema`, `normalizeSnapshot`, `deleteUserAndData`, new methods.
- `server/auth.ts`: role union, guards.
- `server/routes.ts`: new endpoints, validation.
- `server/validation.ts` (new): shared request validators.
- `server/secrets.ts`: reuse; add `DOCUMENT_SIGNING_SECRET` if needed.

### Frontend

- `src/types.ts`: mirror types.
- `src/api.ts`: new API methods.
- `src/context/AuthContext.tsx`: role-aware helpers.
- `src/components/TopNav.tsx`: conditional nav.
- New components under `src/components/`.

### Database

- `supabase/schema.sql`: document snapshot model (no change required for MVP); add optional per-entity migration SQL in `supabase/migrations/` during Milestone 5 if needed.

---

## 13. Backward Compatibility

- Existing `User.role` values remain valid; new roles are additive.
- Existing endpoints unchanged; new endpoints additive.
- Existing `CandidateProfile` untouched; new `CandidateReferralProfile` separate (avoids breaking resume flow).
- Existing tests must pass; new tests additive.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Snapshot growth/performance | Monitor size; per-entity migration in M5; pagination for lists |
| Cross-user data leak | userId scoping in every method; isolation tests |
| Sensitive doc exposure | Opaque paths + signed URLs + authorization |
| Fake verification claims | Status changes only via authorized endpoints; audit |
| Corporate email spoofing | OTP to corporate domain; domain allowlist; manual review fallback |
| Current employer contact | Explicit consent records; no auto-contact; UI warnings |
| AI hallucination in matching | Pure scoring on parsed fields; explainability; no invented skills |

---

## 15. Definition of Done (per milestone)

- Code compiles (`npm run lint`).
- Tests pass (`npm test`) including new tests.
- No regressions in existing features.
- Data scoping reviewed.
- RLS/access review documented.
- Plan "Status" updated.
- Migration/env docs updated if applicable.

---

## 16. Status Log

- **2026-11-26**: Plan created from repository assessment. Milestone 1 not started.
- **2026-11-26**: Milestone 1 implemented: extended role/capability model, candidate & employee profiles, corporate email OTP verification, affiliation approval flow, frontend profile views, and tests. Lint + tests pass.
- **2026-11-26**: Milestone 2 implemented: referral job lifecycle, referral request workflow with duplicate prevention/status history, notifications, anonymous candidate search, shortlists, and UI. Lint + tests pass.
- **2026-11-26**: Milestone 3 implemented: current-employer verification, consent grant/withdraw, corporate email OTP, verifier-only status updates, restricted document access, consent records, and UI. Lint + tests pass.
- **2026-11-26**: Milestone 4 implemented: deterministic AI/explainable matching module, match scoring on publish and request, matching candidate notifications, enhanced anonymous discovery with match summaries. Lint + tests pass.
- **2026-11-26**: Milestone 5 implemented: recruiter dashboard views, admin referral analytics, cleanup endpoint, rate limiting, validation hardening, and tests. Lint + tests pass.
- **2026-11-26**: Milestone 6 implemented: consent-based resume access, additional privacy/security tests, cross-user access verification. Lint + tests pass.
- **2026-11-26**: Milestone 7 implemented: configurable email notifications, DPDP privacy policy updates, migration documentation, env configuration. Lint + tests pass.
- **2026-11-26**: Phase 8 enhanced: notification bell with unread count, admin analytics UI, email channel wiring. Lint + tests pass.
- **2026-11-26**: Phase 9 implemented: security regression tests (cross-user access, resume isolation, admin cascade, autofill guard). Lint + tests pass.
- **2026-11-26**: Phase 10 implemented: production build verified, CI workflow added, final regression green. Lint + tests pass.
- **2026-11-26**: Phase 11 implemented: pagination, PWA manifest/service worker, responsive polish. Lint + tests + build pass.
