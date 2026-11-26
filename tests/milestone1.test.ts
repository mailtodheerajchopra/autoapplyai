import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

describe('Milestone 1 – roles & profiles', () => {
  const app = createApp();

  it('registers a candidate by default', async () => {
    const email = `cand-${Date.now()}@test.dev`;
    const res = await request(app).post('/api/auth/register').send({ name: 'Cand', email, password: 'secret-1' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('candidate');
  });

  it('registers an employee (unverified affiliation)', async () => {
    const email = `emp-${Date.now()}@test.dev`;
    const res = await request(app).post('/api/auth/register').send({ name: 'Emp', email, password: 'secret-1', roleIntent: 'employee' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('employee');
    const prof = await request(app).get('/api/employee/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(prof.status).toBe(200);
    expect(prof.body.affiliationStatus).toBe('unverified');
    expect(prof.body.emailVerified).toBe(false);
  });

  it('employee corporate email verification requires OTP and does not auto-verify affiliation', async () => {
    const email = `emp2-${Date.now()}@test.dev`;
    const reg = await request(app).post('/api/auth/register').send({ name: 'Emp2', email, password: 'secret-1', roleIntent: 'employee' });
    const token = reg.body.token;
    // set corporate email
    await request(app).put('/api/employee/me').set('Authorization', `Bearer ${token}`).send({ corporateEmail: email, company: 'Acme Corp' });
    const otpRes = await request(app).post('/api/employee/verify-corporate-email').set('Authorization', `Bearer ${token}`).send({});
    expect(otpRes.status).toBe(200);
    expect(otpRes.body.verificationCode).toBeDefined();
    const confirm = await request(app).post('/api/employee/verify-corporate-email/confirm').set('Authorization', `Bearer ${token}`).send({ code: otpRes.body.verificationCode });
    expect(confirm.status).toBe(200);
    expect(confirm.body.affiliationStatus).toBe('pending');
    const prof = await request(app).get('/api/employee/me').set('Authorization', `Bearer ${token}`);
    expect(prof.body.emailVerified).toBe(true);
    expect(prof.body.affiliationStatus).toBe('pending');
  });

  it('affiliation requires admin/verifier approval', async () => {
    const email = `emp3-${Date.now()}@test.dev`;
    const reg = await request(app).post('/api/auth/register').send({ name: 'Emp3', email, password: 'secret-1', roleIntent: 'employee' });
    const token = reg.body.token;
    await request(app).put('/api/employee/me').set('Authorization', `Bearer ${token}`).send({ corporateEmail: email, company: 'Acme Corp' });
    const otpRes = await request(app).post('/api/employee/verify-corporate-email').set('Authorization', `Bearer ${token}`).send({});
    await request(app).post('/api/employee/verify-corporate-email/confirm').set('Authorization', `Bearer ${token}`).send({ code: otpRes.body.verificationCode });

    // non-admin cannot verify
    const forbidden = await request(app).post(`/api/employee/${reg.body.user.id}/verify-affiliation`).set('Authorization', `Bearer ${token}`).send({});
    expect(forbidden.status).toBe(403);

    // admin (demo) can verify
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    const ok = await request(app).post(`/api/employee/${reg.body.user.id}/verify-affiliation`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.affiliationStatus).toBe('verified');
  });

  it('candidate referral profile CRUD + visibility validation', async () => {
    const email = `cand2-${Date.now()}@test.dev`;
    const reg = await request(app).post('/api/auth/register').send({ name: 'Cand2', email, password: 'secret-1' });
    const token = reg.body.token;
    const bad = await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${token}`).send({ visibility: 'nope' });
    expect(bad.status).toBe(400);
    const ok = await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${token}`).send({ visibility: 'anonymous', referralOptIn: true, skills: ['Java'] });
    expect(ok.status).toBe(200);
    expect(ok.body.visibility).toBe('anonymous');
    const get = await request(app).get('/api/referral/candidate-profile').set('Authorization', `Bearer ${token}`);
    expect(get.body.skills).toContain('Java');
  });

  it('profile isolation between users', async () => {
    const email1 = `iso1-${Date.now()}@test.dev`;
    const email2 = `iso2-${Date.now()}@test.dev`;
    const r1 = await request(app).post('/api/auth/register').send({ name: 'Iso1', email: email1, password: 'secret-1' });
    const r2 = await request(app).post('/api/auth/register').send({ name: 'Iso2', email: email2, password: 'secret-1' });
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${r1.body.token}`).send({ currentEmployer: 'SecretCo' });
    const view = await request(app).get('/api/referral/candidate-profile').set('Authorization', `Bearer ${r2.body.token}`);
    expect(view.body).toBeNull();
  });
});
