/**
 * Paste-a-JD matching: analyze ANY pasted job description (or its URL) against
 * the candidate profile — the always-works tier when live-board supply can't
 * reach an employer (Workday CXS is Cloudflare-walled, see boards.ts header)
 * and the honest answer to "does my CV match THIS posting?".
 *
 * Extraction: Gemini (structured, injection-scrubbed) when a key is
 * configured; otherwise deterministic-only. Scoring ALWAYS uses the same
 * convention as the live boards (scoreBoardJob: 35 + 11×skill-hits, cap 92),
 * and counts are computed from real text — never model-generated.
 */
import { stripHtml, clampDescription, remoteTypeOf } from './boards.js';
import { geminiConfigured, parseJobDescriptionWithGemini } from './gemini.js';
import type { CandidateProfile, JobPosting } from './types.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_JD_CHARS = 24_000;

export interface JdAnalysis {
  matchedSkills: string[];
  missingSkills: string[];
  matchScore: number;
  fitRationale: string;
  minYearsExperience: number | null;
  extractionSource: 'ai' | 'deterministic';
  notes: string[];
}

/** Best-effort server-side fetch of a JD from its URL. Career sites that bot-block return '' + a note. */
async function fetchJdFromUrl(url: string, notes: string[]): Promise<string> {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('only http(s) URLs are supported');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(parsed, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApplyMatica/1.0; +https://www.applymatica.com)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const text = stripHtml(html);
      if (text.length < 200) throw new Error('page had almost no readable text (likely bot-blocked)');
      return text.slice(0, MAX_JD_CHARS);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    notes.push(`Couldn't read the URL (${String((err as Error).message).slice(0, 90)}) — paste the description text instead.`);
    return '';
  }
}

/** Canonical, case-deduplicated skill set from the parsed profile. */
export function profileSkillSet(profile: CandidateProfile | null | undefined): string[] {
  if (!profile) return [];
  return Array.from(new Set([
    ...(profile.primarySkills || []),
    ...(profile.skills || []).flatMap((c) => c.items || []),
  ].filter(Boolean).map((s) => String(s).trim()))).filter(Boolean);
}

export interface JdAnalyzeInput {
  jobDescription?: string;
  url?: string;
  title?: string;
  company?: string;
  location?: string;
}

export async function analyzeJobDescription(
  input: JdAnalyzeInput,
  profile: CandidateProfile | null | undefined,
): Promise<{ analysis: JdAnalysis; draft: Omit<JobPosting, 'id' | 'userId' | 'discoveredAt'> }> {
  const notes: string[] = [];
  let text = stripHtml(String(input.jobDescription || '')).slice(0, MAX_JD_CHARS);
  if (text.trim().length < 30 && input.url) text = await fetchJdFromUrl(String(input.url), notes);
  if (text.trim().length < 30 && !notes.length) notes.push('Add the job description text (or a URL to it).');

  const profileSkills = profileSkillSet(profile);
  const hay = `${input.title || ''} ${text}`.toLowerCase();
  // Always-on deterministic overlap: profile skills literally present in the JD.
  const matchedSkills = profileSkills.filter((s) => hay.includes(s.toLowerCase()));

  const parsed = text.trim().length >= 30 ? await parseJobDescriptionWithGemini(text).catch(() => null) : null;
  const extractionSource: JdAnalysis['extractionSource'] = parsed ? 'ai' : 'deterministic';
  if (text.trim().length >= 30 && !parsed && geminiConfigured()) {
    notes.push('AI extraction unavailable — used direct keyword matching only.');
  } else if (text.trim().length >= 30 && !parsed && !geminiConfigured()) {
    notes.push('Direct keyword matching (no AI key configured).');
  }

  // AI mode: also report required skills the profile lacks (the actionable gap).
  const missingSkills = parsed
    ? parsed.requiredSkills.filter((r) => !profileSkills.some((p) => p.toLowerCase() === r.toLowerCase()))
    : [];

  const title = String(input.title || parsed?.title || 'Pasted job').slice(0, 140) || 'Pasted job';
  const company = String(input.company || parsed?.company || 'Unknown company').slice(0, 100) || 'Unknown company';
  const location = String(input.location || parsed?.location || 'Not specified').slice(0, 140) || 'Not specified';

  // Same scale as live-board matches — one number, one meaning everywhere
  // (scoreBoardJob's convention: 35 + 11 per matching skill, capped at 92).
  const matchScore = Math.min(92, 35 + matchedSkills.length * 11);

  const analysis: JdAnalysis = {
    matchedSkills,
    missingSkills,
    matchScore,
    fitRationale: parsed
      ? `AI-parsed posting — ${matchedSkills.length} of your skills appear in it${parsed.requiredSkills.length ? `, ${missingSkills.length} stated requirement(s) not in your profile` : ''}.`
      : `Direct keyword match — ${matchedSkills.length} of your skills appear in the posting text.`,
    minYearsExperience: parsed?.minYearsExperience ?? null,
    extractionSource,
    notes,
  };

  const draft: Omit<JobPosting, 'id' | 'userId' | 'discoveredAt'> = {
    title,
    company,
    location,
    remoteType: parsed?.remoteType ?? remoteTypeOf(location),
    employmentType: parsed?.employmentType ?? 'Full-time',
    salaryRange: '',
    source: 'Company Direct',
    sourceUrl: String(input.url || ''),
    portalType: 'direct',
    description: clampDescription(text),
    requiredSkills: parsed?.requiredSkills ?? [],
    matchScore,
    matchingSkills: matchedSkills,
    missingSkills,
    fitRationale: analysis.fitRationale,
    status: 'discovered',
    postedDate: new Date().toISOString(),
    postedDaysAgo: 1,
    isStale: false,
    isConflictOfInterest: false, // POST /jobs recomputes this from the profile's exclusion list
  };

  return { analysis, draft };
}
