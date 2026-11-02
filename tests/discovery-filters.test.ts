import { describe, it, expect } from 'vitest';
import { filterConflictJobs, filterStaleJobs, excludedEmployers } from '../server/discovery.js';

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
