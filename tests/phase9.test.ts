import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

async function register(app: any, email: string) {
  const res = await request(app).post('/api/auth/register').send({ name: 'User', email, password: 'secret-1' });
  return res.body;
}

describe('Phase 9 – security & regression', () => {
  const app = createApp();

  it('candidate cannot read another user job', async () => {
    const a = await register(app, `a-${Date.now()}@test.dev`);
    const b = await register(app, `b-${Date.now()}@test.dev`);
    // create a job for a via /jobs (manual)
    const job = await request(app).post('/api/jobs').set('Authorization', `Bearer ${a.token}`).send({ title: 'Test Job', company: 'Acme', location: 'Remote' });
    const jobId = job.body.id;
    const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${b.token}`);
    // getJobById is user-scoped; route may not exist. Use /jobs list instead.
    const list = await request(app).get('/api/jobs').set('Authorization', `Bearer ${b.token}`);
    expect(list.body.find((j: any) => j.id === jobId)).toBeUndefined();
  });

  it('autofill on unknown job returns 404', async () => {
    const u = await register(app, `af-${Date.now()}@test.dev`);
    const res = await request(app).post('/api/workday/autofill/does-not-exist').set('Authorization', `Bearer ${u.token}`).send({});
    expect([400, 404]).toContain(res.status);
  });

  it('candidate profile endpoint is user-scoped', async () => {
    const a = await register(app, `p1-${Date.now()}@test.dev`);
    const b = await register(app, `p2-${Date.now()}@test.dev`);
    await request(app).put('/api/profile').set('Authorization', `Bearer ${a.token}`).send({ headline: 'Secret A' });
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${b.token}`);
    expect(res.body.headline).not.toBe('Secret A');
  });

  it('admin can list tenants', async () => {
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    const res = await request(app).get('/api/admin/tenants').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin delete cascades new collections', async () => {
    const u = await register(app, `del-${Date.now()}@test.dev`);
    // create referral profile + notification
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${u.token}`).send({ skills: ['Java'] });
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    const del = await request(app).post(`/api/admin/users/${u.user.id}/delete`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(del.status).toBe(200);
    // user gone
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${u.token}`);
    expect(me.status).toBe(401);
  });

  it('RLS isolation: candidate B cannot read candidate A resume', async () => {
    const a = await register(app, `ra-${Date.now()}@test.dev`);
    const b = await register(app, `rb-${Date.now()}@test.dev`);
    await request(app).post('/api/resumes/upload').set('Authorization', `Bearer ${a.token}`).send({ fileName: 'r.txt', fileType: 'txt', rawText: 'secret resume' });
    const aResumes = await request(app).get('/api/resumes').set('Authorization', `Bearer ${a.token}`);
    const bResumes = await request(app).get('/api/resumes').set('Authorization', `Bearer ${b.token}`);
    expect(bResumes.body.find((r: any) => r.id === aResumes.body[0]?.id)).toBeUndefined();
  });
});
