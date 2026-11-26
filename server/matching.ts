/**
 * Pure, deterministic candidate-to-referral-job matching.
 *
 * This module is intentionally free of DB/AI side effects so it can be unit
 * tested in isolation. AI may be used upstream to *extract* skills from a job
 * description, but scoring here is always computed from real profile data and
 * never invents skills or experience.
 */

export interface JobRequirements {
  skills: string[];
  minExperience: number;
  maxExperience: number;
}

export interface CandidateFacts {
  skills: string[];
  experienceYears: number;
  preferredLocations?: string[];
}

export interface MatchResult {
  matchScore: number; // 0-100
  matchingSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
  experienceCompatibility: 'compatible' | 'below_minimum' | 'above_maximum' | 'unknown';
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  summary: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export function normalizeSkills(skills: string[] | undefined | null): string[] {
  if (!Array.isArray(skills)) return [];
  return Array.from(new Set(skills.map((s) => String(s).trim()).filter(Boolean)));
}

export function extractJobRequirements(job: {
  skillsRequired?: string[];
  minExperience?: number;
  maxExperience?: number;
  description?: string;
}): JobRequirements {
  // Prefer explicitly provided skills; fall back to a light keyword scan of
  // the description so a posting without skillsRequired still yields signal.
  let skills = normalizeSkills(job.skillsRequired);
  if (skills.length === 0 && job.description) {
    // naive: pull capitalized tech-ish tokens; kept conservative
    const tokens = String(job.description).match(/\b[A-Z][A-Za-z0-9.+#-]{1,}\b/g) || [];
    skills = normalizeSkills(tokens).slice(0, 12);
  }
  return {
    skills,
    minExperience: typeof job.minExperience === 'number' ? job.minExperience : 0,
    maxExperience: typeof job.maxExperience === 'number' ? job.maxExperience : 0,
  };
}

export function scoreCandidate(candidate: CandidateFacts, job: JobRequirements): MatchResult {
  const candidateSkills = new Set(normalizeSkills(candidate.skills).map(norm));
  const jobSkills = normalizeSkills(job.skills).map(norm);

  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  const partialSkills: string[] = [];

  for (const s of jobSkills) {
    if (candidateSkills.has(s)) matchingSkills.push(s);
    else missingSkills.push(s);
  }
  // partial: candidate skills that are substrings of job skills or vice versa
  for (const cs of candidateSkills) {
    if (!jobSkills.includes(cs) && jobSkills.some((js) => js.includes(cs) || cs.includes(js))) {
      if (!partialSkills.includes(cs)) partialSkills.push(cs);
    }
  }

  const skillScore = jobSkills.length > 0 ? (matchingSkills.length / jobSkills.length) * 70 : 70;

  let experienceCompatibility: MatchResult['experienceCompatibility'] = 'unknown';
  let experienceScore = 0;
  const exp = typeof candidate.experienceYears === 'number' ? candidate.experienceYears : 0;
  if (job.minExperience === 0 && job.maxExperience === 0) {
    experienceCompatibility = 'compatible';
    experienceScore = 15;
  } else if (exp >= job.minExperience && (job.maxExperience === 0 || exp <= job.maxExperience)) {
    experienceCompatibility = 'compatible';
    experienceScore = 15;
  } else if (exp < job.minExperience) {
    experienceCompatibility = 'below_minimum';
    experienceScore = Math.max(0, 8 - (job.minExperience - exp) * 2);
  } else if (job.maxExperience > 0 && exp > job.maxExperience) {
    experienceCompatibility = 'above_maximum';
    experienceScore = 10;
  }

  // location: simple preference overlap
  let locationScore = 0;
  const prefs = (candidate.preferredLocations || []).map(norm);
  if (prefs.length === 0) locationScore = 10;
  else locationScore = 15; // assume compatible unless caller overrides; kept simple & explainable

  const matchScore = Math.round(Math.min(100, skillScore + experienceScore + locationScore));

  const summary = buildSummary(matchScore, matchingSkills, missingSkills, partialSkills, experienceCompatibility, exp, job);

  return {
    matchScore,
    matchingSkills,
    missingSkills,
    partialSkills,
    experienceCompatibility,
    skillScore: Math.round(skillScore),
    experienceScore,
    locationScore,
    summary,
  };
}

function buildSummary(
  matchScore: number,
  matchingSkills: string[],
  missingSkills: string[],
  partialSkills: string[],
  experienceCompatibility: string,
  exp: number,
  job: JobRequirements,
): string {
  const parts: string[] = [];
  parts.push(`Overall match ${matchScore}%.`);
  if (matchingSkills.length) parts.push(`Matching skills: ${matchingSkills.join(', ')}.`);
  if (missingSkills.length) parts.push(`Missing skills: ${missingSkills.join(', ')}.`);
  if (partialSkills.length) parts.push(`Partial overlap: ${partialSkills.join(', ')}.`);
  const expText =
    experienceCompatibility === 'compatible'
      ? `Experience ${exp} years meets requirement (${job.minExperience}${job.maxExperience ? '-' + job.maxExperience : '+'}).`
      : experienceCompatibility === 'below_minimum'
      ? `Experience ${exp} years is below minimum ${job.minExperience}.`
      : experienceCompatibility === 'above_maximum'
      ? `Experience ${exp} years exceeds stated maximum ${job.maxExperience}.`
      : 'Experience requirement not specified.';
  parts.push(expText);
  return parts.join(' ');
}

export function explainMatch(candidate: CandidateFacts, job: JobRequirements): string {
  return scoreCandidate(candidate, job).summary;
}
