/**
 * Real job-board adapter: Greenhouse / Lever / Ashby public boards.
 *
 * Implements issue #10 ("real job-source adapter") using the public,
 * unauthenticated JSON endpoints companies already publish for their own
 * career sites. Real data beats AI-synthetic, and it costs ZERO agent quota.
 *
 * Endpoint facts verified live 2026-11-07 (and independently by the
 * paopao-studio-ai report on the issue):
 *   - Greenhouse:  GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
 *                  (the legacy boards.greenhouse.io/{token}.json host 301s to
 *                  job-boards… and then 404s). Add ?content=true for HTML-
 *                  escaped descriptions. Rows carry id, title, absolute_url,
 *                  location.name, first_published, updated_at, company_name.
 *   - Lever:       GET https://api.lever.co/v0/postings/{token}?mode=json
 *                  (EU tenants: api.eu.lever.co). Unknown tenant → 404
 *                  {"ok":false}. createdAt is epoch MILLISECONDS. Title is
 *                  `text`; location/team/commitment under `categories`.
 *   - Ashby:       GET https://api.ashbyhq.com/posting-api/job-board/{org}
 *                  Returns { jobs: [...] } with descriptionPlain, isRemote,
 *                  publishedAt, jobUrl. No POST/auth needed.
 *
 * Failure contract (deliberate):
 *   - 404            → 'not_found': the token is wrong or the company moved
 *                      ATS. Log and skip; this is misconfiguration, never a
 *                      reason to fall back to AI generation as if empty.
 *   - timeout / 5xx  → 'error': transient. Skip this run; the shared pool
 *                      keeps serving the previous scan.
 *   - The adapter NEVER throws — callers get statuses and partial results.
 */

// ─── Target parsing ──────────────────────────────────────────────────────────

export type BoardAts = 'greenhouse' | 'lever' | 'ashby';
export type ProbeAts = BoardAts | 'probe'; // 'probe' = try every ATS in order

export interface BoardTarget {
  ats: ProbeAts;
  token: string;
  /** Display name for logs/stages, e.g. "stripe (greenhouse)". */
  label: string;
}

/**
 * Companies with long-stable public board tokens. Wrong/stale entries are
 * harmless by design: a 404 is skipped and the run falls back to the agent
 * chain. Verified live 2026-11-07: anthropic (greenhouse), palantir (lever),
 * ramp (ashby); stripe/openai per the issue #10 field report.
 */
export const WELL_KNOWN_BOARDS: Record<string, BoardTarget> = {
  // Greenhouse
  stripe:     { ats: 'greenhouse', token: 'stripe',     label: 'Stripe (greenhouse)' },
  anthropic:  { ats: 'greenhouse', token: 'anthropic',  label: 'Anthropic (greenhouse)' },
  airbnb:     { ats: 'greenhouse', token: 'airbnb',     label: 'Airbnb (greenhouse)' },
  doordash:   { ats: 'greenhouse', token: 'doordash',   label: 'DoorDash (greenhouse)' },
  robinhood:  { ats: 'greenhouse', token: 'robinhood',  label: 'Robinhood (greenhouse)' },
  pinterest:  { ats: 'greenhouse', token: 'pinterest',  label: 'Pinterest (greenhouse)' },
  dropbox:    { ats: 'greenhouse', token: 'dropbox',    label: 'Dropbox (greenhouse)' },
  cloudflare: { ats: 'greenhouse', token: 'cloudflare', label: 'Cloudflare (greenhouse)' },
  databricks: { ats: 'greenhouse', token: 'databricks', label: 'Databricks (greenhouse)' },
  coinbase:   { ats: 'greenhouse', token: 'coinbase',   label: 'Coinbase (greenhouse)' },
  eventbrite: { ats: 'greenhouse', token: 'eventbrite', label: 'Eventbrite (greenhouse)' },
  // Lever
  palantir:   { ats: 'lever', token: 'palantir', label: 'Palantir (lever)' },
  docusign:   { ats: 'lever', token: 'docusign', label: 'DocuSign (lever)' },
  // Ashby
  openai:     { ats: 'ashby', token: 'openai', label: 'OpenAI (ashby)' },
  ramp:       { ats: 'ashby', token: 'ramp',   label: 'Ramp (ashby)' },
  deel:       { ats: 'ashby', token: 'deel',   label: 'Deel (ashby)' },
  linear:     { ats: 'ashby', token: 'linear', label: 'Linear (ashby)' },
};

const ATS_OF_URL: Array<[RegExp, BoardAts]> = [
  [/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/i, 'greenhouse'],
  [/(?:job-)?boards\.greenhouse\.io\/([^/?#]+)/i, 'greenhouse'],
  [/(?:api\.eu\.)?lever\.co\/v0\/postings\/([^/?#]+)/i, 'lever'],
  [/jobs\.lever\.co\/([^/?#]+)/i, 'lever'],
  [/jobs\.ashbyhq\.com\/([^/?#]+)/i, 'ashby'],
  [/api\.ashbyhq\.com\/posting-api\/job-board\/([^/?#]+)/i, 'ashby'],
];

/**
 * Accepts mixed input — "greenhouse:stripe", "https://jobs.lever.co/palantir",
 * "jobs.ashbyhq.com/ramp" — plus bare slugs. Bare slugs resolve through
 * WELL_KNOWN_BOARDS; unknown bare slugs become 'probe' targets (all three ATS
 * are tried at fetch time and the board with jobs wins).
 */
export function parseBoardTargets(inputs: string[]): BoardTarget[] {
  const out = new Map<string, BoardTarget>();
  for (const raw of inputs || []) {
    const input = String(raw || '').trim();
    if (!input) continue;

    // ats:slug
    const prefixed = input.match(/^(greenhouse|lever|ashby)[:/](.+)$/i);
    if (prefixed) {
      const ats = prefixed[1].toLowerCase() as BoardAts;
      const token = prefixed[2].replace(/\/+$/, '').trim().toLowerCase();
      if (token) out.set(`${ats}:${token}`, { ats, token, label: `${token} (${ats})` });
      continue;
    }

    // URL
    if (/https?:\/\//i.test(input) || /\.(greenhouse|lever|ashby)/i.test(input)) {
      for (const [re, ats] of ATS_OF_URL) {
        const m = input.match(re);
        if (m && m[1]) {
          const token = m[1].toLowerCase();
          out.set(`${ats}:${token}`, { ats, token, label: `${token} (${ats})` });
          break;
        }
      }
      continue;
    }

    // Bare slug
    const slug = input.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!slug) continue;
    const known = WELL_KNOWN_BOARDS[slug];
    if (known) {
      out.set(`${known.ats}:${known.token}`, { ...known });
    } else {
      out.set(`probe:${slug}`, { ats: 'probe', token: slug, label: `${slug} (probe)` });
    }
  }
  return Array.from(out.values());
}

/**
 * Discovery-side resolver: explicit `options.companies` may be anything
 * parseBoardTargets accepts (including unknown slugs to probe), while
 * `options.keywords` only map EXACT well-known company names — free-text role
 * keywords ("backend engineer") must never become pointless board probes.
 */
export function resolveDiscoveryTargets(options: { companies?: string[]; keywords?: string[] }): BoardTarget[] {
  const map = new Map<string, BoardTarget>();
  const add = (t: BoardTarget) => map.set(`${t.ats}:${t.token}`, t);
  parseBoardTargets(options.companies || []).forEach(add);
  (options.keywords || [])
    .map((k) => String(k || '').toLowerCase().trim())
    .filter((k) => k && WELL_KNOWN_BOARDS[k])
    .forEach((k) => add({ ...WELL_KNOWN_BOARDS[k] }));
  return Array.from(map.values());
}

// ─── Text helpers ────────────────────────────────────────────────────────────

/** Decode the entities ATS APIs escape, then strip tags to plain text. */
export function stripHtml(html: string): string {
  if (!html) return '';
  // Greenhouse (?content=true) ships the WHOLE markup entity-escaped, so
  // entities must be decoded FIRST — otherwise the tag regexes below never
  // see a single real tag and the escaped markup survives into the JD.
  const decoded = html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Description capped for storage/UI (full JD is one click away via sourceUrl). */
const MAX_DESC = 1500;
export function clampDescription(text: string): string {
  if (text.length <= MAX_DESC) return text;
  return text.slice(0, MAX_DESC).replace(/\s+\S*$/, '') + '…';
}

/** Age in whole days from an ISO date or epoch-ms number; null if unusable. */
export function daysSince(dateLike: string | number | undefined | null, nowMs = Date.now()): number | null {
  if (dateLike === undefined || dateLike === null || dateLike === '') return null;
  const ms = typeof dateLike === 'number' ? dateLike : Date.parse(dateLike);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
}

// ─── Normalized row shape ────────────────────────────────────────────────────

export interface RawBoardJob {
  company: string;
  title: string;
  location: string;
  remoteType: 'Remote' | 'Hybrid' | 'On-site';
  employmentType: 'Full-time' | 'Contract' | 'Part-time';
  sourceUrl: string;
  description: string;
  postedDate: string; // ISO
  postedDaysAgo: number;
  ats: BoardAts;
  /** Dedupe key: `${ats}:${token}:${id}` — stable across re-imports. */
  dedupeKey: string;
}

export function remoteTypeOf(location: string, isRemote?: boolean): 'Remote' | 'Hybrid' | 'On-site' {
  if (isRemote === true) return 'Remote';
  const loc = (location || '').toLowerCase();
  if (/\bremote\b/.test(loc)) return 'Remote';
  if (/\bhybrid\b/.test(loc)) return 'Hybrid';
  return 'On-site';
}

export function employmentTypeOf(commitment: string | undefined): 'Full-time' | 'Contract' | 'Part-time' {
  const c = (commitment || '').toLowerCase();
  if (/contract|freelance|temporary/.test(c)) return 'Contract';
  if (/part[- ]?time/.test(c)) return 'Part-time';
  return 'Full-time';
}

// ─── Per-ATS normalizers (pure — unit-tested with fixtures) ─────────────────

export function normalizeGreenhouseRow(row: any, token: string, nowMs = Date.now()): RawBoardJob | null {
  if (!row || !row.id || !row.title) return null;
  const location = String(row.location?.name || '').trim() || 'Not specified';
  const age = daysSince(row.first_published || row.updated_at, nowMs);
  return {
    company: String(row.company_name || token).trim(),
    title: String(row.title).trim(),
    location,
    remoteType: remoteTypeOf(location),
    employmentType: 'Full-time', // not exposed by the list endpoint
    sourceUrl: String(row.absolute_url || `https://job-boards.greenhouse.io/${token}/jobs/${row.id}`),
    description: clampDescription(stripHtml(String(row.content || ''))),
    postedDate: new Date(nowMs - (age ?? 10) * 86_400_000).toISOString(),
    postedDaysAgo: age ?? 10, // unknown age follows the pool convention (10)
    ats: 'greenhouse',
    dedupeKey: `greenhouse:${token}:${row.id}`,
  };
}

export function normalizeLeverRow(row: any, token: string, nowMs = Date.now()): RawBoardJob | null {
  if (!row || !row.id || !row.text) return null;
  const cats = row.categories || {};
  const workplace = String(row.workplaceType || '').trim();
  let location = String(cats.location || '').trim() || 'Not specified';
  if (workplace && !new RegExp(workplace, 'i').test(location)) location += ` (${workplace})`;
  const age = daysSince(row.createdAt, nowMs);
  const description = clampDescription(
    stripHtml(String(row.descriptionPlain || row.description || '')),
  );
  return {
    company: String(row.companyName || token).trim(),
    title: String(row.text).trim(),
    location,
    remoteType: remoteTypeOf(location),
    employmentType: employmentTypeOf(cats.commitment),
    sourceUrl: String(row.hostedUrl || row.applyUrl || `https://jobs.lever.co/${token}`),
    description,
    postedDate: new Date(nowMs - (age ?? 10) * 86_400_000).toISOString(),
    postedDaysAgo: age ?? 10,
    ats: 'lever',
    dedupeKey: `lever:${token}:${row.id}`,
  };
}

export function normalizeAshbyRow(row: any, token: string, nowMs = Date.now()): RawBoardJob | null {
  if (!row || !row.id || !row.title) return null;
  const location = String(row.location || '').trim() || 'Not specified';
  const age = daysSince(row.publishedAt, nowMs);
  const employment =
    row.employmentType === 'FullTime' ? 'Full-time'
    : row.employmentType === 'Contractor' || row.employmentType === 'Contract' ? 'Contract'
    : row.employmentType === 'PartTime' ? 'Part-time'
    : 'Full-time';
  return {
    company: String(row.companyName || token).trim(),
    title: String(row.title).trim(),
    location,
    remoteType: remoteTypeOf(location, row.isRemote === true),
    employmentType: employment as RawBoardJob['employmentType'],
    sourceUrl: String(row.jobUrl || row.applyUrl || `https://jobs.ashbyhq.com/${token}`),
    description: clampDescription(String(row.descriptionPlain || stripHtml(String(row.descriptionHtml || '')))),
    postedDate: new Date(nowMs - (age ?? 10) * 86_400_000).toISOString(),
    postedDaysAgo: age ?? 10,
    ats: 'ashby',
    dedupeKey: `ashby:${token}:${row.id}`,
  };
}

// ─── Fetch layer ─────────────────────────────────────────────────────────────

type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type BoardStatus = 'ok' | 'not_found' | 'error';
export interface BoardReport {
  target: string;
  ats: BoardAts | null;
  status: BoardStatus;
  count: number;
  note?: string;
}
export interface BoardScan {
  jobs: RawBoardJob[];
  reports: BoardReport[];
}

const DEFAULT_TIMEOUT_MS = 8_000;

async function getJson(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<
  { status: 'ok'; data: any } | { status: 'not_found' } | { status: 'error'; note: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (res.status === 404) return { status: 'not_found' as const };
    if (!res.ok) return { status: 'error' as const, note: `HTTP ${res.status}` };
    return { status: 'ok' as const, data: await res.json() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'error' as const, note: /abort/i.test(msg) ? `timeout after ${timeoutMs}ms` : msg.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scan a list of targets. 'probe' targets try greenhouse → lever → ashby in
 * order and keep the first board that returns jobs. Results are deduped on
 * `${ats}:${token}:${id}` and again on company+title across companies.
 */
export async function scanBoards(
  targets: BoardTarget[],
  opts: { maxPerCompany?: number; timeoutMs?: number; fetchImpl?: FetchImpl; nowMs?: number } = {},
): Promise<BoardScan> {
  const fetchImpl = opts.fetchImpl || (fetch as unknown as FetchImpl);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const maxPerCompany = opts.maxPerCompany ?? 25;
  const reports: BoardReport[] = [];
  const jobs = new Map<string, RawBoardJob>();

  const collect = (rows: any[], ats: BoardAts, token: string, normalizer: (r: any, t: string, n: number) => RawBoardJob | null) => {
    let count = 0;
    for (const row of rows) {
      const job = normalizer(row, token, nowMs);
      if (!job || jobs.has(job.dedupeKey)) continue;
      jobs.set(job.dedupeKey, job);
      count++;
      if (count >= maxPerCompany) break;
    }
    return count;
  };

  for (const target of targets) {
    const attempts: BoardAts[] = target.ats === 'probe' ? ['greenhouse', 'lever', 'ashby'] : [target.ats as BoardAts];
    let settled = false;
    for (const ats of attempts) {
      const url =
        ats === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${target.token}/jobs?content=true`
        : ats === 'lever' ? `https://api.lever.co/v0/postings/${target.token}?mode=json`
        : `https://api.ashbyhq.com/posting-api/job-board/${target.token}`;

      const res = await getJson(url, fetchImpl, timeoutMs);
      if (res.status === 'not_found') {
        // Token wrong / company moved ATS — try the next ATS for probes, else skip.
        if (target.ats === 'probe') continue;
        reports.push({ target: target.label, ats, status: 'not_found', count: 0, note: 'token unknown — skipping' });
        settled = true;
        break;
      }
      if (res.status === 'error') {
        // Transient — never invent jobs for it, but keep scanning others.
        reports.push({ target: target.label, ats, status: 'error', count: 0, note: res.note });
        if (target.ats === 'probe') continue;
        settled = true;
        break;
      }

      const data = res.data;
      let count = 0;
      if (ats === 'greenhouse') count = collect(data?.jobs || [], ats, target.token, normalizeGreenhouseRow);
      else if (ats === 'lever') count = collect(Array.isArray(data) ? data : [], ats, target.token, normalizeLeverRow);
      else count = collect(data?.jobs || [], ats, target.token, normalizeAshbyRow);

      reports.push({ target: target.label, ats, status: 'ok', count });
      if (count > 0 || target.ats !== 'probe') { settled = true; break; }
      // probe with an empty board: try the next ATS
    }
    if (!settled) {
      reports.push({ target: target.label, ats: target.ats === 'probe' ? null : (target.ats as BoardAts), status: 'not_found', count: 0, note: 'no public board found' });
    }
  }

  // Cross-company dedupe: same company+title on two boards = one posting.
  const seen = new Set<string>();
  const deduped = Array.from(jobs.values()).filter((j) => {
    const key = `${j.company.toLowerCase().replace(/\s+/g, '')}|${j.title.toLowerCase().replace(/\s+/g, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { jobs: deduped, reports };
}

// ─── Keyword + scoring (deterministic, no AI) ────────────────────────────────

/** Keep jobs whose title (or company) matches any keyword; empty keywords = all. */
export function filterBoardJobsByKeywords(jobs: RawBoardJob[], keywords: string[] | undefined): RawBoardJob[] {
  const kws = (keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (!kws.length) return jobs;
  return jobs.filter((j) => {
    const hay = `${j.title} ${j.company}`.toLowerCase();
    return kws.some((k) => hay.includes(k) || k.split(/\s+/).every((w) => hay.includes(w)));
  });
}

/**
 * Deterministic fit score for board rows: skill overlap with the live
 * description + title. Explainable, no AI, and honest about what it is.
 */
export function scoreBoardJob(
  job: RawBoardJob,
  profile: { primarySkills?: string[]; skills?: Array<{ items: string[] }> },
): { matchScore: number; matchingSkills: string[]; fitRationale: string } {
  const skills = Array.from(new Set([...(profile.primarySkills || []), ...(profile.skills || []).flatMap((c) => c.items)])
    ).filter(Boolean);
  const hay = `${job.title} ${job.description}`.toLowerCase();
  const matching = skills.filter((s) => hay.includes(String(s).toLowerCase()));
  const score = Math.min(92, 35 + matching.length * 11);
  return {
    matchScore: score,
    matchingSkills: matching,
    fitRationale: `Live posting from ${job.company}'s ${job.ats} board — ${matching.length} of your listed skills appear in the current description.`,
  };
}
