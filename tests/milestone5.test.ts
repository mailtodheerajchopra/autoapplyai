import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

async function register(app: any, email: string, roleIntent?: string) {
  const res = await request(app).post('/api/auth/register').send({ name: 'User', email, password: 'secret-1', roleIntent });
  return res.body;
}

describe('Milestone 5 – analytics & hardening', () => {
  const app = createApp();

  it('admin can access referral analytics', async () => {
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    const res = await request(app).get('/api/admin/analytics/referrals').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCandidates');
    expect(res.body).toHaveProperty('verifiedEmployees');
    expect(res.body).toHaveProperty('activeReferralJobs');
    expect(res.body).toHaveProperty('mostActiveCompanies');
  });

  it('non-admin cannot access referral analytics', async () => {
    const u = await register(app, `m5-${Date.now()}@test.dev`);
    const res = await request(app).get('/api/admin/analytics/referrals').set('Authorization', `Bearer ${u.token}`);
    expect(res.status).toBe(403);
  });

  it('admin can run cleanup', async () => {
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    const res = await request(app).post('/api/admin/cleanup').set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('removedDocuments');
  });

  it('registration validates email', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: 'secret-1' });
    expect(res.status).toBe(400);
  });

  it('recruiter role can search candidates', async () => {
    const rec = await register(app, `rec-${Date.now()}@test.dev`, 'recruiter');
    const res = await request(app).get('/api/referral/candidates/search').set('Authorization', `Bearer ${rec.token}`);
    expect(res.status).toBe(200);
  });

  it('candidate cannot search candidates', async () => {
    const cand = await register(app, `cand-${Date.now()}@test.dev`);
    const res = await request(app).get('/api/referral/candidates/search').set('Authorization', `Bearer ${cand.token}`);
    expect(res.status).toBe(403);
  });
});
