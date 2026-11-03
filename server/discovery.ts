/**
 * Asynchronous discovery agent engine.
 *
 * Production goal ("agents fast enough"):
 *   POST /agent/discover returns 202 + jobId in <300ms. The Gemini reasoning
 *   call — the slow part — runs in the background; the client polls
 *   GET /agent/discover/:jobId for progress until a terminal status.
 *
 * Serverless reality this engine is built for:
 *   - Background work is attached to the invocation with `waitUntil`
 *     (@vercel/functions). If the instance dies before the job finishes
 *     (cold start eviction), a stale-queued job is detected and resumed
 *     inline by the next status poll — idempotent via the job record.
 *   - Free-tier Gemini quota is shielded three ways: per-user cooldown,
 *     a short-lived result cache (repeat clicks cost nothing), and the
 *     existing mock-fallback inside gemini.ts on hard quota failures.
 */
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { db } from './db.js';
import { discoverJobsWithAgent } from './gemini.js';
import { CandidateProfile, DiscoveryJob, DiscoveryJobResult, DiscoveryOptions, JobPosting } from './types.js';

// ─── Tunables (free-tier aware) ──────────────────────────────────────────────
const USER_COOLDOWN_MS = 45_000; // minimum spacing between agent runs per user
const RESULT_TTL_MS = 10 * 60_000; // identical-scan cache duration
const STALE_JOB_MS = 45_000; // queued/running job untouched for this long = resume candidate

// ─── Instance-local coordination ────────────────────────────────────────────
const inflight = new Map<string, Promise<void>>(); // jobId → running promise

interface CachedResult {
  result: DiscoveryJobResult;
  jobIds: string[];
  expiresAt: number;
}
const resultCache = new Map<string, CachedResult>();

/**
 * Attempts to keep background work alive past the HTTP response on serverless.
 * Locally (long-lived process) this resolves to a fire-and-forget call.
 */
function scheduleRun(run: () => Promise<void>): void {
  try {
    waitUntil(run());
  } catch {
    void run();
  }
}

export const STALE_CUTOFF_DAYS = 45;

/**
 * Enforce 1 — STRICT 45-DAY FRESHNESS RULE: no tracked posting older than
 * 45 days. Missing/unknown age defaults to 10 (be generous to fresh data).
 */
export function filterStaleJobs<T extends { postedDaysAgo?: number }>(jobs: T[]): T[] {
  return jobs.filter((j) => {
    const days = typeof j.postedDaysAgo === 'number' ? j.postedDaysAgo : 10;
    return days <= STALE_CUTOFF_DAYS;
  });
}

/** Employers excluded by policy: current employer plus user config, deduped. */
export function excludedEmployers(profile: { currentEmployer?: string | undefined; excludedEmployers?: string[] }): string[] {
  return Array.from(new Set([profile.currentEmployer, ...(profile.excludedEmployers || [])].filter(Boolean) as string[]));
}

/**
 * Enforce 2 — STRICT CURRENT/LAST EMPLOYER EXCLUSION RULE: never surface a
 * posting from the candidate's current/last employer or explicit exclusions.
 * Company match is case-insensitive substring (catches "… Cloud Tech Ltd").
 */
export function filterConflictJobs<T extends { company: string }>(jobs: T[], excludedEmployerNames: string[]): T[] {
  return jobs.filter((j) => {
    const isConflict = excludedEmployerNames.some((ex) => ex && j.company.toLowerCase().includes(ex.toLowerCase()));
    return !isConflict;
  });
}

function cacheKey(userId: string, profile: CandidateProfile, options: DiscoveryOptions): string {  const fingerprint = JSON.stringify({
    u: userId,
    o: { k: options.keywords, s: options.sources, l: options.location, r: options.remoteOnly, m: options.minMatchScore },
    p: { skills: profile.primarySkills, cats: profile.skills?.map(c => c.items).flat().sort(), yrs: profile.yearsOfExperience, loc: profile.location },
    rev: profile.updatedAt,
  });
  return crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 24);
}

async function markStage(userId: string, jobId: string, status: DiscoveryJob['status'], progress: number, stage: string): Promise<void> {
  db.updateDiscoveryJob(userId, jobId, { status, progress, stage });
}

/** The discovery core: shared by fresh runs, cache misses, and stale-job resumes. */
async function executeDiscovery(userId: string, jobId: string, profile: CandidateProfile, options: DiscoveryOptions): Promise<{ result: DiscoveryJobResult; jobIds: string[] }> {
  await markStage(userId, jobId, 'running', 10, 'Scanning portals…');

  const rawDiscovered = await discoverJobsWithAgent(profile, options);
  await markStage(userId, jobId, 'running', 55, `Parsed ${rawDiscovered.length} raw openings`);

  // Share the scan: store the raw template in the shared pool so any user with
  // this market fingerprint reuses it (per-user filters apply at serve time).
  try {
    savePoolEntryFromScan(profile, options, rawDiscovered);
  } catch (poolErr) {
    console.warn('[discovery] pool write skipped:', poolErr);
  }

  // Enforce 1: STRICT 45-DAY FRESHNESS RULE (see filterStaleJobs)
  // Enforce 2: STRICT CURRENT/LAST EMPLOYER EXCLUSION RULE (see filterConflictJobs)
  const freshJobs = filterStaleJobs(rawDiscovered);
  const droppedStaleCount = rawDiscovered.length - freshJobs.length;
  await markStage(userId, jobId, 'running', 65, `Freshness filter: ${droppedStaleCount} stale dropped`);

  const allExcluded = excludedEmployers(profile);
  const eligibleJobs = filterConflictJobs(freshJobs, allExcluded);
  const droppedConflictCount = freshJobs.length - eligibleJobs.length;
  await markStage(userId, jobId, 'running', 75, `Conflict shield: ${droppedConflictCount} blocked`);

  const newJobs: JobPosting[] = eligibleJobs.map((j) => ({
    ...j,
    id: 'job_' + crypto.randomUUID().slice(0, 8),
    userId,
    discoveredAt: new Date().toISOString(),
    isStale: false,
    isConflictOfInterest: false,
    // Gemini's responseSchema isn't strictly enforced — the model may omit
    // array fields, which would crash the UI's job cards. Normalize here.
    requiredSkills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
    matchingSkills: Array.isArray(j.matchingSkills) ? j.matchingSkills : [],
    missingSkills: Array.isArray(j.missingSkills) ? j.missingSkills : [],
    description: j.description || '',
    fitRationale: j.fitRationale || '',
  }));

  db.addJobs(newJobs);
  await markStage(userId, jobId, 'running', 85, `Stored ${newJobs.length} openings`);

  db.addAuditLog({
    userId,
    timestamp: new Date().toISOString(),
    category: 'discovery',
    action: 'AGENT_DISCOVERY_COMPLETED',
    details: `Agent scanned portals. Stored ${newJobs.length} active matching jobs. Filtered out ${droppedStaleCount} stale jobs (>45 days) and intercepted ${droppedConflictCount} current employer openings.`,
    severity: 'success',
    metadata: {
      keywords: options.keywords || profile.targetRoles,
      staleFiltered: droppedStaleCount,
      conflictsBlocked: droppedConflictCount,
    },
  });

  db.addAgentLog({
    id: 'log_' + crypto.randomUUID().slice(0, 8),
    userId,
    triggeredAt: new Date().toISOString(),
    status: 'completed',
    keywords: options.keywords || profile.targetRoles,
    sources: options.sources || ['LinkedIn', 'Workday Portal', 'Naukri', 'Indeed'],
    jobsFound: newJobs.length,
    jobsFilteredOldCount: droppedStaleCount,
    jobsFilteredConflictCount: droppedConflictCount,
    message: `Discovered ${newJobs.length} qualified roles. 45-day freshness verified. Conflict-of-interest check applied.`,
    details: [
      ...newJobs.map((j) => `${j.company}: ${j.title} (${j.matchScore}% fit, Posted ${j.postedDaysAgo}d ago)`),
      ...(droppedStaleCount > 0 ? [`Discarded ${droppedStaleCount} postings older than 45 days`] : []),
      ...(droppedConflictCount > 0 ? [`Blocked ${droppedConflictCount} postings matching current employer/exclusions`] : []),
    ],
  });

  return {
    result: {
      jobsFound: newJobs.length,
      staleJobsFiltered: droppedStaleCount,
      conflictJobsBlocked: droppedConflictCount,
    },
    jobIds: newJobs.map(j => j.id),
  };
}

async function runJob(userId: string, jobId: string, profile: CandidateProfile, options: DiscoveryOptions): Promise<void> {
  try {
    const { result, jobIds } = await executeDiscovery(userId, jobId, profile, options);
    db.updateDiscoveryJob(userId, jobId, {
      status: 'completed',
      progress: 100,
      stage: 'Discovery complete',
      result,
      completedAt: new Date().toISOString(),
      jobIdsDiscovered: jobIds,
    });
  } catch (err) {
    console.error("[discovery] run failed:", err);
    db.updateDiscoveryJob(userId, jobId, {
      status: 'failed',
      stage: 'Failed',
      error: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  } finally {
    inflight.delete(jobId);
  }
}

export function startDiscovery(userId: string, options: DiscoveryOptions): { jobId: string; status: DiscoveryJob['status']; cooldownSeconds?: number; cached: boolean; result?: DiscoveryJobResult } {
  const profile = db.getProfile(userId);
  if (!profile) {
    const notFound = new Error('Profile not found') as Error & { httpStatus: number };
    notFound.httpStatus = 404;
    throw notFound;
  }

  // 1) In-flight dedupe: an unfinished run for this user returns its job, not a new one.
  const running = db.getLatestDiscoveryJob(userId);
  if (running && (running.status === 'queued' || running.status === 'running')) {
    return { jobId: running.id, status: running.status, cached: false };
  }

  // 2) Shared discovery pool: another user already scanned this exact market
  //    within the TTL → instant completion, ZERO agent quota. This check runs
  //    before the per-user cooldown (pool serves cost quota, not spent here).
  const poolKey = poolKeyOf(profile, options);
  const poolEntry = db.getPoolEntry(poolKey);
  if (poolEntry && Date.now() - new Date(poolEntry.fetchedAt).getTime() < POOL_TTL_MS) {
    const adapted = adaptPoolJobsForUser(poolEntry, profile, options);
    if (adapted) {
      const now = new Date().toISOString();
      console.log(`[discovery] user ${userId} served from shared pool ${poolKey.slice(0, 8)} (${adapted.jobs.length} jobs)`);
      db.putPoolEntry({ ...poolEntry, lastRequestedAt: now, requestCount: poolEntry.requestCount + 1 });
      db.addJobs(adapted.jobs);

      const result: DiscoveryJobResult = {
        jobsFound: adapted.jobs.length,
        staleJobsFiltered: adapted.droppedStale,
        conflictJobsBlocked: adapted.droppedConflict,
      };
      const job: DiscoveryJob = {
        id: 'disc_' + crypto.randomUUID().slice(0, 8),
        userId,
        status: 'completed',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
        options,
        progress: 100,
        stage: `Served from shared discovery pool (no agent quota used)`,
        result,
      };
      db.addDiscoveryJob(job);
      db.addAgentLog({
        id: 'log_' + crypto.randomUUID().slice(0, 8),
        userId,
        triggeredAt: now,
        status: 'completed',
        keywords: options.keywords || profile.targetRoles,
        sources: options.sources || ['Shared Pool'],
        jobsFound: adapted.jobs.length,
        jobsFilteredOldCount: adapted.droppedStale,
        jobsFilteredConflictCount: adapted.droppedConflict,
        message: `Served ${adapted.jobs.length} qualified roles from the shared discovery pool (shared scan, zero extra agent quota).`,
        details: [
          ...adapted.jobs.map((j) => `${j.company}: ${j.title} (${j.matchScore}% fit, Posted ${j.postedDaysAgo}d ago)`),
          `Pool age: ${Math.max(0, Math.round((Date.now() - new Date(poolEntry.fetchedAt).getTime()) / 3_600_000))}h since the market scan.`,
        ],
      });
      return { jobId: job.id, status: 'completed', cached: true, result };
    }
  }

  // 3) Free-tier cooldown.
  if (running && Date.now() - new Date(running.createdAt).getTime() < USER_COOLDOWN_MS && running.status !== 'failed') {
    const cooldownSeconds = Math.max(1, Math.ceil((USER_COOLDOWN_MS - (Date.now() - new Date(running.createdAt).getTime())) / 1000));
    return { jobId: running.id, status: running.status, cooldownSeconds, cached: false };
  }

  // 4) Result cache: identical scan within TTL → instant completion, zero quota.
  const key = cacheKey(userId, profile, options);
  const cachedEntry = resultCache.get(key);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    const job: DiscoveryJob = {
      id: 'disc_' + crypto.randomUUID().slice(0, 8),
      userId,
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      options,
      progress: 100,
      stage: 'Served from cache (no agent quota used)',
      result: cachedEntry.result,
    };
    db.addDiscoveryJob(job);
    return { jobId: job.id, status: 'completed', cached: true, result: cachedEntry.result };
  }

  // 5) Fresh run.
  const job: DiscoveryJob = {
    id: 'disc_' + crypto.randomUUID().slice(0, 8),
    userId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options,
    progress: 5,
    stage: 'Queued',
  };
  db.addDiscoveryJob(job);

  // fire-and-forget: the HTTP response returns now; work continues below
  const work = runJob(userId, job.id, profile, options);
  inflight.set(job.id, work);
  scheduleRun(() => inflight.get(job.id) || work);

  return { jobId: job.id, status: job.status, cached: false };
}

/**
 * Status evaluation for GET /agent/discover/:jobId.
 * Also the cross-instance self-healer: a job stranded in queued/running
 * beyond STALE_JOB_MS (serverless eviction kills scheduled work) is resumed
 * inline by this poll — guarded so two instances cannot double-run.
 */
export function pollDiscovery(userId: string, jobId: string): DiscoveryJob | undefined {
  const job = db.getDiscoveryJob(userId, jobId);
  if (!job) return undefined;

  const isStale = (job.status === 'queued' || job.status === 'running') &&
    Date.now() - new Date(job.updatedAt).getTime() > STALE_JOB_MS;

  if (isStale && !inflight.has(job.id)) {
    const profile = db.getProfile(userId);
    if (!profile) return job;

    const staleMs = Date.now() - new Date(job.updatedAt).getTime();
    db.updateDiscoveryJob(userId, job.id, {
      stage: `Resumed after ${Math.round(staleMs / 1000)}s interruption`,
    });
    console.warn(`[discovery] resuming stranded job ${job.id} (${Math.round(staleMs / 1000)}s stale)`);
    inflight.set(job.id, runJob(userId, job.id, profile, job.options));
  }

  return job;
}

/** Used by the routes to convert start errors into HTTP responses. */
export function asHttpError(err: unknown): { httpStatus: number; message: string } | null {
  if (err && typeof err === 'object' && 'httpStatus' in err && 'message' in err) {
    return { httpStatus: (err as { httpStatus: number }).httpStatus, message: (err as { message: string }).message };
  }
  return null;
}

// ─── Shared DiscoveryPool ────────────────────────────────────────────────────
// ONE market scan per (skills fingerprint + search filters), shared across
// users. The pool stores template postings unfiltered by user-specific rules;
// each user's 45d freshness, conflict shield, location and min-score are
// applied at serve time. Free-tier quota math: N identical users = 1 agent run.
import { DiscoveryPoolEntry, PoolSkillContext } from './types.js';

const POOL_TTL_MS = 4 * 60 * 60_000; // entry freshness window (matches the cron cadence)

/** Shared fingerprint — deliberately excludes userId and profile.updatedAt. */
export function poolKeyOf(profile: CandidateProfile, options: DiscoveryOptions): string {
  const fp = JSON.stringify({
    k: options.keywords, s: options.sources, l: options.location, r: options.remoteOnly, m: options.minMatchScore,
    skills: profile.primarySkills,
    cats: profile.skills?.map((c) => c.items).flat().sort(),
    yrs: profile.yearsOfExperience,
  });
  return crypto.createHash('sha1').update(fp).digest('hex').slice(0, 24);
}

function skillContextOf(profile: CandidateProfile): PoolSkillContext {
  return {
    primarySkills: profile.primarySkills,
    skillItems: profile.skills?.map((c) => c.items).flat() || [],
    targetRoles: profile.targetRoles,
    yearsOfExperience: profile.yearsOfExperience,
    currentEmployer: profile.currentEmployer,
    excludedEmployers: [],
    location: profile.location,
    preferredWorkType: profile.workdayPreferences?.preferredWorkType,
  };
}

/** Prompt-able profile rebuilt from a stored skill context (used by the sweeper). */
function profileFromSkillContext(ctx: PoolSkillContext): CandidateProfile {
  return {
    id: 'pool', userId: 'pool', fullName: 'Discovery Pool', email: '', phone: '',
    location: ctx.location || 'United States', headline: '', summary: '',
    linkedinUrl: '', githubUrl: '', portfolioUrl: '',
    currentEmployer: ctx.currentEmployer || '',
    excludedEmployers: [],
    skills: [{ category: 'Primary', items: ctx.skillItems }],
    primarySkills: ctx.primarySkills,
    workdayPreferences: { preferredWorkType: ctx.preferredWorkType } as unknown as CandidateProfile['workdayPreferences'],
    targetRoles: ctx.targetRoles,
    targetLocations: ctx.location ? [ctx.location] : [],
    yearsOfExperience: ctx.yearsOfExperience,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTemplateJob(t: any): any {
  return {
    ...t,
    company: t.company || 'Unknown',
    title: t.title || 'Untitled',
    requiredSkills: Array.isArray(t.requiredSkills) ? t.requiredSkills : [],
    matchingSkills: Array.isArray(t.matchingSkills) ? t.matchingSkills : [],
    missingSkills: Array.isArray(t.missingSkills) ? t.missingSkills : [],
    description: t.description || '',
  };
}

/**
 * Pure pool→user adapter: ages postings by the elapsed pool age, then applies
 * the USER-SIDE filters only (45d, conflict shield, min score). Exported for
 * unit tests. Returns null when the pooled scan yields nothing for this user
 * (caller falls through to a fresh run).
 */
export function adaptPoolJobsForUser(
  entry: Pick<DiscoveryPoolEntry, 'jobs' | 'fetchedAt'>,
  profile: CandidateProfile,
  options: DiscoveryOptions,
): { jobs: JobPosting[]; droppedStale: number; droppedConflict: number; droppedScore: number } | null {
  const now = Date.now();
  const ageBumpDays = Math.floor((now - new Date(entry.fetchedAt).getTime()) / 86_400_000);

  const aged = entry.jobs.map((t: any) => {
    const baseDays = typeof t.postedDaysAgo === 'number' ? t.postedDaysAgo : 10;
    return { ...t, postedDaysAgo: baseDays + ageBumpDays };
  });

  const fresh = filterStaleJobs(aged);
  const droppedStale = aged.length - fresh.length;

  const excluded = excludedEmployers(profile);
  const nonConflict = filterConflictJobs(fresh, excluded);
  const droppedConflict = fresh.length - nonConflict.length;

  const minScore = options.minMatchScore ?? 0;
  const scoreOk = nonConflict.filter((j) => ((j as { matchScore?: number }).matchScore ?? 0) >= minScore);
  const droppedScore = nonConflict.length - scoreOk.length;

  if (scoreOk.length === 0) return null;

  const jobs: JobPosting[] = scoreOk.map((t: any) => ({
    ...t,
    id: 'job_' + crypto.randomUUID().slice(0, 8),
    userId: profile.userId,
    discoveredAt: new Date().toISOString(),
    isStale: false,
    isConflictOfInterest: false,
    requiredSkills: Array.isArray(t.requiredSkills) ? t.requiredSkills : [],
    matchingSkills: Array.isArray(t.matchingSkills) ? t.matchingSkills : [],
    missingSkills: Array.isArray(t.missingSkills) ? t.missingSkills : [],
    description: t.description || '',
    fitRationale: t.fitRationale || '',
  }));

  return { jobs, droppedStale, droppedConflict, droppedScore };
}

/** Store / refresh a pool template from a raw scan (called on every fresh run). */
export function savePoolEntryFromScan(
  profile: CandidateProfile,
  options: DiscoveryOptions,
  rawDiscovered: Omit<JobPosting, 'id' | 'userId' | 'discoveredAt'>[],
): void {
  const now = new Date().toISOString();
  const poolKey = poolKeyOf(profile, options);
  const prev = db.getPoolEntry(poolKey);
  db.putPoolEntry({
    poolKey,
    keywords: options.keywords,
    sources: options.sources,
    location: options.location,
    remoteOnly: options.remoteOnly,
    skillContext: skillContextOf(profile),
    jobs: rawDiscovered.map(normalizeTemplateJob) as DiscoveryPoolEntry['jobs'],
    fetchedAt: now,
    lastRequestedAt: now,
    requestCount: (prev?.requestCount || 0) + 1,
  });
}

/**
 * Cron sweeper: re-market-scans the most-requested pool entries so users find
 * new postings without triggering a run themselves. Bounded by maxEntries to
 * respect the free-tier budget (2 refreshes per 4h tick by default).
 */
export async function sweepDiscoveryPool(maxEntries = 2): Promise<{
  swept: number;
  results: Array<{ poolKey: string; jobsFound: number; error?: string }>;
}> {
  const entries = db.getActivePoolEntries(7, maxEntries);
  const results: Array<{ poolKey: string; jobsFound: number; error?: string }> = [];

  for (const entry of entries) {
    const profile = profileFromSkillContext(entry.skillContext);
    const options: DiscoveryOptions = {
      keywords: entry.keywords, sources: entry.sources,
      location: entry.location, remoteOnly: entry.remoteOnly,
    };
    try {
      console.log(`[sweep] refreshing pool entry ${entry.poolKey.slice(0, 8)}…`);
      const raw = await discoverJobsWithAgent(profile, options);
      const now = new Date().toISOString();
      db.putPoolEntry({
        ...entry,
        jobs: raw.map(normalizeTemplateJob) as DiscoveryPoolEntry['jobs'],
        fetchedAt: now,
        lastRequestedAt: now,
      });
      results.push({ poolKey: entry.poolKey, jobsFound: raw.length });
      console.log(`[sweep] ${entry.poolKey.slice(0, 8)} → ${raw.length} fresh postings`);
    } catch (err) {
      console.error('[sweep] entry refresh failed:', err);
      results.push({ poolKey: entry.poolKey, jobsFound: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { swept: entries.length, results };
}
