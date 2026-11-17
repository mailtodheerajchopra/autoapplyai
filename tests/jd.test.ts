import { describe, it, expect } from 'vitest';
import { analyzeJobDescription, profileSkillSet } from '../server/jd.js';
import type { CandidateProfile } from '../server/types.js';

// Deterministic tier only — no GEMINI_API_KEY in the test environment, so
// analyzeJobDescription must NEVER rely on AI being present.
const profile: CandidateProfile = {
  id: 'p1',
  userId: 'u1',
  fullName: 'Test Candidate',
  email: 't@example.com',
  phone: '',
  location: 'Bengaluru, India',
  headline: '',
  summary: '',
  linkedinUrl: '',
  githubUrl: '',
  portfolioUrl: '',
  currentEmployer: 'CurrentCo',
  excludedEmployers: [],
  skills: [
    { category: 'Backend', items: ['Java', 'Spring Boot', 'SQL'] },
    { category: 'Cloud', items: ['AWS', 'Kubernetes'] },
  ],
  primarySkills: ['Java', 'AWS'],
  workdayPreferences: {} as CandidateProfile['workdayPreferences'],
  targetRoles: [],
  targetLocations: [],
  yearsOfExperience: 6,
  updatedAt: new Date().toISOString(),
};

describe('profileSkillSet', () => {
  it('unions primary skills with category items, deduped', () => {
    const s = profileSkillSet(profile);
    expect(s.filter((x) => x === 'Java')).toHaveLength(1);
    expect(s).toEqual(expect.arrayContaining(['Java', 'AWS', 'Spring Boot', 'SQL', 'Kubernetes']));
  });

  it('tolerates a missing profile', () => {
    expect(profileSkillSet(null)).toEqual([]);
  });
});

describe('analyzeJobDescription (deterministic tier — no AI key)', () => {
  it('scores from real skill hits with the boards convention (35 + 11×hits, cap 92)', async () => {
    const jd = [
      'Senior Backend Engineer — Payments',
      'We need strong Java and Spring Boot experience, plus SQL and AWS.',
      'Kubernetes is a plus. 8+ years of experience required.',
    ].join('\n');
    const { analysis, draft } = await analyzeJobDescription({ jobDescription: jd }, profile);

    expect(analysis.extractionSource).toBe('deterministic');
    expect(analysis.matchedSkills.sort()).toEqual(['AWS', 'Java', 'Kubernetes', 'SQL', 'Spring Boot'].sort());
    expect(analysis.matchScore).toBe(90); // 35 + 5×11 — the 92 cap only bites at 6+ hits
    expect(draft.matchScore).toBe(analysis.matchScore);
    expect(draft.requiredSkills).toEqual([]); // no AI → no invented requirements
    expect(draft.portalType).toBe('direct');
    expect(draft.status).toBe('discovered');
    expect(draft.description).toContain('Senior Backend Engineer');
  });

  it('keeps going without a profile and reports the honest floor score', async () => {
    const { analysis } = await analyzeJobDescription({ jobDescription: 'Looking for a Java expert.' }, null);
    expect(analysis.matchedSkills).toEqual([]); // nothing to match against — no fake hits
    expect(analysis.matchScore).toBe(35); // the honest floor
    expect(analysis.extractionSource).toBe('deterministic');
  });

  it('flags empty input instead of pretending', async () => {
    const { analysis } = await analyzeJobDescription({}, profile);
    expect(analysis.matchedSkills).toEqual([]);
    expect(analysis.notes.join(' ')).toContain('Add the job description');
  });

  it('title/company/location fall back cleanly for the draft job', async () => {
    const { draft } = await analyzeJobDescription({ jobDescription: 'Java developer role. AWS team.' }, profile);
    expect(draft.title).toBe('Pasted job');
    expect(draft.company).toBe('Unknown company');
    expect(draft.location).toBe('Not specified');
  });
});
