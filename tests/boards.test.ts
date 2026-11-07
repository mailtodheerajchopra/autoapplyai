import { describe, it, expect } from 'vitest';
import {
  parseBoardTargets, resolveDiscoveryTargets, stripHtml, clampDescription, daysSince,
  normalizeGreenhouseRow, normalizeLeverRow, normalizeAshbyRow,
  scanBoards, filterBoardJobsByKeywords, scoreBoardJob, WELL_KNOWN_BOARDS,
} from '../server/boards.js';
import type { BoardTarget } from '../server/boards.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');

describe('parseBoardTargets', () => {
  it('parses ats:slug prefixes', () => {
    const t = parseBoardTargets(['greenhouse:stripe', 'lever:palantir']);
    expect(t).toEqual([
      { ats: 'greenhouse', token: 'stripe', label: 'stripe (greenhouse)' },
      { ats: 'lever', token: 'palantir', label: 'palantir (lever)' },
    ]);
  });

  it('parses board URLs including the legacy greenhouse host', () => {
    const t = parseBoardTargets([
      'https://job-boards.greenhouse.io/anthropic/jobs/123',
      'https://jobs.lever.co/palantir',
      'https://jobs.ashbyhq.com/ramp',
    ]);
    expect(t.map((x) => `${x.ats}:${x.token}`)).toEqual(['greenhouse:anthropic', 'lever:palantir', 'ashby:ramp']);
  });

  it('resolves known bare slugs and marks unknown ones for probing', () => {
    const t = parseBoardTargets(['stripe', 'acmecorp']);
    expect(t.find((x) => x.token === 'stripe')?.ats).toBe('greenhouse');
    expect(t.find((x) => x.token === 'acmecorp')?.ats).toBe('probe');
  });

  it('dedupes identical targets from mixed input', () => {
    const t = parseBoardTargets(['stripe', 'https://boards.greenhouse.io/stripe', 'greenhouse:stripe']);
    expect(t).toHaveLength(1);
  });

  it('discovery resolver never turns role keywords into probes', () => {
    const t = resolveDiscoveryTargets({ keywords: ['backend engineer', 'stripe'], companies: [] });
    expect(t).toEqual([{ ...WELL_KNOWN_BOARDS['stripe'] }]);
    const withCompanies = resolveDiscoveryTargets({ keywords: [], companies: ['acme'] });
    expect(withCompanies).toEqual([{ ats: 'probe', token: 'acme', label: 'acme (probe)' }]);
  });
});

describe('text helpers', () => {
  it('unescapes then strips ATS HTML-escaped descriptions', () => {
    expect(stripHtml('&lt;p&gt;Build &amp; ship&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Rust&lt;/li&gt;&lt;/ul&gt;'))
      .toBe('Build & ship\n• Rust');
  });

  it('clamps long descriptions on a word boundary', () => {
    const long = 'word '.repeat(500).trim();
    const clamped = clampDescription(long);
    expect(clamped.length).toBeLessThan(1510);
    expect(clamped.endsWith('…')).toBe(true);
  });

  it('maps ISO and epoch-ms dates to whole days', () => {
    expect(daysSince('2026-11-06T12:00:00Z', NOW)).toBe(1);
    expect(daysSince(NOW - 3 * 86_400_000 - 3_600_000, NOW)).toBe(3);
    expect(daysSince('garbage', NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
  });
});

describe('normalizeGreenhouseRow', () => {
  const row = {
    id: 5456619008,
    title: 'Software Engineer, Storage',
    absolute_url: 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008',
    location: { name: 'San Francisco, CA | Seattle, WA' },
    company_name: 'Anthropic',
    first_published: '2026-10-28T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    content: '&lt;p&gt;You will architect distributed systems&lt;/p&gt;',
  };

  it('uses company_name, first_published age, and decoded content', () => {
    const j = normalizeGreenhouseRow(row, 'anthropic', NOW)!;
    expect(j.company).toBe('Anthropic');
    expect(j.title).toBe('Software Engineer, Storage');
    expect(j.postedDaysAgo).toBe(10); // 2026-10-28 → 2026-11-07
    expect(j.sourceUrl).toContain('/anthropic/jobs/5456619008');
    expect(j.description).toBe('You will architect distributed systems');
    expect(j.dedupeKey).toBe('greenhouse:anthropic:5456619008');
    expect(j.remoteType).toBe('On-site');
  });

  it('flags Remote from the location text and survives a missing date', () => {
    const j = normalizeGreenhouseRow({ ...row, location: { name: 'Remote, US' }, first_published: '', updated_at: '' }, 'anthropic', NOW)!;
    expect(j.remoteType).toBe('Remote');
    expect(j.postedDaysAgo).toBe(10); // unknown age follows the pool convention
  });

  it('returns null for blank rows', () => {
    expect(normalizeGreenhouseRow(null, 'x', NOW)).toBeNull();
    expect(normalizeGreenhouseRow({ id: 1 }, 'x', NOW)).toBeNull();
  });
});

describe('normalizeLeverRow', () => {
  const row = {
    id: 'abc-123',
    text: 'Senior Backend Engineer',
    createdAt: NOW - 5 * 86_400_000, // epoch MILLISECONDS
    categories: { location: 'London, UK', team: 'Payments', commitment: 'Full-time' },
    workplaceType: 'Remote',
    hostedUrl: 'https://jobs.lever.co/palantir/abc-123',
    descriptionPlain: 'Build things. 5+ years experience.',
  };

  it('maps epoch-ms createdAt, commitment and workplace type', () => {
    const j = normalizeLeverRow(row, 'palantir', NOW)!;
    expect(j.postedDaysAgo).toBe(5);
    expect(j.employmentType).toBe('Full-time');
    expect(j.location).toContain('London, UK');
    expect(j.remoteType).toBe('Remote');
    expect(j.dedupeKey).toBe('lever:palantir:abc-123');
  });

  it('reads contract commitments', () => {
    const j = normalizeLeverRow({ ...row, categories: { ...row.categories, commitment: 'Contractor' } }, 'palantir', NOW)!;
    expect(j.employmentType).toBe('Contract');
  });
});

describe('normalizeAshbyRow', () => {
  const row = {
    id: '34413f8d',
    title: 'Security Engineer, Cloud',
    location: 'New York, NY (HQ)',
    isRemote: true,
    publishedAt: '2026-11-01T17:12:35.753+00:00',
    jobUrl: 'https://jobs.ashbyhq.com/ramp/34413f8d',
    employmentType: 'FullTime',
    descriptionPlain: 'Secure the cloud.',
  };

  it('maps isRemote, publishedAt and FullTime', () => {
    const j = normalizeAshbyRow(row, 'ramp', NOW)!;
    expect(j.remoteType).toBe('Remote');
    expect(j.postedDaysAgo).toBe(5); // Nov 1 17:12Z → Nov 7 12:00Z = 5d 18h
    expect(j.employmentType).toBe('Full-time');
    expect(j.description).toBe('Secure the cloud.');
    expect(j.dedupeKey).toBe('ashby:ramp:34413f8d');
  });
});

// Minimal Response shim for the injected fetch — no network in tests.
const jsonResponse = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const ghTarget = (token: string): BoardTarget => ({ ats: 'greenhouse', token, label: `${token} (greenhouse)` });
const probeTarget = (token: string): BoardTarget => ({ ats: 'probe', token, label: `${token} (probe)` });

describe('scanBoards', () => {
  const ghBody = { meta: { total: 2 }, jobs: [
    { id: 1, title: 'Backend Engineer', absolute_url: 'u1', location: { name: 'Dublin, Ireland' }, company_name: 'Stripe', first_published: '2026-11-05T00:00:00Z', content: 'Go' },
    { id: 2, title: 'Infra Engineer', absolute_url: 'u2', location: { name: 'Remote, US' }, company_name: 'Stripe', first_published: '2026-11-06T00:00:00Z', content: 'Terraform' },
  ]};
  const leverBody = [{ id: 'l1', text: 'Backend Engineer', createdAt: NOW - 86_400_000, categories: { location: 'Dublin, Ireland' }, hostedUrl: 'u3', descriptionPlain: 'Go' }];

  it('collects rows, dedupes identical company+title across boards', async () => {
    // "stripe" (greenhouse) and a probe "palantir" whose greenhouse 404s but lever hits
    const impl = async (url: string) => {
      if (url.includes('boards-api.greenhouse.io/v1/boards/stripe')) return jsonResponse(200, ghBody);
      if (url.includes('boards-api.greenhouse.io/v1/boards/palantir')) return jsonResponse(404, {});
      if (url.includes('api.lever.co/v0/postings/palantir')) return jsonResponse(200, leverBody);
      throw new Error('unexpected ' + url);
    };
    const scan = await scanBoards([ghTarget('stripe'), probeTarget('palantir')], { fetchImpl: impl, nowMs: NOW });

    expect(scan.reports).toEqual([
      { target: 'stripe (greenhouse)', ats: 'greenhouse', status: 'ok', count: 2 },
      { target: 'palantir (probe)', ats: 'lever', status: 'ok', count: 1 },
    ]);
    // "Backend Engineer @ Stripe" (greenhouse) vs "Backend Engineer @ palantir"
    // — different companies, both kept; lever row aged 1 day.
    expect(scan.jobs).toHaveLength(3);
    const leverJob = scan.jobs.find((j) => j.ats === 'lever')!;
    expect(leverJob.company).toBe('palantir'); // falls back to the token (lever omits company_name)
    expect(leverJob.postedDaysAgo).toBe(1);
  });

  it('treats 404 as not_found (skip) and 5xx/timeout as error (skip) — never throws', async () => {
    const impl = async (url: string) => {
      if (url.includes('greenhouse')) return jsonResponse(404, {});
      if (url.includes('lever')) return jsonResponse(503, {});
      throw new Error('the network is gone');
    };
    const scan = await scanBoards([ghTarget('ghost'), { ats: 'lever', token: 'down', label: 'down (lever)' }, probeTarget('void')], { fetchImpl: impl, nowMs: NOW });
    expect(scan.jobs).toHaveLength(0);
    expect(scan.reports.every((r) => r.status === 'not_found' || r.status === 'error')).toBe(true);
  });

  it('caps rows per company, newest first survives via input order cap', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: i, title: `Role ${i}`, absolute_url: `u${i}`, location: { name: 'Remote' },
      company_name: 'Stripe', first_published: new Date(NOW - i * 86_400_000).toISOString(), content: '',
    }));
    const impl = async () => jsonResponse(200, { meta: { total: 40 }, jobs: many });
    const scan = await scanBoards([ghTarget('stripe')], { fetchImpl: impl, nowMs: NOW, maxPerCompany: 25 });
    expect(scan.jobs).toHaveLength(25);
  });
});

describe('keyword filter + scoring', () => {
  const jobs = [
    { ...normalizeAshbyRow({ id: '1', title: 'Security Engineer', location: 'NYC', isRemote: true, publishedAt: '2026-11-01T00:00:00Z', jobUrl: 'u', employmentType: 'FullTime', descriptionPlain: 'k8s cloud' }, 'ramp', NOW)! },
    { ...normalizeGreenhouseRow({ id: 2, title: 'Store Operations', absolute_url: 'u2', location: { name: 'SF' }, company_name: 'Stripe', first_published: '2026-11-02T00:00:00Z' }, 'stripe', NOW)! },
  ];

  it('matches multi-word keywords loosely across title/company', () => {
    const kept = filterBoardJobsByKeywords(jobs, ['security engineer']);
    expect(kept).toHaveLength(1);
    expect(filterBoardJobsByKeywords(jobs, []).length).toBe(2);
  });

  it('scores by skill overlap with title+description, capped', () => {
    const s = scoreBoardJob(jobs[0], { primarySkills: ['K8S', 'Cloud', 'COBOL'], skills: [{ items: ['Go'] }] });
    expect(s.matchingSkills.map((x) => x.toLowerCase())).toEqual(['k8s', 'cloud']);
    expect(s.matchScore).toBe(57); // 35 + 2 skill hits × 11
    expect(s.fitRationale).toContain('ashby'); // jobs[0] came from the Ashby normalizer
  });
});
