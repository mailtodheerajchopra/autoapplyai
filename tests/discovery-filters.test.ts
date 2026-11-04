import { describe, it, expect } from 'vitest';
import { filterConflictJobs, filterStaleJobs, excludedEmployers, adaptPoolJobsForUser, poolKeyOf, filterLocationJobs, filterExperienceJobs, mergePoolJobs } from '../server/discovery.js';
import type { CandidateProfile } from '../server/types.js';

const mkProfile = (over: Partial<CandidateProfile> = {}): CandidateProfile => ({
  id: 'p1', userId: 'u1', fullName: 'T', email: '', phone: '',
  location: 'US', headline: '', summary: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '',
  currentEmployer: '', excludedEmployers: [], skills: [], primarySkills: [],
  workdayPreferences: {} as CandidateProfile['workdayPreferences'],
  targetRoles: [], targetLocations: [], yearsOfExperience: 5, updatedAt: new Date().toISOString(),
  ...over,
});

describe('DiscoveryPool — user-side serve filters', () => {
  const entry = (jobs: any[], fetchedAt: string) => ({ jobs, fetchedAt });

  it('ages postings by pool age and drops those crossing 45d', () => {
    const fetchedAt = new Date(Date.now() - 2 * 86_400_000).toISOString(); // 2 days ago
    const adapted = adaptPoolJobsForUser(
      entry([
        { company: 'Fresh Co', matchScore: 90, postedDaysAgo: 10 },
        { company: 'Borderline', matchScore: 80, postedDaysAgo: 44 },
      ], fetchedAt),
      mkProfile(),
      {},
    );
    expect(adapted).not.toBeNull();
    expect(adapted!.jobs.map((j) => j.company)).toEqual(['Fresh Co']); // 44+2=46 → stale
    expect(adapted!.droppedStale).toBe(1);
  });

  it('applies the CURRENT user conflict shield, not the originating profile', () => {
    const j = adaptPoolJobsForUser(
      entry([
        { company: 'My Current Employer Inc', matchScore: 95, postedDaysAgo: 3 },
        { company: 'Other Corp', matchScore: 95, postedDaysAgo: 3 },
      ], new Date().toISOString()),
      mkProfile({ currentEmployer: 'My Current Employer Inc', excludedEmployers: [] }),
      {},
    );
    expect(j!.jobs.map((x) => x.company)).toEqual(['Other Corp']);
    expect(j!.droppedConflict).toBe(1);
  });

  it('honours minMatchScore', () => {
    const j = adaptPoolJobsForUser(
      entry([
        { company: 'A', matchScore: 70, postedDaysAgo: 3 },
        { company: 'B', matchScore: 95, postedDaysAgo: 3 },
      ], new Date().toISOString()),
      mkProfile(),
      { minMatchScore: 90 },
    );
    expect(j!.jobs.map((x) => x.company)).toEqual(['B']);
  });

  it('returns null when nothing survives, so the caller can run fresh', () => {
    const j = adaptPoolJobsForUser(
      entry([{ company: 'Old', matchScore: 10, postedDaysAgo: 400 }], new Date().toISOString()),
      mkProfile(),
      {},
    );
    expect(j).toBeNull();
  });
});

describe('DiscoveryPool — shared fingerprint', () => {
  it('is identical for different users with the same skills/filters', () => {
    const a = poolKeyOf(mkProfile({ userId: 'u1', updatedAt: '2020-01-01' }), { keywords: ['react'] });
    const b = poolKeyOf(mkProfile({ userId: 'u2', updatedAt: '2030-06-01' }), { keywords: ['react'] });
    expect(a).toBe(b);
  });

  it('differs when skills or filters differ', () => {
    const a = poolKeyOf(mkProfile({ primarySkills: ['react'] }), {});
    const b = poolKeyOf(mkProfile({ primarySkills: ['go'] }), {});
    const c = poolKeyOf(mkProfile(), { keywords: ['devops'] });
    expect(a).not.toBe(b);
    expect(poolKeyOf(mkProfile(), {})).not.toBe(c);
  });
});

describe('Incremental daily sweep — mergePoolJobs', () => {
  const now = new Date().toISOString();
  const job = (company: string, title: string, postedDaysAgo: number, jobFetchedAt?: string) => ({
    company, title, postedDaysAgo, jobFetchedAt, matchScore: 90,
  });

  it('folds fresh postings INTO history without losing the old ones', () => {
    const history = [job('Adobe', 'Staff SWE', 30, now)];
    const fresh = [job('Salesforce', 'Full Stack Eng', 1)];
    const merged = mergePoolJobs(history, fresh, now);
    expect(merged).toHaveLength(2);
    // sort order is posting age (asc): fresh wins the top slot
    expect(merged.map((j) => j.company)).toEqual(['Salesforce', 'Adobe']);
  });

  it('a collision (same company+title) is replaced by the fresh copy', () => {
    const history = [job('Adobe', 'Staff SWE', 30, now)];
    const fresh = [job('  adobe ', 'Staff   SWE', 1)]; // case/space-insensitive key
    const merged = mergePoolJobs(history, fresh, now);
    expect(merged).toHaveLength(1);
    expect(merged[0].postedDaysAgo).toBe(1);
    expect(merged[0].jobFetchedAt).toBe(now);
  });

  it('caps history at 60 postings, keeping the freshest', () => {
    const history = Array.from({ length: 70 }, (_, i) => job(`Co${i}`, 'T', 40 - Math.floor(i / 2), now));
    const merged = mergePoolJobs(history, [], now);
    expect(merged).toHaveLength(60);
    // the freshest half of the batch survived (ages 6..35), the aged tail is gone
    expect(Math.max(...merged.map((j) => j.postedDaysAgo as number))).toBeLessThanOrEqual(35);
    expect(Math.min(...merged.map((j) => j.postedDaysAgo as number))).toBe(6);
  });

  it('prunes postings that are effectively beyond 60 days old', () => {
    const longAgo = new Date(Date.now() - 50 * 86_400_000).toISOString();
    const history = [
      job('Old Co', 'Aged Job', 20, longAgo),      // 50 + 20 = 70 days → pruned
      job('New Co', 'Fresh Job', 30, now),          // 0 + 30 = 30 days → kept
    ];
    const merged = mergePoolJobs(history, [], now);
    expect(merged.map((j) => j.company)).toEqual(['New Co']);
  });
});

describe('Enforce 4 — experience-demand filter', () => {
  const mkJob = (title: string, description: string) => ({ title, description, company: 'Co', postedDaysAgo: 2 });

  it('hides postings demanding far more experience than the candidate has', () => {
    const { kept, dropped } = filterExperienceJobs([mkJob('SWE', 'Requires 10+ years of experience.')], 3);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('keeps postings within a 2-year tolerance', () => {
    const { kept } = filterExperienceJobs([mkJob('SWE', 'Requires 5+ years of experience.')], 3);
    expect(kept).toHaveLength(1);
  });

  it('hides internships for established professionals', () => {
    const { kept, dropped } = filterExperienceJobs(
      [mkJob('Engineering Intern', 'Great learning opportunity!')],
      5,
    );
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('hides seniority titles above the candidate (Staff/Principal/Director)', () => {
    const { dropped } = filterExperienceJobs(
      [mkJob('Staff Engineer', 'Build things.'), mkJob('Principal Engineer', 'Build things.'), mkJob('Director of Engineering', 'Lead things.')],
      2,
    );
    expect(dropped).toBe(3);
  });

  it('keeps ordinary postings with no experience signal', () => {
    const { kept, dropped } = filterExperienceJobs([mkJob('Full Stack Developer', 'Build React and Node apps.')], 1);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(0);
  });
});

describe('Enforce 1 — STRICT 45-DAY freshness filter', () => {
  const jobs = (days: (number | undefined)[]) =>
    days.map((postedDaysAgo) => ({ title: 'Job', company: 'Co', postedDaysAgo }));

  it('drops postings older than 45 days', () => {
    const kept = filterStaleJobs(jobs([46, 60, 451]));
    expect(kept).toHaveLength(0);
  });

  it('keeps the 45-day boundary (inclusive)', () => {
    const kept = filterStaleJobs(jobs([45, 44, 1]));
    expect(kept).toHaveLength(3);
  });

  it('treats unknown age as fresh (defaults to 10 days)', () => {
    const kept = filterStaleJobs([{ title: 'Job', company: 'Co', postedDaysAgo: undefined }]);
    expect(kept).toHaveLength(1);
  });

  it('keeps fresh and drops stale in a mixed batch', () => {
    const kept = filterStaleJobs(jobs([10, 100, 30, 90]));
    expect(kept.map((j) => j.postedDaysAgo)).toEqual([10, 30]);
  });
});

describe('Enforce 3 — STRICT preferred-location filter', () => {
  const mkJob = (location: string, remoteType = 'On-site') => ({ title: 'Job', location, remoteType });

  it('blocks same-role on-site US postings for an India candidate', () => {
    const { kept } = filterLocationJobs(
      [mkJob('San Francisco, CA'), mkJob('New York, NY')],
      'Bengaluru, India',
    );
    expect(kept).toHaveLength(0);
  });

  it('keeps country-agnostic Remote postings for any profile', () => {
    const { kept } = filterLocationJobs(
      [mkJob('Remote', 'Remote'), mkJob('Remote - Global', 'Remote')],
      'Bengaluru, India',
    );
    expect(kept).toHaveLength(2);
  });

  it('drops remote postings that name a different country ("Remote, US") for an India candidate', () => {
    const { kept, dropped } = filterLocationJobs(
      [mkJob('Remote, US', 'Remote'), mkJob('Remote - US', 'Remote'), mkJob('Remote, India', 'Remote')],
      'Bengaluru, India',
    );
    expect(kept.map((j) => j.location)).toEqual(['Remote, India']);
    expect(dropped).toBe(2);
  });

  it('an explicit target location rescues a country-named remote posting', () => {
    const { kept } = filterLocationJobs(
      [mkJob('Remote, US', 'Remote')],
      'Bengaluru, India',
      ['US', 'Remote'],
    );
    expect(kept).toHaveLength(1);
  });

  it('never over-filters remote postings when the profile country is unknown', () => {
    const { kept } = filterLocationJobs(
      [mkJob('Remote, US', 'Remote')],
      '',
    );
    expect(kept).toHaveLength(1);
  });

  it('keeps on-site postings in the candidate\'s own country (cross-state OK in US)', () => {
    const { kept } = filterLocationJobs(
      [mkJob('San Francisco, CA'), mkJob('Bengaluru, India'), mkJob('London, United Kingdom')],
      'New York, NY',
    );
    expect(kept.map((j) => j.location)).toEqual(['San Francisco, CA']);
  });

  it('honours configured targetLocations even across countries', () => {
    const { kept } = filterLocationJobs(
      [mkJob('London, United Kingdom'), mkJob('Dubai, UAE')],
      'Bengaluru, India',
      ['London', 'Remote'],
    );
    expect(kept.map((j) => j.location)).toEqual(['London, United Kingdom']);
  });

  it('never over-filters when no location signal exists', () => {
    const { kept } = filterLocationJobs([mkJob('Some City')], '', []);
    expect(kept).toHaveLength(1);
  });
});

describe('Enforce 2 — STRICT current/last employer conflict filter', () => {
  const company = (name: string) => ({ title: 'Job', company: name });

  it('drops postings from the current employer', () => {
    const kept = filterConflictJobs(
      [company('HyperScale Cloud Tech'), company('Stripe')],
      excludedEmployers({ currentEmployer: 'HyperScale Cloud Tech', excludedEmployers: [] })
    );
    expect(kept.map((j) => j.company)).toEqual(['Stripe']);
  });

  it('matches case-insensitively and as a substring of the company name', () => {
    const kept = filterConflictJobs(
      [company('HyperScale Cloud Tech Ltd. hyp'), company('HYPerscale Cloud Tech'), company('Stripe')],
      excludedEmployers({ currentEmployer: 'HyperScale Cloud Tech', excludedEmployers: [] })
    );
    // Substring semantics: "HYPerscale Cloud Tech" is caught, but a
    // word-overlap-only name like "hyperscale startups" is NOT (that
    // requires list-level exclusion by the user).
    expect(kept.map((j) => j.company)).toEqual(['Stripe']);
  });

  it('honours user-configured exclusions in addition to the current employer', () => {
    const kept = filterConflictJobs(
      [company('Adobe'), company('Mega Corp'), company('Stripe')],
      excludedEmployers({ currentEmployer: 'HyperScale Cloud Tech', excludedEmployers: ['Adobe', 'Mega Corp'] })
    );
    expect(kept.map((j) => j.company)).toEqual(['Stripe']);
  });

  it('drops nothing when the profile has no exclusions', () => {
    const all = [company('Stripe'), company('Infosys Digital')];
    const kept = filterConflictJobs(all, excludedEmployers({ currentEmployer: undefined, excludedEmployers: [] }));
    expect(kept).toHaveLength(2);
  });
});
