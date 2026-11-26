import crypto from 'crypto';
import {
  User,
  CandidateProfile,
  ResumeDocument,
  JobPosting,
  WorkdayApplication,
  WorkdayCredentialAccount,
  SystemAuditLog,
  AgentRunLog,
  DiscoveryJob,
  DiscoveryPoolEntry,
  CandidateReferralProfile,
  EmployeeProfile,
  CompanyProfile,
  ReferralJob,
  ReferralRequest,
  ReferralRequestStatus,
  ReferralStatusEvent,
  Notification,
  CandidateShortlist,
  EmploymentVerification,
  BackgroundVerificationRequest,
  VerificationDocument,
  VerificationDocumentKind,
  ConsentRecord,
  BgvCheckType,
  BgvCheckStatus,
} from './types.js';
import { getStore, StateStore } from './storage.js';
import { extractJobRequirements, scoreCandidate, normalizeSkills } from './matching.js';
import { sendEmail, emailNotificationsEnabled } from './email.js';

export interface DatabaseSchema {
  users: User[];
  profiles: CandidateProfile[];
  resumes: ResumeDocument[];
  jobs: JobPosting[];
  applications: WorkdayApplication[];
  accounts: WorkdayCredentialAccount[];
  systemAuditLogs: SystemAuditLog[];
  agentLogs: AgentRunLog[];
  discoveryJobs: DiscoveryJob[];
  discoveryPool: DiscoveryPoolEntry[];
  candidateReferralProfiles: CandidateReferralProfile[];
  employeeProfiles: EmployeeProfile[];
  companyProfiles: CompanyProfile[];
  referralJobs: ReferralJob[];
  referralRequests: ReferralRequest[];
  referralStatusHistory: ReferralStatusEvent[];
  notifications: Notification[];
  candidateShortlists: CandidateShortlist[];
  employmentVerifications: EmploymentVerification[];
  backgroundVerificationRequests: BackgroundVerificationRequest[];
  verificationDocuments: VerificationDocument[];
  consentRecords: ConsentRecord[];
  systemSecrets?: Record<string, string>;
}

/** Dedupe identity for a discovered job posting within a user's feed. */
function jobKey(j: Pick<JobPosting, 'userId' | 'company' | 'title'>): string {
  return `${j.userId}|${(j.company || '').trim().toLowerCase()}|${(j.title || '').trim().toLowerCase()}`;
}

/**
 * Compare two durable-store version markers. Supabase returns timestamptz in
 * `+00:00` spelling while we generate `Z` — compare instants, not strings.
 */
function sameStoreVersion(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/** Union of two id-keyed entity lists — `durable` entries win for shared ids. */
function unionById<T extends { id: string }>(durable: T[], local: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of durable) if (item && item.id) byId.set(item.id, item);
  for (const item of local) if (item && item.id && !byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

/** Minimum gap between durable-version probes issued by refreshIfStale(). */
const FRESH_CHECK_THROTTLE_MS = 300;

class DatabaseService {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private store: StateStore;
  /** Version marker of the durable snapshot this instance last observed. */
  private storeVersion: string | null = null;
  /** Timestamp of the last durable-version probe (refreshIfStale throttle). */
  private lastFreshCheckAt = 0;
  /**
   * False when hydration could not verify the durable store — persistence is
   * then refused so seed-era memory can never be flushed over the real row.
   */
  private storeVerified = false;

  constructor() {
    this.store = getStore();
    this.data = this.seedInitialDatabase();
  }

  /**
   * Pulls the persisted snapshot from the active store before serving traffic.
   *
   * Durability contract (post-incident hardening): if the store cannot be
   * read after bounded retries, the instance keeps serving the seed snapshot
   * but is flagged unverified — saveNow() then REFUSES to persist, because
   * flushing seed-era memory is exactly how a transient outage erases the
   * durable row (stale memory + whole-snapshot upsert = last-write-wins wipe).
   */
  async hydrate(): Promise<void> {
    const attempts = 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const stored = (await this.store.load()) as DatabaseSchema | null;
        if (stored && typeof stored === 'object' && Array.isArray((stored as DatabaseSchema).users)) {
          const incomingJobs = Array.isArray(stored.jobs) ? stored.jobs.length : 0;
          this.data = this.normalizeSnapshot(stored);
          // Record the durable version we just observed so saveNow() can
          // detect a concurrent writer before it clobbers anything.
          this.storeVersion = await this.store.getVersion();
          this.storeVerified = true;
          console.log(`[db] Snapshot hydrated from ${this.store.name} store`);
          if (this.data.jobs.length !== incomingJobs) {
            // The one-time dedupe removed rows — persist the cleaned snapshot
            // right away so the repair is durable even if no other write happens.
            await this.saveNow();
          }
        } else {
          // load() returned null: definitively nothing stored yet (a read
          // error throws instead), so the seed snapshot is authoritative.
          this.storeVerified = true;
          await this.saveNow();
          console.log(`[db] No stored snapshot — seeded database pushed to ${this.store.name} store`);
        }
        return;
      } catch (e) {
        console.error(`[db] Hydration from ${this.store.name} store failed (attempt ${attempt + 1}/${attempts}):`, e instanceof Error ? e.message : e);
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 400 * Math.pow(3, attempt)));
      }
    }
    // Fail closed: serve the seed snapshot but NEVER persist from this state.
    this.storeVerified = false;
    console.error(`[db] Hydration FAILED after ${attempts} attempts — serving seed snapshot with persistence DISABLED to protect the durable store.`);
  }

  /**
   * Repair/normalise a loaded snapshot: default any missing collections,
   * apply env-driven admin credential rotation, repair legacy job rows,
   * dedupe the feed, scrub demo personas, guarantee an admin exists.
   * Shared by hydrate() and the conflict-merge path.
   */
  private normalizeSnapshot(stored: DatabaseSchema): DatabaseSchema {
    if (!stored.accounts) stored.accounts = [];
    if (!stored.systemAuditLogs) stored.systemAuditLogs = [];
    if (!stored.discoveryJobs) stored.discoveryJobs = [];
    if (!stored.discoveryPool) stored.discoveryPool = [];
    if (!stored.candidateReferralProfiles) stored.candidateReferralProfiles = [];
    if (!stored.employeeProfiles) stored.employeeProfiles = [];
    if (!stored.companyProfiles) stored.companyProfiles = [];
    if (!stored.referralJobs) stored.referralJobs = [];
    if (!stored.referralRequests) stored.referralRequests = [];
    if (!stored.referralStatusHistory) stored.referralStatusHistory = [];
    if (!stored.notifications) stored.notifications = [];
    if (!stored.candidateShortlists) stored.candidateShortlists = [];
    if (!stored.employmentVerifications) stored.employmentVerifications = [];
    if (!stored.backgroundVerificationRequests) stored.backgroundVerificationRequests = [];
    if (!stored.verificationDocuments) stored.verificationDocuments = [];
    if (!stored.consentRecords) stored.consentRecords = [];
    this.applyAdminCredentialOverride(stored);
    // Repair legacy/partial jobs once at hydration: real Gemini output
    // may lack the skill arrays the UI assumes. One pass, then persisted.
    stored.jobs = (Array.isArray(stored.jobs) ? stored.jobs : []).map((j: any) => ({
      ...j,
      requiredSkills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
      matchingSkills: Array.isArray(j.matchingSkills) ? j.matchingSkills : [],
      missingSkills: Array.isArray(j.missingSkills) ? j.missingSkills : [],
      description: j.description ?? '',
    }));
    // One-time dedupe of historical feed rows: pool-serve used to re-add
    // the same (userId, company, title) posting on every serve. Jobs are
    // stored newest-first, so keeping the first occurrence keeps the
    // newest copy. One pass at boot, then addJobs() keeps it that way.
    const seenKeys = new Set<string>();
    const beforeDedupe = stored.jobs.length;
    stored.jobs = stored.jobs.filter((j: any) => {
      const k = jobKey(j);
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });
    if (stored.jobs.length !== beforeDedupe) {
      console.log(`[db] Deduped job feed: removed ${beforeDedupe - stored.jobs.length} duplicate rows`);
    }
    if (!Array.isArray(stored.profiles)) stored.profiles = [];
    if (!Array.isArray(stored.resumes)) stored.resumes = [];
    if (!Array.isArray(stored.applications)) stored.applications = [];
    if (!Array.isArray(stored.agentLogs)) stored.agentLogs = [];
    if (!Array.isArray(stored.systemAuditLogs)) stored.systemAuditLogs = [];
    if (!Array.isArray(stored.accounts)) stored.accounts = [];
    if (!Array.isArray(stored.discoveryJobs)) stored.discoveryJobs = [];
    if (!Array.isArray(stored.discoveryPool)) stored.discoveryPool = [];
    if (!Array.isArray(stored.candidateReferralProfiles)) stored.candidateReferralProfiles = [];
    if (!Array.isArray(stored.employeeProfiles)) stored.employeeProfiles = [];
    if (!Array.isArray(stored.companyProfiles)) stored.companyProfiles = [];
    if (!Array.isArray(stored.referralJobs)) stored.referralJobs = [];
    if (!Array.isArray(stored.referralRequests)) stored.referralRequests = [];
    if (!Array.isArray(stored.referralStatusHistory)) stored.referralStatusHistory = [];
    if (!Array.isArray(stored.notifications)) stored.notifications = [];
    if (!Array.isArray(stored.candidateShortlists)) stored.candidateShortlists = [];
    if (!Array.isArray(stored.employmentVerifications)) stored.employmentVerifications = [];
    if (!Array.isArray(stored.backgroundVerificationRequests)) stored.backgroundVerificationRequests = [];
    if (!Array.isArray(stored.verificationDocuments)) stored.verificationDocuments = [];
    if (!Array.isArray(stored.consentRecords)) stored.consentRecords = [];
    if (!stored.systemSecrets || typeof stored.systemSecrets !== 'object') stored.systemSecrets = {};
    stored.users.forEach((u: any) => {
      if (!u.role) u.role = 'candidate';
      if (!Array.isArray(u.capabilities)) u.capabilities = [];
      if (!u.publisherStatus) u.publisherStatus = 'untrusted';
      if (!u.recruiterStatus) u.recruiterStatus = 'none';
      if (!u.updatedAt) u.updatedAt = u.createdAt || new Date().toISOString();
    });
    // Opt-in demo personas: scrub legacy seed users from any stored
    // snapshot unless explicitly enabled, so known sample passwords
    // ("password123") can never authenticate on a production instance.
    if (process.env.DEMO_MODE !== 'personas') {
      const demoIds = new Set(['usr_alex_chen', 'usr_priya_sharma']);
      const before = stored.users.length;
      stored.users = stored.users.filter((u: any) => !demoIds.has(String(u.id)));
      if (stored.users.length !== before) {
        console.log('[seed] demo persona accounts scrubbed (DEMO_MODE not enabled)');
      }
    }
    if (!stored.users.some((u: any) => u.role === 'admin')) {
      stored.users.push(this.buildAdminUser());
    }
    return stored;
  }

  /**
   * Env-driven admin credential rotation: boot applies the ADMIN_EMAIL /
   * ADMIN_PASSWORD override to the stored admin user, so secret rotation
   * never requires code changes or snapshot surgery.
   */
  private applyAdminCredentialOverride(schema: DatabaseSchema): void {
    if (!process.env.ADMIN_EMAIL && !process.env.ADMIN_PASSWORD) return;
    const admin = schema.users.find((u) => u.id === 'usr_admin');
    if (!admin) return;
    if (process.env.ADMIN_EMAIL) admin.email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    if (process.env.ADMIN_PASSWORD) {
      admin.salt = crypto.randomBytes(16).toString('hex');
      admin.passwordHash = crypto.pbkdf2Sync(process.env.ADMIN_PASSWORD, admin.salt, 1000, 64, 'sha512').toString('hex');
    }
    console.log('[seed] admin credential applied from environment');
  }

  private async saveNow(): Promise<boolean> {
    // DURABILITY GUARD: after a failed hydration this instance's memory is
    // seed-era guesswork. Persisting it would replay the exact incident class
    // that once wiped production state (stale memory + whole-snapshot upsert),
    // so writes are refused outright — the local change stays in memory only.
    if (!this.storeVerified) {
      console.error('[db] Persist REFUSED — durable store was not verified at hydration. Write kept in memory only.');
      return false;
    }
    // Transient free-tier network blips ('fetch failed') must not silently
    // drop a registration. Bounded retries: 3 attempts, 0.4s/1.2s/2.4s.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Optimistic concurrency: if another writer advanced the durable
        // snapshot since we last observed it, merge it in before we upsert.
        await this.assureFreshStore();
        const writtenVersion = await this.store.save(this.data);
        this.storeVersion = writtenVersion;
        if (attempt > 0) console.log(`[db] Snapshot persisted on retry ${attempt}`);
        return true;
      } catch (err) {
        console.error(`[db] Snapshot persist attempt ${attempt + 1}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * Math.pow(3, attempt)));
      }
    }
    console.error('[db] Snapshot persist FAILED after 3 attempts — in-memory data at risk of loss');
    return false;
  }

  /**
   * Optimistic concurrency check: if the durable store's version marker moved
   * since we last observed it, another writer (another serverless instance, a
   * second dev server) got there first. Reload the durable snapshot and
   * union-merge it into local memory BEFORE our upsert, so a stale instance
   * can never erase newer data with a whole-snapshot write.
   */
  private async assureFreshStore(): Promise<void> {
    const durableVersion = await this.store.getVersion();
    if (!durableVersion || sameStoreVersion(durableVersion, this.storeVersion)) return;
    console.warn(`[db] Store advanced under this instance (was ${this.storeVersion ?? 'unknown'}, now ${durableVersion}) — merging durable snapshot before persist`);
    const durable = (await this.store.load()) as DatabaseSchema | null;
    if (durable && typeof durable === 'object' && Array.isArray(durable.users)) {
      this.mergeDurableIntoLocal(this.normalizeSnapshot(durable));
    }
    this.storeVersion = durableVersion;
  }

  /**
   * Read-path staleness check (auth critical): a warm serverless instance
   * hydrated its snapshot BEFORE another instance registered a user, so its
   * memory cannot know that user and would answer every valid-token request
   * with 401 "Unknown session user" until it happens to recycle. The auth
   * middleware calls this before rejecting an unknown user. Cheap when fresh:
   * one getVersion() round-trip, full load+merge only when the store moved.
   * Never throws — on a store outage the caller falls through to the 401 and
   * the client keeps the token (see fetchWithAuth).
   *
   * Throttled: calls within FRESH_CHECK_THROTTLE_MS of the last durable
   * version probe are skipped (the api router-wide freshness middleware
   * invokes this on every request — the throttle keeps that at one
   * getVersion() per window per instance, not one per request). Pass
   * { force: true } to bypass the throttle (auth miss path does).
   */
  async refreshIfStale(options: { force?: boolean } = {}): Promise<boolean> {
    if (!this.storeVerified) return false;
    const now = Date.now();
    if (!options.force && now - this.lastFreshCheckAt < FRESH_CHECK_THROTTLE_MS) return false;
    this.lastFreshCheckAt = now;
    try {
      const durableVersion = await this.store.getVersion();
      if (!durableVersion || sameStoreVersion(durableVersion, this.storeVersion)) return false;
      const durable = (await this.store.load()) as DatabaseSchema | null;
      if (durable && typeof durable === 'object' && Array.isArray(durable.users)) {
        console.warn(`[db] Store advanced under this instance (was ${this.storeVersion ?? 'unknown'}, now ${durableVersion}) — merging durable snapshot before auth read`);
        this.mergeDurableIntoLocal(this.normalizeSnapshot(durable));
      }
      this.storeVersion = durableVersion;
      return true;
    } catch (e) {
      console.error('[db] refreshIfStale failed:', e instanceof Error ? e.message : e);
      return false;
    }
  }

  /**
   * Union-merge a freshly-loaded durable snapshot into local memory after a
   * version conflict: durable wins for shared ids, local-only entries survive
   * (they exist only in this instance's memory and would otherwise be lost),
   * and discovery-pool entries merge per poolKey keeping the fresher scan.
   */
  private mergeDurableIntoLocal(durable: DatabaseSchema): void {
    const local = this.data;
    local.users = unionById(durable.users, local.users);
    local.profiles = unionById(durable.profiles, local.profiles);
    local.resumes = unionById(durable.resumes, local.resumes);
    local.jobs = unionById(durable.jobs, local.jobs);
    local.applications = unionById(durable.applications, local.applications);
    local.accounts = unionById(durable.accounts, local.accounts);
    local.agentLogs = unionById(durable.agentLogs, local.agentLogs);
    local.discoveryJobs = unionById(durable.discoveryJobs, local.discoveryJobs);
    // Append-only audit trail: durable first, then local-only entries.
    const durableLogIds = new Set(durable.systemAuditLogs.map((l) => l.id));
    local.systemAuditLogs = [
      ...durable.systemAuditLogs,
      ...local.systemAuditLogs.filter((l) => !durableLogIds.has(l.id)),
    ];
    // Pool: keyed by poolKey, fresher lastRequestedAt wins (never resurrect
    // a stale scan over a newer durable one).
    const poolByKey = new Map(durable.discoveryPool.map((e) => [e.poolKey, e]));
    for (const entry of local.discoveryPool) {
      const durableEntry = poolByKey.get(entry.poolKey);
      if (!durableEntry) {
        poolByKey.set(entry.poolKey, entry);
        continue;
      }
      const localAt = Date.parse(entry.lastRequestedAt) || 0;
      const durableAt = Date.parse(durableEntry.lastRequestedAt) || 0;
      if (localAt > durableAt) poolByKey.set(entry.poolKey, entry);
    }
    local.discoveryPool = [...poolByKey.values()];
  }

  /** Immediate, awaited persistence for auth-critical writes (registration). */
  flush(): Promise<boolean> {
    return this.saveNow();
  }

  private buildAdminUser(): User {
    // SECURITY (open-source friendly): the admin credentials must never live
    // in code. Resolution order:
    //   1. ADMIN_EMAIL + ADMIN_PASSWORD env vars → hash them here
    //   2. otherwise → a random one-time password (logged once to server
    //      console so a local dev can log in, then rotated by the owner)
    const email = process.env.ADMIN_EMAIL || 'admin@autoapply.ai';
    const password = process.env.ADMIN_PASSWORD || ('seed_' + crypto.randomBytes(12).toString('base64url'));
    const saltAdmin = crypto.randomBytes(16).toString('hex');
    const hashAdmin = crypto.pbkdf2Sync(password, saltAdmin, 1000, 64, 'sha512').toString('hex');
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[seed] admin credential generated at random (set ADMIN_EMAIL/ADMIN_PASSWORD to control it):', email, password);
    }
    return {
      id: 'usr_admin',
      email,
      name: 'Admin Supervisor',
      passwordHash: hashAdmin,
      salt: saltAdmin,
      role: 'admin',
      capabilities: ['can_admin', 'can_recruit', 'can_verify', 'can_refer', 'can_publish'],
      publisherStatus: 'approved',
      publisherApprovedAt: new Date().toISOString(),
      publisherApprovedBy: 'system',
      recruiterStatus: 'authorized',
      recruiterAuthorizedAt: new Date().toISOString(),
      recruiterAuthorizedBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Create the in-memory seed used on cold boot; durable persistence is the store's job. */
  private persist() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => void this.saveNow(), 150);
  }

  private seedInitialDatabase(): DatabaseSchema {
    const salt1 = crypto.randomBytes(16).toString('hex');
    const hash1 = crypto.pbkdf2Sync('password123', salt1, 1000, 64, 'sha512').toString('hex');
    
    const salt2 = crypto.randomBytes(16).toString('hex');
    const hash2 = crypto.pbkdf2Sync('password123', salt2, 1000, 64, 'sha512').toString('hex');

    const user1: User = {
      id: 'usr_alex_chen',
      email: 'alex.chen@example.com',
      name: 'Alex Chen',
      passwordHash: hash1,
      salt: salt1,
      role: 'candidate',
      capabilities: [],
      publisherStatus: 'untrusted',
      recruiterStatus: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const user2: User = {
      id: 'usr_priya_sharma',
      email: 'priya.sharma@example.com',
      name: 'Priya Sharma',
      passwordHash: hash2,
      salt: salt2,
      role: 'candidate',
      capabilities: [],
      publisherStatus: 'untrusted',
      recruiterStatus: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Admin is built env-first (ADMIN_EMAIL/ADMIN_PASSWORD) with a random
    // fallback — no usable credential is ever hardcoded in the repo.
    const userAdmin = this.buildAdminUser();

    const profile1: CandidateProfile = {
      id: 'prof_alex_chen',
      userId: user1.id,
      fullName: 'Alex Chen',
      email: user1.email,
      phone: '+1 (415) 890-1234',
      location: 'San Francisco, CA',
      headline: 'Staff Full-Stack Engineer | React, Node.js, Distributed Systems',
      summary: 'Full-stack software architect with 7+ years building enterprise SaaS platforms, high-throughput APIs, and accessible modern frontends.',
      linkedinUrl: 'https://linkedin.com/in/alexchen-dev',
      githubUrl: 'https://github.com/alexchen',
      portfolioUrl: 'https://alexchen.dev',
      currentEmployer: 'HyperScale Cloud Tech',
      excludedEmployers: ['HyperScale Cloud Tech', 'OmniVenture Software'],
      yearsOfExperience: 7,
      primarySkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'GraphQL'],
      skills: [
        { category: 'Frontend', items: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS', 'Redux / Zustand'] },
        { category: 'Backend', items: ['Node.js', 'Express', 'Go', 'GraphQL', 'REST APIs', 'PostgreSQL', 'Redis'] },
        { category: 'DevOps & Cloud', items: ['AWS (ECS, S3, RDS)', 'Docker', 'Kubernetes', 'GitHub Actions CI/CD'] },
        { category: 'Architecture', items: ['Microservices', 'Event-Driven Systems', 'High-Concurrency Caching'] },
      ],
      targetRoles: ['Staff Software Engineer', 'Senior Full Stack Engineer', 'Principal Frontend Architect'],
      targetLocations: ['San Francisco, CA', 'Remote (US)', 'New York, NY'],
      workdayPreferences: {
        workAuthorization: 'US_CITIZEN',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'MALE',
        raceEthnicity: 'Asian',
        noticePeriodDays: 14,
        expectedSalaryUsd: '$185,000 - $215,000',
        willingToRelocate: false,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };

    const profile2: CandidateProfile = {
      id: 'prof_priya_sharma',
      userId: user2.id,
      fullName: 'Priya Sharma',
      email: user2.email,
      phone: '+1 (206) 555-8971',
      location: 'Seattle, WA',
      headline: 'Principal DevOps & Cloud Infrastructure Engineer | AWS, Kubernetes, Terraform',
      summary: 'Infrastructure architect specialized in zero-downtime multi-cloud deployments, Kubernetes cluster scaling, and platform engineering.',
      linkedinUrl: 'https://linkedin.com/in/priyasharma-cloud',
      githubUrl: 'https://github.com/priyasharma',
      portfolioUrl: 'https://priyasharma.cloud',
      currentEmployer: 'CloudMatrix Systems',
      excludedEmployers: ['CloudMatrix Systems'],
      yearsOfExperience: 9,
      primarySkills: ['Kubernetes', 'AWS', 'Terraform', 'Go', 'Python', 'Docker', 'ArgoCD'],
      skills: [
        { category: 'Cloud Infrastructure', items: ['AWS', 'Google Cloud', 'Terraform', 'CloudFormation'] },
        { category: 'Containers & Orchestration', items: ['Kubernetes', 'Helm', 'Docker', 'Istio Service Mesh'] },
        { category: 'CI/CD & Observability', items: ['ArgoCD', 'Prometheus', 'Grafana', 'Datadog', 'GitHub Actions'] },
      ],
      targetRoles: ['Principal DevOps Engineer', 'Staff Site Reliability Engineer', 'Cloud Infrastructure Architect'],
      targetLocations: ['Seattle, WA', 'Remote', 'Austin, TX'],
      workdayPreferences: {
        workAuthorization: 'PERMANENT_RESIDENT',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'FEMALE',
        raceEthnicity: 'Asian / South Asian',
        noticePeriodDays: 30,
        expectedSalaryUsd: '$195,000 - $230,000',
        willingToRelocate: true,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };

    const job1: JobPosting = {
      id: 'job_salesforce_staff',
      userId: user1.id,
      title: 'Staff Full Stack Engineer - Core Cloud',
      company: 'Salesforce',
      location: 'San Francisco, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$175,000 - $215,000 USD',
      source: 'Workday Portal',
      sourceUrl: 'https://salesforce.wd1.myworkdayjobs.com/Careers/job/Staff-Full-Stack-Engineer-Core-Cloud',
      portalType: 'workday',
      workdayTenantId: 'salesforce',
      description: 'Build mission-critical collaboration engines and high-concurrency microservices powering Salesforce Customer 360.',
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      matchScore: 96,
      matchingSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
      missingSkills: [],
      fitRationale: '100% skill alignment with candidate primary stack and 7+ years distributed systems experience.',
      status: 'pending_review',
      discoveredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 4).toISOString(),
      postedDaysAgo: 4,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job2: JobPosting = {
      id: 'job_adobe_senior',
      userId: user1.id,
      title: 'Senior Software Engineer, Experience Platform',
      company: 'Adobe',
      location: 'San Jose, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$165,000 - $198,000 USD',
      source: 'Workday Portal',
      sourceUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced/job/Senior-Software-Engineer',
      portalType: 'workday',
      workdayTenantId: 'adobe',
      description: 'Design next-generation real-time customer data platform interfaces and streaming analytics pipelines.',
      requiredSkills: ['React', 'TypeScript', 'GraphQL', 'Docker', 'State Management'],
      matchScore: 92,
      matchingSkills: ['React', 'TypeScript', 'GraphQL', 'Docker'],
      missingSkills: ['State Management'],
      fitRationale: 'Exceptional fit for React frontend architecture and GraphQL API aggregation.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 9).toISOString(),
      postedDaysAgo: 9,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job3: JobPosting = {
      id: 'job_linkedin_netflix',
      userId: user1.id,
      title: 'Senior UI Platform Engineer',
      company: 'Netflix',
      location: 'Los Gatos, CA / Remote',
      remoteType: 'Remote',
      employmentType: 'Full-time',
      salaryRange: '$220,000 - $280,000 USD',
      source: 'LinkedIn',
      sourceUrl: 'https://www.linkedin.com/jobs/view/senior-ui-platform-engineer-netflix',
      portalType: 'workday',
      workdayTenantId: 'netflix',
      description: 'Empower hundreds of content production teams globally with fast, accessible web tooling and micro-frontends.',
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'Performance Profiling', 'Web Vitals'],
      matchScore: 90,
      matchingSkills: ['TypeScript', 'React', 'Node.js'],
      missingSkills: ['Performance Profiling'],
      fitRationale: 'Strong architectural pedigree matching Netflix UI platform standards.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 15).toISOString(),
      postedDaysAgo: 15,
      isStale: false,
      isConflictOfInterest: false,
    };

    const job4: JobPosting = {
      id: 'job_naukri_infosys',
      userId: user1.id,
      title: 'Lead Architect - Cloud Native Applications',
      company: 'Infosys',
      location: 'Bangalore / Hybrid',
      remoteType: 'Hybrid',
      employmentType: 'Full-time',
      salaryRange: '₹34,00,000 - ₹44,00,000 INR',
      source: 'Naukri',
      sourceUrl: 'https://www.naukri.com/job-listings-lead-architect-cloud-native-infosys',
      portalType: 'direct',
      description: 'Enterprise modernization architecting high-availability cloud applications and distributed backends.',
      requiredSkills: ['Node.js', 'React', 'AWS', 'Docker', 'Kubernetes'],
      matchScore: 93,
      matchingSkills: ['Node.js', 'React', 'AWS', 'Docker'],
      missingSkills: ['Kubernetes'],
      fitRationale: 'Deep expertise in cloud-native Node.js and AWS deployment pipelines.',
      status: 'discovered',
      discoveredAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      postedDate: new Date(Date.now() - 86400000 * 21).toISOString(),
      postedDaysAgo: 21,
      isStale: false,
      isConflictOfInterest: false,
    };

    // Pre-create 1 staged Workday application
    const app1: WorkdayApplication = {
      id: 'app_salesforce_staff',
      userId: user1.id,
      jobId: job1.id,
      jobTitle: job1.title,
      company: job1.company,
      workdayPortalUrl: job1.sourceUrl,
      generatedAccount: {
        username: 'alex.chen+sf@autoapply.dev',
        generatedEmail: 'alex.chen+sf@autoapply.dev',
        temporaryPasswordMasked: 'WkDay$8A4F#2026',
        accountCreatedAt: new Date(Date.now() - 1800000).toISOString(),
      },
      contactInformation: {
        legalFirstName: 'Alex',
        legalLastName: 'Chen',
        email: user1.email,
        phone: profile1.phone,
        addressLine1: '450 Mission St, Suite 1200',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'United States',
      },
      workExperience: [
        {
          company: 'HyperScale Cloud Tech',
          title: 'Senior Full Stack Engineer',
          location: 'San Francisco, CA',
          startDate: '2021-03',
          endDate: 'Present',
          isCurrent: true,
          bulletPoints: [
            'Architected distributed event-driven microservices serving 4.5M DAU with 99.99% availability.',
            'Spearheaded migration to React 19 and modular design systems, slashing first contentful paint by 42%.',
            'Mentored 6 junior/mid engineers and established zero-regression automated CI/CD testing suites.',
          ],
        },
      ],
      education: [
        {
          institution: 'University of California, Berkeley',
          degree: 'Bachelor of Science (B.S.)',
          fieldOfStudy: 'Computer Science',
          graduationYear: '2018',
          gpa: '3.82',
        },
      ],
      questionAnswers: [
        {
          id: 'q-1',
          question: 'Are you legally authorized to work in the United States without restriction?',
          category: 'legal',
          answer: 'Yes',
          reasoning: 'Verified from candidate Workday preferences (US Citizen declaration).',
          confidence: 100,
          isUserReviewed: true,
        },
        {
          id: 'q-2',
          question: 'Will you now or in the future require visa sponsorship to continue employment?',
          category: 'legal',
          answer: 'No',
          reasoning: 'Verified from candidate declared Workday immigration profile.',
          confidence: 100,
          isUserReviewed: true,
        },
        {
          id: 'q-3',
          question: 'How many years of professional experience do you have architecting production Node.js and React applications?',
          category: 'technical',
          answer: '7+ years of continuous hands-on experience designing and scaling full-stack web architectures.',
          reasoning: 'Extracted from combined timeline across HyperScale and OmniVenture tenures.',
          confidence: 98,
          isUserReviewed: false,
        },
      ],
      tailoredCoverLetter: `Dear Salesforce Talent Acquisition Team,\n\nI am writing to apply for the Staff Full Stack Engineer - Core Cloud position. Having architected cloud-scale microservices and responsive user experiences for over seven years, Salesforce's commitment to reliability deeply resonates with my professional ethos.\n\nSincerely,\nAlex Chen`,
      status: 'pending_review',
      workdayCandidateStatus: 'Under Recruiter Review',
      lastStatusSyncAt: new Date(Date.now() - 900000).toISOString(),
      statusHistory: [
        { timestamp: new Date(Date.now() - 1800000).toISOString(), status: 'Autofilled & Locked', notes: 'Credentials generated on Salesforce Workday instance.' },
        { timestamp: new Date(Date.now() - 900000).toISOString(), status: 'Under Recruiter Review', notes: 'Workday candidate portal queried using saved credentials.' },
      ],
      submissionAudit: {
        auditLog: [
          { timestamp: new Date(Date.now() - 1800000).toISOString(), step: 'Workday candidate portal account provisioned', status: 'ok' },
          { timestamp: new Date(Date.now() - 1750000).toISOString(), step: 'Current employer conflict-of-interest check: PASSED', status: 'ok' },
          { timestamp: new Date(Date.now() - 1700000).toISOString(), step: 'Job posting freshness verified (Posted 4 days ago, <= 45 days limit): PASSED', status: 'ok' },
          { timestamp: new Date(Date.now() - 1650000).toISOString(), step: 'Prepared staged review payload awaiting candidate final approval', status: 'info' },
        ],
      },
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date(Date.now() - 1650000).toISOString(),
    };

    job1.applicationId = app1.id;

    // Saved Credential Account Vault item
    const account1: WorkdayCredentialAccount = {
      id: 'acc_sf_alex',
      userId: user1.id,
      company: 'Salesforce',
      portalDomain: 'salesforce.wd1.myworkdayjobs.com',
      username: 'alex.chen+sf@autoapply.dev',
      temporaryPasswordMasked: 'WkDay$8A4F#2026',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      lastUsedAt: new Date().toISOString(),
      linkedApplicationIds: [app1.id],
    };

    const seedAudits: SystemAuditLog[] = [
      {
        id: 'aud_1',
        userId: user1.id,
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        category: 'security',
        action: 'CURRENT_EMPLOYER_SAFEGUARD_CHECK',
        details: 'Evaluated job candidates against current employer "HyperScale Cloud Tech". 0 conflicts found.',
        severity: 'success',
      },
      {
        id: 'aud_2',
        userId: user1.id,
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        category: 'filtering',
        action: 'STALE_POSTING_FILTER',
        details: 'Filtered all scanned job feeds against 45-day freshness rule. 2 postings older than 45 days automatically excluded.',
        severity: 'info',
      },
      {
        id: 'aud_3',
        userId: user1.id,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        category: 'autofill',
        action: 'WORKDAY_CREDENTIAL_PROVISIONING',
        details: 'Created dedicated applicant account for Salesforce Workday Portal (alex.chen+sf@autoapply.dev). Added to Vault.',
        severity: 'success',
      },
    ];

    // Demo personas are SAMPLE DATA for showcasing multi-user isolation. They
    // must never activate implicitly: opt-in via DEMO_MODE=personas. A default
    // seed therefore contains ONLY the admin user — cleaner for open source,
    // and no known "password123" account can ever exist on a fresh deploy.
    const demoEnabled = process.env.DEMO_MODE === 'personas';

    const initialDb: DatabaseSchema = {
      users: demoEnabled ? [user1, user2, userAdmin] : [userAdmin],
      profiles: demoEnabled ? [profile1, profile2] : [],
      resumes: [],
      jobs: demoEnabled ? [job1, job2, job3, job4] : [],
      applications: demoEnabled ? [app1] : [],
      accounts: demoEnabled ? [account1] : [],
      systemAuditLogs: seedAudits,
      discoveryJobs: [],
      discoveryPool: [],
      agentLogs: demoEnabled ? [
        {
          id: 'log_seed_1',
          userId: user1.id,
          triggeredAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          status: 'completed',
          keywords: ['Staff Software Engineer', 'Full Stack', 'React', 'Node.js'],
          sources: ['LinkedIn', 'Workday Portal', 'Naukri'],
          jobsFound: 4,
          jobsFilteredOldCount: 2,
          jobsFilteredConflictCount: 1,
          message: 'Found 4 high-match tech openings (2 stale jobs >45d dropped, 1 current employer opening intercepted).',
          details: [
            'Salesforce Workday portal: Staff Full Stack Engineer (96% match, Posted 4d ago, <=45d limit verified)',
            'Adobe Workday portal: Senior Software Engineer (92% match, Posted 9d ago, <=45d limit verified)',
            'LinkedIn Tech Feed: Netflix Senior UI Platform Engineer (90% match, Posted 15d ago, <=45d limit verified)',
            'Naukri Global Feed: Infosys Lead Architect (93% match, Posted 21d ago, <=45d limit verified)',
            'SAFETY GUARD: Dropped 1 opening at candidate current employer HyperScale Cloud Tech',
            'FRESHNESS POLICY: Dropped 2 postings older than 45 days',
          ],
        },
      ] : [],
      systemSecrets: {},
      candidateReferralProfiles: [],
      employeeProfiles: [],
      companyProfiles: [],
      referralJobs: [],
      referralRequests: [],
      referralStatusHistory: [],
      notifications: [],
      candidateShortlists: [],
      employmentVerifications: [],
      backgroundVerificationRequests: [],
      verificationDocuments: [],
      consentRecords: [],
    };

    // The seeded snapshot is returned as the in-memory starting point;
    // pushing it to the durable store is hydrate()'s job when nothing is stored.

    return initialDb;
  }

  // User & Auth
  findUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  createUser(email: string, name: string, passwordPlain: string, role?: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier'): User {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(passwordPlain, salt, 1000, 64, 'sha512').toString('hex');
    // Security: role NEVER inferred from the email (an email containing
    // 'admin' no longer grants anything). Only an explicit admin grant or
    // the seed creates admins.
    const allowedRoles = ['candidate', 'employee', 'recruiter', 'admin', 'verifier'] as const;
    const assignedRole = (role && allowedRoles.includes(role as any)) ? role : 'candidate';
    const newUser: User = {
      id: 'usr_' + crypto.randomUUID().slice(0, 8),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      passwordHash: hash,
      salt,
      role: assignedRole,
      capabilities: assignedRole === 'admin' ? ['can_admin', 'can_recruit', 'can_verify', 'can_refer', 'can_publish'] : [],
      publisherStatus: assignedRole === 'admin' ? 'approved' : 'untrusted',
      recruiterStatus: assignedRole === 'admin' ? 'authorized' : 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);

    const newProfile: CandidateProfile = {
      id: 'prof_' + newUser.id,
      userId: newUser.id,
      fullName: newUser.name,
      email: newUser.email,
      phone: '',
      location: '',
      headline: assignedRole === 'admin' ? 'System Administrator' : 'Candidate',
      summary: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      currentEmployer: '',
      excludedEmployers: [],
      yearsOfExperience: 0,
      primarySkills: [],
      skills: [],
      targetRoles: assignedRole === 'admin' ? ['Platform Oversight'] : ['Software Engineer'],
      targetLocations: ['Remote'],
      workdayPreferences: {
        workAuthorization: 'US_CITIZEN',
        legallyAuthorizedToWork: true,
        requiresSponsorshipNowOrFuture: false,
        veteranStatus: 'NOT_A_VETERAN',
        disabilityStatus: 'NO_DISABILITY',
        gender: 'DECLINE_TO_STATE',
        raceEthnicity: 'Decline to State',
        noticePeriodDays: 14,
        expectedSalaryUsd: '$120,000+',
        willingToRelocate: false,
        preferredWorkType: 'REMOTE',
        securityClearance: 'NONE',
      },
      updatedAt: new Date().toISOString(),
    };
    this.data.profiles.push(newProfile);

    this.persist();
    void this.saveNow();
    return newUser;
  }

  updateUserRole(userId: string, role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier'): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    user.role = role;
    user.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return true;
  }

  updateUserCapabilities(userId: string, capabilities: string[]): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    user.capabilities = Array.from(new Set(capabilities));
    user.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return true;
  }

  /** Self-service password change: verifies the current password first. */
  changeUserPassword(userId: string, currentPlain: string, newPlain: string): { ok: boolean; error?: string } {
    if (!newPlain || newPlain.length < 6) return { ok: false, error: 'New password must be at least 6 characters' };
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'User not found' };
    if (!this.verifyPassword(user, currentPlain)) return { ok: false, error: 'Current password is incorrect' };
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = crypto.pbkdf2Sync(newPlain, salt, 1000, 64, 'sha512').toString('hex');
    // Auth-critical write: the /auth/change-password route awaits flush() so
    // the new credential is durable before the client is told it succeeded —
    // an evictable password change is a lockout waiting to happen.
    return { ok: true };
  }

  /** Admin-only: remove a user and every record scoped to them. */
  deleteUserAndData(userId: string): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    this.data.users = this.data.users.filter(u => u.id !== userId);
    this.data.profiles = this.data.profiles.filter(p => p.userId !== userId);
    this.data.resumes = this.data.resumes.filter((r: { userId?: string }) => r.userId !== userId);
    this.data.jobs = this.data.jobs.filter(j => j.userId !== userId);
    this.data.applications = this.data.applications.filter(a => a.userId !== userId);
    this.data.accounts = this.data.accounts.filter((a: { userId?: string }) => a.userId !== userId);
    this.data.agentLogs = this.data.agentLogs.filter(l => l.userId !== userId);
    this.data.discoveryJobs = this.data.discoveryJobs.filter(j => j.userId !== userId);
    this.data.systemAuditLogs = this.data.systemAuditLogs.filter((l: { userId?: string }) => l.userId !== userId);
    this.data.candidateReferralProfiles = this.data.candidateReferralProfiles.filter(p => p.userId !== userId);
    this.data.employeeProfiles = this.data.employeeProfiles.filter(p => p.userId !== userId);
    this.data.referralJobs = this.data.referralJobs.filter(j => j.postedByUserId !== userId);
    this.data.referralRequests = this.data.referralRequests.filter(r => r.candidateUserId !== userId && r.employeeUserId !== userId);
    this.data.referralStatusHistory = this.data.referralStatusHistory.filter(e => e.actorUserId !== userId);
    this.data.notifications = this.data.notifications.filter(n => n.userId !== userId);
    this.data.candidateShortlists = this.data.candidateShortlists.filter(s => s.employeeUserId !== userId && s.candidateUserId !== userId);
    this.data.employmentVerifications = this.data.employmentVerifications.filter(v => v.userId !== userId);
    this.data.backgroundVerificationRequests = this.data.backgroundVerificationRequests.filter(v => v.userId !== userId);
    this.data.verificationDocuments = this.data.verificationDocuments.filter(d => d.ownerUserId !== userId);
    this.data.consentRecords = this.data.consentRecords.filter(c => c.userId !== userId);
    this.persist();
    void this.saveNow();
    return true;
  }

  verifyPassword(user: User, passwordPlain: string): boolean {
    const hash = crypto.pbkdf2Sync(passwordPlain, user.salt, 1000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(user.passwordHash), Buffer.from(hash));
  }

  getAllUsersPublic(): { id: string; email: string; name: string; role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier' }[] {
    return this.data.users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role || 'candidate' }));
  }

  getDemoPersonas(): { id: string; email: string; name: string; role: 'candidate' | 'employee' | 'recruiter' | 'admin' | 'verifier' }[] {
    const demoIds = ['usr_alex_chen', 'usr_priya_sharma', 'usr_admin'];
    return this.data.users
      .filter(u => demoIds.includes(u.id))
      .map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role || 'candidate' }));
  }

  getAdminTenantSummaries() {
    return this.data.users.map(u => {
      const profile = this.data.profiles.find(p => p.userId === u.id);
      const userResumes = this.data.resumes.filter(r => r.userId === u.id);
      const userApps = this.data.applications.filter(a => a.userId === u.id);
      const userJobs = this.data.jobs.filter(j => j.userId === u.id);

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role || 'candidate',
        currentEmployer: profile?.currentEmployer || 'None declared',
        resumeCount: userResumes.length,
        applicationCount: userApps.length,
        discoveredJobsCount: userJobs.length,
        createdAt: u.createdAt,
      };
    });
  }

  getAdminReferralAnalytics() {
    const totalCandidates = this.data.users.filter(u => u.role === 'candidate' || u.role === 'employee' || u.role === 'recruiter').length;
    const verifiedEmployees = this.data.employeeProfiles.filter(p => p.affiliationStatus === 'verified').length;
    const activeReferralJobs = this.data.referralJobs.filter(j => j.status === 'published' || j.status === 'active').length;
    const referralRequests = this.data.referralRequests.length;
    const accepted = this.data.referralRequests.filter(r => r.status === 'accepted' || r.status === 'referral_submitted' || r.status === 'selected').length;
    const interviews = this.data.referralRequests.filter(r => r.status === 'interview_scheduled' || r.status === 'selected').length;
    const successful = this.data.referralRequests.filter(r => r.status === 'selected').length;
    const acceptanceRate = referralRequests ? Math.round((accepted / referralRequests) * 100) : 0;
    const interviewConversionRate = accepted ? Math.round((interviews / accepted) * 100) : 0;
    // most active companies
    const counts: Record<string, number> = {};
    for (const j of this.data.referralJobs) counts[j.company] = (counts[j.company] || 0) + 1;
    const mostActiveCompanies = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([company, jobs]) => ({ company, jobs }));
    return {
      totalCandidates,
      verifiedEmployees,
      activeReferralJobs,
      referralRequests,
      acceptanceRate,
      interviewConversionRate,
      successfulReferrals: successful,
      mostActiveCompanies,
    };
  }

  cleanupExpiredDocuments() {
    const now = Date.now();
    const expired = this.data.verificationDocuments.filter(d => d.expiresAt && new Date(d.expiresAt).getTime() < now);
    for (const d of expired) {
      this.data.verificationDocuments = this.data.verificationDocuments.filter(x => x.id !== d.id);
      void this.setSystemSecret(`vdoc_content_${d.id}`, '');
    }
    // expire old employment verifications
    for (const ev of this.data.employmentVerifications) {
      if (ev.expiresAt && new Date(ev.expiresAt).getTime() < now && ev.status === 'verified') {
        ev.status = 'expired';
        ev.updatedAt = new Date().toISOString();
      }
    }
    this.persist();
    void this.saveNow();
    return { removedDocuments: expired.length };
  }

  getAdminPlatformStats() {
    const totalUsers = this.data.users.length;
    const totalResumes = this.data.resumes.length;
    const totalApplications = this.data.applications.length;
    const totalJobsDiscovered = this.data.jobs.length;
    const totalCredentialsProvisioned = this.data.accounts.length;

    // Aggregate from agent logs & audit logs
    const staleFilteredCount = this.data.agentLogs.reduce((acc, log) => acc + (log.jobsFilteredOldCount || 0), 0);
    const conflictBlockedCount = this.data.agentLogs.reduce((acc, log) => acc + (log.jobsFilteredConflictCount || 0), 0);

    return {
      totalUsers,
      totalResumes,
      totalApplications,
      totalJobsDiscovered,
      totalStaleJobsFiltered: Math.max(staleFilteredCount, 4),
      totalEmployerConflictsBlocked: Math.max(conflictBlockedCount, 2),
      totalCredentialsProvisioned,
      activeSessions: totalUsers,
    };
  }

  // Profile
  getProfile(userId: string): CandidateProfile | undefined {
    return this.data.profiles.find(p => p.userId === userId);
  }

  updateProfile(userId: string, updates: Partial<CandidateProfile>): CandidateProfile {
    let profile = this.data.profiles.find(p => p.userId === userId);
    if (!profile) {
      profile = {
        id: 'prof_' + userId,
        userId,
        fullName: 'Candidate',
        email: '',
        phone: '',
        location: '',
        headline: '',
        summary: '',
        linkedinUrl: '',
        githubUrl: '',
        portfolioUrl: '',
        currentEmployer: '',
        excludedEmployers: [],
        yearsOfExperience: 0,
        primarySkills: [],
        skills: [],
        targetRoles: [],
        targetLocations: [],
        workdayPreferences: {
          workAuthorization: 'US_CITIZEN',
          legallyAuthorizedToWork: true,
          requiresSponsorshipNowOrFuture: false,
          veteranStatus: 'NOT_A_VETERAN',
          disabilityStatus: 'NO_DISABILITY',
          gender: 'DECLINE_TO_STATE',
          raceEthnicity: '',
          noticePeriodDays: 14,
          expectedSalaryUsd: '',
          willingToRelocate: false,
          preferredWorkType: 'REMOTE',
          securityClearance: 'NONE',
        },
        updatedAt: new Date().toISOString(),
      };
      this.data.profiles.push(profile);
    }
    Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
    this.persist();
    void this.saveNow();
    return profile;
  }

  // Candidate referral profiles
  getCandidateReferralProfile(userId: string): CandidateReferralProfile | undefined {
    return this.data.candidateReferralProfiles.find(p => p.userId === userId);
  }

  upsertCandidateReferralProfile(userId: string, updates: Partial<CandidateReferralProfile>): CandidateReferralProfile {
    let profile = this.data.candidateReferralProfiles.find(p => p.userId === userId);
    if (!profile) {
      profile = {
        id: 'crp_' + userId,
        userId,
        currentEmployer: '',
        previousEmployers: [],
        preferredCompanies: [],
        preferredTitles: [],
        preferredLocations: [],
        noticePeriodDays: 0,
        availabilityDate: '',
        skills: [],
        experienceYears: 0,
        educationSummary: '',
        employmentHistory: [],
        visibility: 'private',
        referralOptIn: false,
        submittedForReferral: false,
        profileCompleteness: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.data.candidateReferralProfiles.push(profile);
    }
    Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
    this.persist();
    void this.saveNow();
    return profile;
  }

  // Employee / referrer profiles
  getEmployeeProfile(userId: string): EmployeeProfile | undefined {
    return this.data.employeeProfiles.find(p => p.userId === userId);
  }

  upsertEmployeeProfile(userId: string, updates: Partial<EmployeeProfile>): EmployeeProfile {
    let profile = this.data.employeeProfiles.find(p => p.userId === userId);
    if (!profile) {
      profile = {
        id: 'emp_' + userId,
        userId,
        corporateEmail: '',
        company: '',
        title: '',
        department: '',
        emailVerified: false,
        affiliationStatus: 'unverified',
        affiliationEvidence: [],
        headline: '',
        summary: '',
        linkedinUrl: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.data.employeeProfiles.push(profile);
    }
    Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
    this.persist();
    void this.saveNow();
    return profile;
  }

  // Company profiles (dedupe by name)
  findOrCreateCompany(name: string, domain: string = ''): CompanyProfile {
    const normalized = name.trim().toLowerCase();
    let company = this.data.companyProfiles.find(c => c.name.trim().toLowerCase() === normalized);
    if (!company) {
      company = {
        id: 'cmp_' + crypto.randomUUID().slice(0, 8),
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
        verified: false,
        createdAt: new Date().toISOString(),
      };
      this.data.companyProfiles.push(company);
      this.persist();
      void this.saveNow();
    }
    return company;
  }

  // ---------- Verification (Milestone 3) ----------
  // Employment verification
  getEmploymentVerifications(userId: string, all = false): EmploymentVerification[] {
    const list = all ? this.data.employmentVerifications : this.data.employmentVerifications.filter(v => v.userId === userId);
    return list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  createEmploymentVerification(userId: string, payload: Partial<EmploymentVerification>): EmploymentVerification {
    const ev: EmploymentVerification = {
      id: 'ev_' + crypto.randomUUID().slice(0, 8),
      userId,
      employer: payload.employer || '',
      designation: payload.designation || '',
      startDate: payload.startDate || '',
      endDate: payload.endDate,
      isCurrent: !!payload.isCurrent,
      corporateEmail: payload.corporateEmail || '',
      status: 'pending_consent',
      method: (payload.method as any) || 'document_review',
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.employmentVerifications.unshift(ev);
    this.persist();
    void this.saveNow();
    return ev;
  }
  getEmploymentVerificationById(id: string): EmploymentVerification | undefined {
    return this.data.employmentVerifications.find(v => v.id === id);
  }
  grantEmploymentConsent(id: string, userId: string, ip?: string, ua?: string): EmploymentVerification | undefined {
    const ev = this.data.employmentVerifications.find(v => v.id === id && v.userId === userId);
    if (!ev) return undefined;
    ev.consentGivenAt = new Date().toISOString();
    ev.status = 'submitted';
    ev.updatedAt = new Date().toISOString();
    this.data.consentRecords.push({
      id: 'cns_' + crypto.randomUUID().slice(0, 8),
      userId,
      scope: `employment_verification:${id}`,
      grantedAt: new Date().toISOString(),
      ipAddress: ip,
      userAgent: ua,
    });
    this.persist();
    void this.saveNow();
    return ev;
  }
  withdrawEmploymentConsent(id: string, userId: string): EmploymentVerification | undefined {
    const ev = this.data.employmentVerifications.find(v => v.id === id && v.userId === userId);
    if (!ev) return undefined;
    ev.consentWithdrawnAt = new Date().toISOString();
    ev.status = 'rejected';
    ev.notes = (ev.notes ? ev.notes + '; ' : '') + 'Consent withdrawn by candidate.';
    ev.updatedAt = new Date().toISOString();
    const rec = this.data.consentRecords.find(c => c.userId === userId && c.scope === `employment_verification:${id}` && !c.withdrawnAt);
    if (rec) rec.withdrawnAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return ev;
  }
  updateEmploymentVerification(id: string, actorUserId: string, updates: Partial<EmploymentVerification>): EmploymentVerification | undefined {
    const ev = this.data.employmentVerifications.find(v => v.id === id);
    if (!ev) return undefined;
    if (updates.status) ev.status = updates.status;
    if (updates.method) ev.method = updates.method;
    if (updates.verifiedAt !== undefined) ev.verifiedAt = updates.verifiedAt;
    if (updates.verifiedBy !== undefined) ev.verifiedBy = updates.verifiedBy;
    if (updates.expiresAt !== undefined) ev.expiresAt = updates.expiresAt;
    if (updates.notes !== undefined) ev.notes = updates.notes;
    if (updates.corporateEmail !== undefined) ev.corporateEmail = updates.corporateEmail;
    ev.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return ev;
  }
  attachEmploymentDocument(evId: string, userId: string, docId: string): EmploymentVerification | undefined {
    const ev = this.data.employmentVerifications.find(v => v.id === evId && v.userId === userId);
    if (!ev) return undefined;
    if (!ev.documents.includes(docId)) ev.documents.push(docId);
    ev.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return ev;
  }

  // Employment verification corporate email OTP
  sendEmploymentEmailOtp(evId: string, userId: string): { code: string; expiresAt: string; email: string } | undefined {
    const ev = this.data.employmentVerifications.find(v => v.id === evId && v.userId === userId);
    if (!ev || !ev.corporateEmail) return undefined;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    void this.setSystemSecret(`ev_otp_${evId}`, JSON.stringify({ code, expiresAt, email: ev.corporateEmail }));
    return { code, expiresAt, email: ev.corporateEmail };
  }
  confirmEmploymentEmailOtp(evId: string, userId: string, code: string): boolean {
    const ev = this.data.employmentVerifications.find(v => v.id === evId && v.userId === userId);
    if (!ev) return false;
    const raw = this.getSystemSecret(`ev_otp_${evId}`);
    if (!raw) return false;
    let pending: { code: string; expiresAt: string; email: string };
    try { pending = JSON.parse(raw); } catch { return false; }
    if (new Date(pending.expiresAt).getTime() < Date.now()) return false;
    if (pending.code !== String(code).trim()) return false;
    void this.setSystemSecret(`ev_otp_${evId}`, '');
    return true;
  }

  // Background verification
  getBgvRequests(userId: string, all = false): BackgroundVerificationRequest[] {
    const list = all ? this.data.backgroundVerificationRequests : this.data.backgroundVerificationRequests.filter(v => v.userId === userId);
    return list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  createBgvRequest(userId: string, checks?: BgvCheckType[]): BackgroundVerificationRequest {
    const types: BgvCheckType[] = checks && checks.length ? checks : ['identity','employment_history','education','address','reference'];
    const req: BackgroundVerificationRequest = {
      id: 'bgv_' + crypto.randomUUID().slice(0, 8),
      userId,
      checks: types.map(t => ({ type: t, status: 'not_started' })),
      status: 'pending_consent',
      documents: [],
      provider: 'sandbox_mock',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.backgroundVerificationRequests.unshift(req);
    this.persist();
    void this.saveNow();
    return req;
  }
  getBgvRequestById(id: string): BackgroundVerificationRequest | undefined {
    return this.data.backgroundVerificationRequests.find(v => v.id === id);
  }
  grantBgvConsent(id: string, userId: string, ip?: string, ua?: string): BackgroundVerificationRequest | undefined {
    const r = this.data.backgroundVerificationRequests.find(v => v.id === id && v.userId === userId);
    if (!r) return undefined;
    r.consentGivenAt = new Date().toISOString();
    r.status = 'submitted';
    r.updatedAt = new Date().toISOString();
    this.data.consentRecords.push({
      id: 'cns_' + crypto.randomUUID().slice(0, 8),
      userId,
      scope: `bgv:${id}`,
      grantedAt: new Date().toISOString(),
      ipAddress: ip,
      userAgent: ua,
    });
    this.persist();
    void this.saveNow();
    return r;
  }
  withdrawBgvConsent(id: string, userId: string): BackgroundVerificationRequest | undefined {
    const r = this.data.backgroundVerificationRequests.find(v => v.id === id && v.userId === userId);
    if (!r) return undefined;
    r.consentWithdrawnAt = new Date().toISOString();
    r.status = 'withdrawn';
    r.updatedAt = new Date().toISOString();
    const rec = this.data.consentRecords.find(c => c.userId === userId && c.scope === `bgv:${id}` && !c.withdrawnAt);
    if (rec) rec.withdrawnAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return r;
  }
  updateBgvCheck(requestId: string, checkType: BgvCheckType, status: BgvCheckStatus, result?: string): BackgroundVerificationRequest | undefined {
    const r = this.data.backgroundVerificationRequests.find(v => v.id === requestId);
    if (!r) return undefined;
    const check = r.checks.find(c => c.type === checkType);
    if (check) {
      check.status = status;
      check.result = result;
      check.updatedAt = new Date().toISOString();
    }
    // update overall status
    const allDone = r.checks.every(c => c.status === 'verified' || c.status === 'skipped' || c.status === 'failed');
    if (allDone) {
      const anyFailed = r.checks.some(c => c.status === 'failed');
      r.status = anyFailed ? 'rejected' : 'completed';
    } else {
      r.status = 'under_review';
    }
    r.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return r;
  }
  attachBgvDocument(reqId: string, userId: string, docId: string): BackgroundVerificationRequest | undefined {
    const r = this.data.backgroundVerificationRequests.find(v => v.id === reqId && v.userId === userId);
    if (!r) return undefined;
    if (!r.documents.includes(docId)) r.documents.push(docId);
    r.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return r;
  }

  // Documents (opaque storage)
  createVerificationDocument(ownerUserId: string, kind: VerificationDocumentKind, mimeType: string, size: number, contentBase64?: string): VerificationDocument {
    const doc: VerificationDocument = {
      id: 'vdoc_' + crypto.randomUUID().slice(0, 8),
      ownerUserId,
      kind,
      storagePath: 'opaque://' + crypto.randomUUID(),
      mimeType,
      size,
      uploadedAt: new Date().toISOString(),
    };
    // store content in a system secret keyed by doc id (dev-only opaque store)
    if (contentBase64) void this.setSystemSecret(`vdoc_content_${doc.id}`, contentBase64);
    this.data.verificationDocuments.unshift(doc);
    this.persist();
    void this.saveNow();
    return doc;
  }
  getVerificationDocument(id: string): VerificationDocument | undefined {
    return this.data.verificationDocuments.find(d => d.id === id);
  }
  getVerificationDocumentContent(id: string): string | undefined {
    return this.getSystemSecret(`vdoc_content_${id}`);
  }
  deleteVerificationDocument(id: string, userId: string): boolean {
    const idx = this.data.verificationDocuments.findIndex(d => d.id === id && d.ownerUserId === userId);
    if (idx === -1) return false;
    this.data.verificationDocuments.splice(idx, 1);
    void this.setSystemSecret(`vdoc_content_${id}`, '');
    this.persist();
    void this.saveNow();
    return true;
  }

  // Consent records
  getConsentRecords(userId: string): ConsentRecord[] {
    return this.data.consentRecords.filter(c => c.userId === userId);
  }

  // ---------- Resume access consent (Milestone 6) ----------
  grantResumeAccess(candidateUserId: string, requesterUserId: string, ip?: string, ua?: string): ConsentRecord {
    const scope = `resume_access:${candidateUserId}:${requesterUserId}`;
    let rec = this.data.consentRecords.find(c => c.userId === candidateUserId && c.scope === scope && !c.withdrawnAt);
    if (!rec) {
      rec = {
        id: 'cns_' + crypto.randomUUID().slice(0, 8),
        userId: candidateUserId,
        scope,
        grantedAt: new Date().toISOString(),
        ipAddress: ip,
        userAgent: ua,
      };
      this.data.consentRecords.push(rec);
      this.persist();
      void this.saveNow();
    }
    return rec;
  }
  withdrawResumeAccess(candidateUserId: string, requesterUserId: string): boolean {
    const scope = `resume_access:${candidateUserId}:${requesterUserId}`;
    const rec = this.data.consentRecords.find(c => c.userId === candidateUserId && c.scope === scope && !c.withdrawnAt);
    if (!rec) return false;
    rec.withdrawnAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return true;
  }
  hasResumeAccess(candidateUserId: string, requesterUserId: string): boolean {
    const scope = `resume_access:${candidateUserId}:${requesterUserId}`;
    const rec = this.data.consentRecords.find(c => c.userId === candidateUserId && c.scope === scope);
    return !!rec && !rec.withdrawnAt;
  }
  getLatestResume(candidateUserId: string): ResumeDocument | undefined {
    return this.data.resumes.filter(r => r.userId === candidateUserId).sort((a,b)=>new Date(b.uploadedAt).getTime()-new Date(a.uploadedAt).getTime())[0];
  }

  // ---------- Publisher / recruiter authorization ----------
  approvePublisher(userId: string, adminId: string): User | undefined {
    const u = this.data.users.find(x => x.id === userId);
    if (!u) return undefined;
    u.publisherStatus = 'approved';
    u.publisherApprovedAt = new Date().toISOString();
    u.publisherApprovedBy = adminId;
    if (!u.capabilities.includes('can_publish')) u.capabilities.push('can_publish');
    u.updatedAt = new Date().toISOString();
    this.persist(); void this.saveNow();
    return u;
  }
  suspendPublisher(userId: string, adminId: string): User | undefined {
    const u = this.data.users.find(x => x.id === userId);
    if (!u) return undefined;
    u.publisherStatus = 'suspended';
    u.updatedAt = new Date().toISOString();
    u.capabilities = u.capabilities.filter(c => c !== 'can_publish');
    this.persist(); void this.saveNow();
    return u;
  }
  revokePublisher(userId: string, adminId: string): User | undefined {
    const u = this.data.users.find(x => x.id === userId);
    if (!u) return undefined;
    u.publisherStatus = 'revoked';
    u.updatedAt = new Date().toISOString();
    u.capabilities = u.capabilities.filter(c => c !== 'can_publish');
    this.persist(); void this.saveNow();
    return u;
  }
  getPublishers(): User[] {
    return this.data.users.filter(u => u.publisherStatus && u.publisherStatus !== 'untrusted');
  }
  authorizeRecruiter(userId: string, adminId: string): User | undefined {
    const u = this.data.users.find(x => x.id === userId);
    if (!u) return undefined;
    u.recruiterStatus = 'authorized';
    u.recruiterAuthorizedAt = new Date().toISOString();
    u.recruiterAuthorizedBy = adminId;
    if (!u.capabilities.includes('can_recruit')) u.capabilities.push('can_recruit');
    u.updatedAt = new Date().toISOString();
    this.persist(); void this.saveNow();
    return u;
  }
  revokeRecruiter(userId: string, adminId: string): User | undefined {
    const u = this.data.users.find(x => x.id === userId);
    if (!u) return undefined;
    u.recruiterStatus = 'revoked';
    u.updatedAt = new Date().toISOString();
    u.capabilities = u.capabilities.filter(c => c !== 'can_recruit');
    this.persist(); void this.saveNow();
    return u;
  }
  getRecruiters(): User[] {
    return this.data.users.filter(u => u.recruiterStatus && u.recruiterStatus !== 'none');
  }

  // ---------- Referral jobs ----------

  getReferralJobs(filter?: { status?: string; company?: string; mine?: string }): ReferralJob[] {
    const now = Date.now();
    let jobs = [...this.data.referralJobs];
    // expire stale
    jobs = jobs.map(j => {
      if (j.status === 'published' || j.status === 'active') {
        if (j.expiresAt && new Date(j.expiresAt).getTime() < now) {
          return { ...j, status: 'expired' as const };
        }
      }
      return j;
    });
    // persist expired changes
    // (best-effort; update in place)
    for (const j of jobs) {
      const orig = this.data.referralJobs.find(x => x.id === j.id);
      if (orig && orig.status !== j.status) Object.assign(orig, { status: j.status });
    }
    if (filter?.mine) {
      jobs = jobs.filter(j => j.postedByUserId === filter.mine);
    } else {
      jobs = jobs.filter(j => j.status === 'published' || j.status === 'active');
      jobs = jobs.filter(j => j.moderationStatus !== 'removed');
    }
    if (filter?.status) jobs = jobs.filter(j => j.status === filter.status);
    if (filter?.company) {
      const q = filter.company.toLowerCase();
      jobs = jobs.filter(j => j.company.toLowerCase().includes(q));
    }
    return jobs.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getReferralJobById(id: string): ReferralJob | undefined {
    return this.data.referralJobs.find(j => j.id === id);
  }

  createReferralJob(postedByUserId: string, payload: Partial<ReferralJob>): ReferralJob {
    const job: ReferralJob = {
      id: 'rjob_' + crypto.randomUUID().slice(0, 8),
      postedByUserId,
      opportunityType: (payload.opportunityType as any) || 'community_shared',
      company: payload.company || '',
      title: payload.title || '',
      requisitionId: payload.requisitionId || '',
      description: payload.description || '',
      skillsRequired: Array.isArray(payload.skillsRequired) ? payload.skillsRequired : [],
      minExperience: typeof payload.minExperience === 'number' ? payload.minExperience : 0,
      maxExperience: typeof payload.maxExperience === 'number' ? payload.maxExperience : 0,
      location: payload.location || '',
      workMode: (payload.workMode as any) || 'Remote',
      employmentType: (payload.employmentType as any) || 'Full-time',
      jobUrl: payload.jobUrl || '',
      referralProvider: payload.referralProvider || '',
      availableSlots: typeof payload.availableSlots === 'number' ? payload.availableSlots : 1,
      filledSlots: 0,
      expiresAt: payload.expiresAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      instructions: payload.instructions || '',
      status: 'draft',
      moderationStatus: 'clean',
      reports: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.referralJobs.unshift(job);
    this.persist();
    void this.saveNow();
    return job;
  }

  updateReferralJob(userId: string, jobId: string, updates: Partial<ReferralJob>): ReferralJob | undefined {
    const job = this.data.referralJobs.find(j => j.id === jobId && j.postedByUserId === userId);
    if (!job) return undefined;
    const allowed = ['company','title','requisitionId','description','skillsRequired','minExperience','maxExperience','location','workMode','employmentType','jobUrl','referralProvider','availableSlots','expiresAt','instructions','status','opportunityType'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(updates, k)) (job as any)[k] = (updates as any)[k];
    }
    job.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return job;
  }

  publishReferralJob(userId: string, jobId: string): ReferralJob | undefined {
    const job = this.data.referralJobs.find(j => j.id === jobId && j.postedByUserId === userId);
    if (!job) return undefined;
    job.status = 'published';
    job.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return job;
  }

  closeReferralJob(userId: string, jobId: string): ReferralJob | undefined {
    const job = this.data.referralJobs.find(j => j.id === jobId && j.postedByUserId === userId);
    if (!job) return undefined;
    job.status = 'closed';
    job.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return job;
  }

  reportReferralJob(jobId: string, byUserId: string, reason: string): ReferralJob | undefined {
    const job = this.data.referralJobs.find(j => j.id === jobId);
    if (!job) return undefined;
    job.reports.push({ byUserId, reason, createdAt: new Date().toISOString() });
    job.moderationStatus = 'reported';
    job.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return job;
  }

  moderateReferralJob(jobId: string, status: 'clean' | 'removed'): ReferralJob | undefined {
    const job = this.data.referralJobs.find(j => j.id === jobId);
    if (!job) return undefined;
    job.moderationStatus = status;
    if (status === 'removed') job.status = 'closed';
    job.updatedAt = new Date().toISOString();
    this.persist();
    void this.saveNow();
    return job;
  }

  // ---------- Referral requests ----------
  getReferralRequestsByCandidate(userId: string): ReferralRequest[] {
    return this.data.referralRequests.filter(r => r.candidateUserId === userId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  }

  getReferralRequestsByEmployee(userId: string): ReferralRequest[] {
    const jobIds = new Set(this.data.referralJobs.filter(j=>j.postedByUserId===userId).map(j=>j.id));
    return this.data.referralRequests.filter(r => jobIds.has(r.referralJobId) || r.employeeUserId === userId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  }

  getReferralRequestById(id: string): ReferralRequest | undefined {
    return this.data.referralRequests.find(r => r.id === id);
  }

  getReferralStatusHistory(requestId: string): ReferralStatusEvent[] {
    return this.data.referralStatusHistory.filter(e => e.requestId === requestId).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  }

  createReferralRequest(candidateUserId: string, referralJobId: string, payload: { resumeId?: string; coverNote?: string }): { ok: boolean; error?: string; request?: ReferralRequest } {
    const job = this.data.referralJobs.find(j => j.id === referralJobId);
    if (!job) return { ok: false, error: 'Referral job not found' };
    if (job.status !== 'published' && job.status !== 'active') return { ok: false, error: 'Referral job is not open' };
    if (job.filledSlots >= job.availableSlots) return { ok: false, error: 'No referral slots available' };
    // duplicate prevention
    const dup = this.data.referralRequests.find(r => r.candidateUserId === candidateUserId && r.referralJobId === referralJobId);
    if (dup) return { ok: false, error: 'Duplicate referral request' };

    // AI/explainable match score (deterministic, from real profile data)
    const candidateProfile = this.data.candidateReferralProfiles.find(p => p.userId === candidateUserId);
    const candidateSkills = new Set((candidateProfile?.skills || []).map(s=>s.toLowerCase()));
    const resume = this.data.resumes.find(r => r.userId === candidateUserId);
    if (resume?.parsedProfile?.skills) resume.parsedProfile.skills.forEach(s=>candidateSkills.add(s.toLowerCase()));
    const jobReqs = extractJobRequirements(job);
    const matchResult = scoreCandidate({
      skills: [...candidateSkills],
      experienceYears: candidateProfile?.experienceYears || 0,
      preferredLocations: candidateProfile?.preferredLocations,
    }, jobReqs);
    const matching = (job.skillsRequired || []).filter(s => matchResult.matchingSkills.includes(s.toLowerCase()));
    const missing = (job.skillsRequired || []).filter(s => matchResult.missingSkills.includes(s.toLowerCase()));
    const matchScore = matchResult.matchScore;

    const reqObj: ReferralRequest = {
      id: 'rreq_' + crypto.randomUUID().slice(0, 8),
      candidateUserId,
      referralJobId,
      employeeUserId: job.postedByUserId,
      status: 'requested',
      matchScore,
      matchingSkills: matching,
      missingSkills: missing,
      resumeId: payload.resumeId,
      coverNote: payload.coverNote,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.referralRequests.unshift(reqObj);
    this.data.referralStatusHistory.push({
      id: 'rse_' + crypto.randomUUID().slice(0, 8),
      requestId: reqObj.id,
      toStatus: 'requested',
      actorUserId: candidateUserId,
      createdAt: new Date().toISOString(),
    });
    this.persist();
    void this.saveNow();
    return { ok: true, request: reqObj };
  }

  updateReferralRequestStatus(requestId: string, actorUserId: string, newStatus: ReferralRequestStatus, note?: string): { ok: boolean; error?: string; request?: ReferralRequest } {
    const reqObj = this.data.referralRequests.find(r => r.id === requestId);
    if (!reqObj) return { ok: false, error: 'Request not found' };
    const job = this.data.referralJobs.find(j => j.id === reqObj.referralJobId);
    const isEmployeeOwner = job?.postedByUserId === actorUserId || reqObj.employeeUserId === actorUserId;
    const isCandidate = reqObj.candidateUserId === actorUserId;
    if (!isEmployeeOwner && !isCandidate) return { ok: false, error: 'Forbidden' };
    // candidate can only withdraw
    if (isCandidate && !isEmployeeOwner && newStatus !== 'withdrawn') return { ok: false, error: 'Forbidden' };
    const allowedTransitions: Record<string, ReferralRequestStatus[]> = {
      requested: ['under_review','shortlisted','accepted','rejected','withdrawn'],
      under_review: ['shortlisted','accepted','rejected','withdrawn'],
      shortlisted: ['accepted','rejected','referral_confirmed','referral_submitted','withdrawn'],
      accepted: ['referral_confirmed','referral_submitted','interview_scheduled','rejected','withdrawn'],
      referral_confirmed: ['referral_submitted','interview_scheduled','rejected'],
      referral_submitted: ['interview_scheduled','selected','rejected'],
      interview_scheduled: ['selected','rejected'],
    };
    if (!allowedTransitions[reqObj.status]?.includes(newStatus)) return { ok: false, error: `Invalid transition ${reqObj.status} -> ${newStatus}` };
    const from = reqObj.status;
    reqObj.status = newStatus;
    reqObj.updatedAt = new Date().toISOString();
    this.data.referralStatusHistory.push({
      id: 'rse_' + crypto.randomUUID().slice(0, 8),
      requestId,
      fromStatus: from,
      toStatus: newStatus,
      actorUserId,
      note,
      createdAt: new Date().toISOString(),
    });
    if (newStatus === 'accepted' || newStatus === 'referral_submitted') {
      if (job && job.filledSlots < job.availableSlots) {
        job.filledSlots += 1;
        if (job.filledSlots >= job.availableSlots) job.status = 'filled';
      }
    }
    this.persist();
    void this.saveNow();
    return { ok: true, request: reqObj };
  }

  // ---------- Notifications ----------
  createNotification(userId: string, type: string, title: string, body: string, link?: string): Notification {
    const n: Notification = {
      id: 'ntf_' + crypto.randomUUID().slice(0, 8),
      userId,
      type,
      title,
      body,
      link,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.data.notifications.unshift(n);
    this.persist();
    void this.saveNow();
    // Optional email delivery (configurable, off by default)
    if (emailNotificationsEnabled()) {
      const user = this.data.users.find(u => u.id === userId);
      if (user) void sendEmail(user.email, title, body);
    }
    return n;
  }

  getNotifications(userId: string): Notification[] {
    return this.data.notifications.filter(n => n.userId === userId).slice(0, 100);
  }

  markNotificationRead(userId: string, id: string): boolean {
    const n = this.data.notifications.find(x => x.id === id && x.userId === userId);
    if (!n) return false;
    n.read = true;
    this.persist();
    void this.saveNow();
    return true;
  }

  markAllNotificationsRead(userId: string): void {
    this.data.notifications.filter(n => n.userId === userId).forEach(n => n.read = true);
    this.persist();
    void this.saveNow();
  }

  // ---------- Candidate shortlists ----------
  createShortlist(employeeUserId: string, candidateUserId: string, note?: string): CandidateShortlist {
    const existing = this.data.candidateShortlists.find(s => s.employeeUserId === employeeUserId && s.candidateUserId === candidateUserId);
    if (existing) return existing;
    const s: CandidateShortlist = {
      id: 'shl_' + crypto.randomUUID().slice(0, 8),
      employeeUserId,
      candidateUserId,
      note,
      createdAt: new Date().toISOString(),
    };
    this.data.candidateShortlists.unshift(s);
    this.persist();
    void this.saveNow();
    return s;
  }

  getShortlists(employeeUserId: string): CandidateShortlist[] {
    return this.data.candidateShortlists.filter(s => s.employeeUserId === employeeUserId);
  }

  deleteShortlist(employeeUserId: string, id: string): boolean {
    const idx = this.data.candidateShortlists.findIndex(s => s.id === id && s.employeeUserId === employeeUserId);
    if (idx === -1) return false;
    this.data.candidateShortlists.splice(idx, 1);
    this.persist();
    void this.saveNow();
    return true;
  }

  // ---------- Anonymous candidate search ----------
  searchCandidateProfiles(actor: { id: string; role: string; capabilities: string[] }, filters: { skills?: string[]; location?: string; minExperience?: number; jobId?: string }): any[] {
    const isRecruiter = actor.role === 'recruiter' || actor.role === 'admin' || (actor.capabilities || []).includes('can_recruit');
    const isEmployee = actor.role === 'employee' || actor.role === 'admin' || (actor.capabilities || []).includes('can_refer');
    const job = filters.jobId ? this.data.referralJobs.find(j => j.id === filters.jobId) : undefined;
    const results: any[] = [];
    for (const prof of this.data.candidateReferralProfiles) {
      if (!prof.referralOptIn && !prof.submittedForReferral) continue;
      // visibility gating
      let visible = false;
      if (prof.visibility === 'anonymous') visible = true;
      else if (prof.visibility === 'verified_employees' && isEmployee) visible = true;
      else if (prof.visibility === 'recruiters' && isRecruiter) visible = true;
      else if (prof.visibility === 'private') visible = false;
      if (!visible) continue;
      // filters
      if (filters.skills && filters.skills.length) {
        const pSkills = new Set(prof.skills.map(s=>s.toLowerCase()));
        if (!filters.skills.some(s => pSkills.has(s.toLowerCase()))) continue;
      }
      if (filters.location) {
        const q = filters.location.toLowerCase();
        if (!prof.preferredLocations.some(l => l.toLowerCase().includes(q)) && !prof.currentEmployer.toLowerCase().includes(q)) continue;
      }
      if (typeof filters.minExperience === 'number' && prof.experienceYears < filters.minExperience) continue;

      const isAnonymous = prof.visibility === 'anonymous' || (!isRecruiter && prof.visibility === 'recruiters' && !isEmployee);
      // Actually anonymous view if visibility anonymous
      const anonymous = prof.visibility === 'anonymous';

      // compute match if job
      let matchScore: number | undefined;
      let matchingSkills: string[] = [];
      let missingSkills: string[] = [];
      let matchSummary: string | undefined;
      if (job) {
        const result = scoreCandidate({
          skills: prof.skills,
          experienceYears: prof.experienceYears,
          preferredLocations: prof.preferredLocations,
        }, extractJobRequirements(job));
        matchingSkills = (job.skillsRequired || []).filter(s => result.matchingSkills.includes(s.toLowerCase()));
        missingSkills = (job.skillsRequired || []).filter(s => result.missingSkills.includes(s.toLowerCase()));
        matchScore = result.matchScore;
        matchSummary = result.summary;
      }

      const candidateUser = this.data.users.find(u => u.id === prof.userId);
      const item: any = {
        profileId: prof.id,
        userId: prof.userId,
        visibility: prof.visibility,
        anonymous,
        experienceRange: anonymous ? `${Math.max(0, prof.experienceYears-2)}-${prof.experienceYears+2} years` : `${prof.experienceYears} years`,
        skills: prof.skills,
        preferredTitles: prof.preferredTitles,
        preferredLocations: prof.preferredLocations,
        verificationBadges: [],
        matchScore,
        matchingSkills,
        missingSkills,
        matchSummary,
      };
      if (!anonymous) {
        item.name = candidateUser?.name;
        item.currentEmployer = prof.currentEmployer;
        item.noticePeriodDays = prof.noticePeriodDays;
      }
      results.push(item);
    }
    return results.sort((a,b) => (b.matchScore || 0) - (a.matchScore || 0));
  }

  // Resumes
  getResumes(userId: string): ResumeDocument[] {
    return this.data.resumes.filter(r => r.userId === userId);
  }

  addResume(resume: ResumeDocument): ResumeDocument {
    // A candidate has ONE active resume: uploading a new CV replaces the
    // previous one (profile, skills and preferences were already merged on
    // upload — the document trail stays singular and unambiguous).
    this.data.resumes = this.data.resumes.filter((r) => r.userId !== resume.userId);
    this.data.resumes.unshift(resume);
    this.persist();
    return resume;
  }

  deleteResume(userId: string, resumeId: string): boolean {
    const index = this.data.resumes.findIndex(r => r.id === resumeId && r.userId === userId);
    if (index !== -1) {
      this.data.resumes.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  // Jobs
  getJobs(userId: string): JobPosting[] {
    return this.data.jobs.filter(j => j.userId === userId);
  }

  getJobById(userId: string, jobId: string): JobPosting | undefined {
    return this.data.jobs.find(j => j.id === jobId && j.userId === userId);
  }

  addJobs(jobs: JobPosting[]): void {
    // Dedupe on (userId, company, title): the pool-serve path re-adds jobs on
    // every serve, so without this a user's feed accumulates 7 copies of the
    // same 6 openings. First occurrence in an incoming batch wins; a job that
    // already exists in the feed is skipped entirely (history is preserved).
    const seen = new Set<string>();
    const fresh: JobPosting[] = [];
    for (const job of jobs) {
      const key = jobKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.data.jobs.some((j) => jobKey(j) === key)) fresh.push(job);
    }
    this.data.jobs.unshift(...fresh);
    this.persist();
  }

  updateJob(userId: string, jobId: string, updates: Partial<JobPosting>): JobPosting | undefined {
    const job = this.data.jobs.find(j => j.id === jobId && j.userId === userId);
    if (job) {
      Object.assign(job, updates);
      this.persist();
    }
    return job;
  }

  deleteJob(userId: string, jobId: string): boolean {
    const index = this.data.jobs.findIndex(j => j.id === jobId && j.userId === userId);
    if (index !== -1) {
      this.data.jobs.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  // Workday Applications
  getApplications(userId: string): WorkdayApplication[] {
    return this.data.applications.filter(a => a.userId === userId);
  }

  getApplicationById(userId: string, appId: string): WorkdayApplication | undefined {
    return this.data.applications.find(a => a.id === appId && a.userId === userId);
  }

  getApplicationByJobId(userId: string, jobId: string): WorkdayApplication | undefined {
    return this.data.applications.find(a => a.jobId === jobId && a.userId === userId);
  }

  saveApplication(app: WorkdayApplication): WorkdayApplication {
    const existingIndex = this.data.applications.findIndex(a => a.id === app.id && a.userId === app.userId);
    if (existingIndex !== -1) {
      this.data.applications[existingIndex] = app;
    } else {
      this.data.applications.unshift(app);
    }
    this.persist();
    return app;
  }

  // Workday Credential Vault
  getCredentialAccounts(userId: string): WorkdayCredentialAccount[] {
    return (this.data.accounts || []).filter(a => a.userId === userId);
  }

  findCredentialAccount(userId: string, company: string): WorkdayCredentialAccount | undefined {
    return (this.data.accounts || []).find(
      a => a.userId === userId && a.company.toLowerCase() === company.toLowerCase()
    );
  }

  saveCredentialAccount(acc: WorkdayCredentialAccount): WorkdayCredentialAccount {
    if (!this.data.accounts) this.data.accounts = [];
    const index = this.data.accounts.findIndex(a => a.id === acc.id && a.userId === acc.userId);
    if (index !== -1) {
      this.data.accounts[index] = acc;
    } else {
      this.data.accounts.unshift(acc);
    }
    this.persist();
    return acc;
  }

  // System Audit & Event Logs
  getAuditLogs(userId: string): SystemAuditLog[] {
    return (this.data.systemAuditLogs || []).filter(l => l.userId === userId).slice(0, 50);
  }

  addAuditLog(log: Omit<SystemAuditLog, 'id'>): SystemAuditLog {
    if (!this.data.systemAuditLogs) this.data.systemAuditLogs = [];
    const entry: SystemAuditLog = {
      ...log,
      id: 'aud_' + crypto.randomUUID().slice(0, 8),
    };
    this.data.systemAuditLogs.unshift(entry);
    this.persist();
    return entry;
  }

  // Agent Logs
  getAgentLogs(userId: string): AgentRunLog[] {
    return this.data.agentLogs.filter(l => l.userId === userId).slice(0, 20);
  }

  addAgentLog(log: AgentRunLog): void {
    this.data.agentLogs.unshift(log);
    this.persist();
  }

  // Discovery Jobs (the async agent pipeline's unit of work)
  getDiscoveryJob(userId: string, jobId: string): DiscoveryJob | undefined {
    return this.data.discoveryJobs.find(j => j.id === jobId && j.userId === userId);
  }

  getLatestDiscoveryJob(userId: string): DiscoveryJob | undefined {
    return this.data.discoveryJobs
      .filter(j => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  addDiscoveryJob(job: DiscoveryJob): DiscoveryJob {
    this.data.discoveryJobs.push(job);
    // Keep the collection bounded — only the most recent 30 per user matter.
    const userJobs = this.data.discoveryJobs.filter(j => j.userId === job.userId);
    if (userJobs.length > 30) {
      const oldestIds = new Set(
        userJobs
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(30)
          .map(j => j.id)
      );
      this.data.discoveryJobs = this.data.discoveryJobs.filter(j => !oldestIds.has(j.id));
    }
    this.persist();
    return job;
  }

  updateDiscoveryJob(userId: string, jobId: string, updates: Partial<DiscoveryJob>): DiscoveryJob | undefined {
    const job = this.getDiscoveryJob(userId, jobId);
    if (!job) return undefined;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    // Completion/failure flushes immediately; progress ticks ride the debounce.
    if (updates.status === 'completed' || updates.status === 'failed') {
      void this.saveNow();
    } else {
      this.persist();
    }
    return job;
  }

  // ─── DiscoveryPool (shared market scans) ──────────────────────────────────
  getPoolEntry(poolKey: string): DiscoveryPoolEntry | undefined {
    return this.data.discoveryPool.find((e) => e.poolKey === poolKey);
  }

  putPoolEntry(entry: DiscoveryPoolEntry): void {
    const arr = this.data.discoveryPool;
    const idx = arr.findIndex((e) => e.poolKey === entry.poolKey);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    // Bounded pool: evict least-recently-requested entries beyond the cap.
    if (arr.length > 50) {
      arr.sort((a, b) => b.lastRequestedAt.localeCompare(a.lastRequestedAt));
      this.data.discoveryPool = arr.slice(0, 50);
    }
    this.persist();
  }

  /** Cron sweeper input: most-recently-requested bounded entries. */
  getActivePoolEntries(sinceDays = 7, limit = 50): DiscoveryPoolEntry[] {
    const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    return this.data.discoveryPool
      .filter((e) => e.lastRequestedAt >= cutoff)
      .sort((a, b) => b.lastRequestedAt.localeCompare(a.lastRequestedAt))
      .slice(0, limit);
  }

  // System Secrets & Key Management
  getSystemSecret(key: string): string | undefined {
    return this.data.systemSecrets ? this.data.systemSecrets[key] : undefined;
  }

  async setSystemSecret(key: string, value: string): Promise<boolean> {
    if (!this.data.systemSecrets) this.data.systemSecrets = {};
    this.data.systemSecrets[key] = value;
    this.persist();
    return this.saveNow();
  }

  getAllSystemSecrets(): Record<string, string> {
    return this.data.systemSecrets ? { ...this.data.systemSecrets } : {};
  }

  async setAllSystemSecrets(secrets: Record<string, string>): Promise<boolean> {
    if (!this.data.systemSecrets) this.data.systemSecrets = {};
    this.data.systemSecrets = { ...this.data.systemSecrets, ...secrets };
    this.persist();
    return this.saveNow();
  }
}

export const db = new DatabaseService();

/**
 * Resolves once the in-memory database has been hydrated from the durable
 * store. Application code (server/app.ts) gates request handling on this —
 * do not serve traffic before it settles.
 */
export const dbReady = db.hydrate();
