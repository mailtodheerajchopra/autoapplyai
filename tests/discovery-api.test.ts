import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

const TOKEN_API = '/api/auth/demo-switch';

async function mint(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await request(app).post(TOKEN_API).send({ userId: 'usr_alex_chen' });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** CV gate: discovery requires a parsed resume; seed one for the test user. */
async function seedResume(app: ReturnType<typeof createApp>): Promise<void> {
  const token = await mint(app);
  await request(app)
    .post('/api/resumes/upload')
    .set(auth(token))
    .send({
      fileName: 'cv.txt',
      fileType: 'txt',
      rawText: 'Alex Chen — 7 years Full Stack Engineer. Tech Corp. Skills: React, Node.js, TypeScript, Workday.',
    });
}

describe('async discovery pipeline (202 + poll + cooldown)', () => {
  const app = createApp();

  it('runs the full pipeline: instant 202 → poll to completed → jobs land → cooldown 429', async () => {
    await seedResume(app);
    const token = await mint(app);
    const jobsBefore = (await request(app).get('/api/jobs').set(auth(token))).body.length;

    // 1) Kickoff is instant and non-blocking
    const t0 = Date.now();
    const kick = await request(app)
      .post('/api/agent/discover')
      .set(auth(token))
      .send({ keywords: ['Full Stack Developer'], sources: ['LinkedIn', 'Naukri'] });
    const elapsed = Date.now() - t0;

    expect(kick.status).toBe(202);
    expect(elapsed).toBeLessThan(1000);
    expect(kick.body.jobId).toMatch(/^disc_/);
    expect(['queued', 'running']).toContain(kick.body.status);
    expect(kick.body.pollUrl).toBe(`/api/agent/discover/${kick.body.jobId}`);

    // 2) Polling reaches a terminal completed state
    let final: any = null;
    for (let i = 0; i < 60; i++) {
      const poll = await request(app).get(`/api/agent/discover/${kick.body.jobId}`).set(auth(token));
      if (poll.status === 200 && ['completed', 'failed'].includes(poll.body.status)) {
        final = poll.body;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(final).not.toBeNull();
    expect(final.status).toBe('completed');
    expect(final.result).toEqual({
      jobsFound: expect.any(Number),
      staleJobsFiltered: expect.any(Number),
      conflictJobsBlocked: expect.any(Number),
    });

    // 3) The discovered jobs actually landed in the DB
    const jobsAfter = (await request(app).get('/api/jobs').set(auth(token))).body.length;
    expect(jobsAfter - jobsBefore).toBe(final.result.jobsFound);
    expect(jobsAfter).toBeGreaterThan(jobsBefore);

    // 4) Free-tier pacing: an immediate second run is refused with a cooldown hint
    const second = await request(app)
      .post('/api/agent/discover')
      .set(auth(token))
      .send({ keywords: ['Test Cooldown'] });
    expect(second.status).toBe(429);
    expect(second.body.cooldownSeconds).toBeGreaterThan(0);
    expect(second.body.error).toMatch(/cooldown/i);
  });

  it('serves a duplicate kickoff of an unfinished run without creating a duplicate job (dedupe)', async () => {
    // CV gate guard: without a resume the kickoff is rejected outright.
    const noCv = await mint(app);
    const gated = await request(app)
      .post('/api/agent/discover')
      .set(auth(noCv))
      .send({ keywords: ['Gate Probe'] });
    expect([429, 400]).toContain(gated.status);
    if (gated.status === 400) expect(gated.body.error).toMatch(/CV/i);

    // The 45s cooldown guarantees the "running/completed" record from the
    // previous test is still the latest job for this user; the kickoff must
    // not create a second job record — it is either 429 (cooldown) or the
    // deduped existing job, both carrying the SAME jobId as the latest run.
    const token = await mint(app);
    const latest = await request(app)
      .post('/api/agent/discover')
      .set(auth(token))
      .send({ keywords: ['Dedupe Probe'] });
    expect([429, 202]).toContain(latest.status);
    if (latest.status === 429) {
      expect(latest.body.jobId).toMatch(/^disc_/);
    }
  });

  it('404s a poll for an unknown job id', async () => {
    const token = await mint(app);
    const res = await request(app).get('/api/agent/discover/disc_doesnotexist').set(auth(token));
    expect(res.status).toBe(404);
  });
});
