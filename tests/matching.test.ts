import { describe, it, expect } from 'vitest';
import { extractJobRequirements, scoreCandidate, normalizeSkills } from '../server/matching.js';

describe('matching (Milestone 4)', () => {
  it('extracts requirements from job', () => {
    const r = extractJobRequirements({ skillsRequired: ['Java', 'Spring Boot'], minExperience: 5, maxExperience: 10 });
    expect(r.skills).toEqual(['Java', 'Spring Boot']);
    expect(r.minExperience).toBe(5);
  });

  it('scores candidate with matching and missing skills', () => {
    const job = extractJobRequirements({ skillsRequired: ['Java', 'Spring Boot', 'Kafka'], minExperience: 5, maxExperience: 10 });
    const res = scoreCandidate({ skills: ['Java', 'Spring Boot', 'AWS'], experienceYears: 7, preferredLocations: ['Remote'] }, job);
    expect(res.matchingSkills).toContain('java');
    expect(res.matchingSkills).toContain('spring boot');
    expect(res.missingSkills).toContain('kafka');
    expect(res.experienceCompatibility).toBe('compatible');
    expect(res.matchScore).toBeGreaterThan(50);
    expect(res.summary).toContain('Overall match');
  });

  it('flags below minimum experience', () => {
    const job = extractJobRequirements({ skillsRequired: ['Java'], minExperience: 10, maxExperience: 15 });
    const res = scoreCandidate({ skills: ['Java'], experienceYears: 3 }, job);
    expect(res.experienceCompatibility).toBe('below_minimum');
  });

  it('does not invent skills', () => {
    const job = extractJobRequirements({ skillsRequired: ['Java', 'Kafka'], minExperience: 0 });
    const res = scoreCandidate({ skills: ['Java'], experienceYears: 5 }, job);
    expect(res.matchingSkills).toEqual(['java']);
    expect(res.missingSkills).toEqual(['kafka']);
  });

  it('normalizes skills', () => {
    expect(normalizeSkills([' Java ', '', 'Java'])).toEqual(['Java']);
  });
});
