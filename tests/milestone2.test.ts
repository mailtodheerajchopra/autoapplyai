import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

async function register(app: any, email: string, roleIntent?: string) {
  const res = await request(app).post('/api/auth/register').send({ name: 'User', email, password: 'secret-1', roleIntent });
  return res.body;
}

async function verifyEmployee(app: any, token: string, userId: string, email: string) {
  await request(app).put('/api/employee/me').set('Authorization', `Bearer ${token}`).send({ corporateEmail: email, company: 'Acme Corp' });
  const otp = await request(app).post('/api/employee/verify-corporate-email').set('Authorization', `Bearer ${token}`).send({});
  await request(app).post('/api/employee/verify-corporate-email/confirm').set('Authorization', `Bearer ${token}`).send({ code: otp.body.verificationCode });
  const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
  await request(app).post(`/api/employee/${userId}/verify-affiliation`).set('Authorization', `Bearer ${adminToken}`).send({});
  await request(app).post(`/api/admin/publishers/${userId}/approve`).set('Authorization', `Bearer ${adminToken}`).send({});
}

describe('Milestone 2 – referral marketplace', () => {
  const app = createApp();

  it('unapproved publisher cannot publish referral jobs', async () => {
    const emp = await register(app, `emp-${Date.now()}@test.dev`, 'employee');
    // publisher not approved -> create draft allowed, publish forbidden
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'] });
    expect(create.status).toBe(201);
    const publish = await request(app).post(`/api/referral/jobs/${create.body.id}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});
    expect(publish.status).toBe(403);
  });

  it('verified employee can create and publish a job', async () => {
    const emp = await register(app, `emp2-${Date.now()}@test.dev`, 'employee');
    await verifyEmployee(app, emp.token, emp.user.id, emp.user.email);
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'], availableSlots: 2 });
    expect(create.status).toBe(201);
    const jobId = create.body.id;
    const publish = await request(app).post(`/api/referral/jobs/${jobId}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});
    expect(publish.status).toBe(200);
    expect(['published', 'active']).toContain(publish.body.status);
  });

  it('candidate can request referral and duplicate is prevented', async () => {
    const emp = await register(app, `emp3-${Date.now()}@test.dev`, 'employee');
    await verifyEmployee(app, emp.token, emp.user.id, emp.user.email);
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'], availableSlots: 2 });
    const jobId = create.body.id;
    await request(app).post(`/api/referral/jobs/${jobId}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});

    const cand = await register(app, `cand-${Date.now()}@test.dev`, 'candidate');
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${cand.token}`).send({ skills: ['Java'], referralOptIn: true, submittedForReferral: true, visibility: 'anonymous' });

    const first = await request(app).post('/api/referral/requests').set('Authorization', `Bearer ${cand.token}`).send({ referralJobId: jobId, coverNote: 'hi' });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('requested');
    expect(first.body.matchScore).toBeGreaterThan(0);

    const dup = await request(app).post('/api/referral/requests').set('Authorization', `Bearer ${cand.token}`).send({ referralJobId: jobId });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/Duplicate/i);
  });

  it('employee can update referral request status and history is recorded', async () => {
    const emp = await register(app, `emp4-${Date.now()}@test.dev`, 'employee');
    await verifyEmployee(app, emp.token, emp.user.id, emp.user.email);
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'], availableSlots: 2 });
    const jobId = create.body.id;
    await request(app).post(`/api/referral/jobs/${jobId}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});

    const cand = await register(app, `cand2-${Date.now()}@test.dev`, 'candidate');
    const first = await request(app).post('/api/referral/requests').set('Authorization', `Bearer ${cand.token}`).send({ referralJobId: jobId });
    const reqId = first.body.id;

    const upd = await request(app).patch(`/api/referral/requests/${reqId}`).set('Authorization', `Bearer ${emp.token}`).send({ status: 'shortlisted' });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe('shortlisted');

    const hist = await request(app).get(`/api/referral/requests/${reqId}/history`).set('Authorization', `Bearer ${cand.token}`);
    expect(hist.status).toBe(200);
    expect(hist.body.length).toBeGreaterThanOrEqual(2);
  });

  it('candidate can withdraw request', async () => {
    const emp = await register(app, `emp5-${Date.now()}@test.dev`, 'employee');
    await verifyEmployee(app, emp.token, emp.user.id, emp.user.email);
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'], availableSlots: 2 });
    const jobId = create.body.id;
    await request(app).post(`/api/referral/jobs/${jobId}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});

    const cand = await register(app, `cand3-${Date.now()}@test.dev`, 'candidate');
    const first = await request(app).post('/api/referral/requests').set('Authorization', `Bearer ${cand.token}`).send({ referralJobId: jobId });
    const reqId = first.body.id;
    const w = await request(app).post(`/api/referral/requests/${reqId}/withdraw`).set('Authorization', `Bearer ${cand.token}`).send({});
    expect(w.status).toBe(200);
    expect(w.body.status).toBe('withdrawn');
  });

  it('notifications are created for referral request', async () => {
    const emp = await register(app, `emp6-${Date.now()}@test.dev`, 'employee');
    await verifyEmployee(app, emp.token, emp.user.id, emp.user.email);
    const create = await request(app).post('/api/referral/jobs').set('Authorization', `Bearer ${emp.token}`).send({ company: 'Acme', title: 'Engineer', skillsRequired: ['Java'], availableSlots: 2 });
    const jobId = create.body.id;
    await request(app).post(`/api/referral/jobs/${jobId}/publish`).set('Authorization', `Bearer ${emp.token}`).send({});

    const cand = await register(app, `cand4-${Date.now()}@test.dev`, 'candidate');
    await request(app).post('/api/referral/requests').set('Authorization', `Bearer ${cand.token}`).send({ referralJobId: jobId });

    const notifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${emp.token}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.some((n: any) => n.type === 'referral_request_received')).toBe(true);
  });

  it('anonymous candidate search hides identity', async () => {
    const rec = await register(app, `rec-${Date.now()}@test.dev`, 'recruiter');
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    await request(app).post(`/api/admin/recruiters/${rec.user.id}/authorize`).set('Authorization', `Bearer ${adminToken}`).send({});
    const cand = await register(app, `cand5-${Date.now()}@test.dev`, 'candidate');
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${cand.token}`).send({ skills: ['Java'], visibility: 'anonymous', referralOptIn: true, submittedForReferral: true, currentEmployer: 'SecretCo' });

    const res = await request(app).get('/api/referral/candidates/search?skills=Java').set('Authorization', `Bearer ${rec.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const c = res.body[0];
    expect(c.anonymous).toBe(true);
    expect(c.name).toBeUndefined();
    expect(c.currentEmployer).toBeUndefined();
  });

  it('authorized recruiter can shortlist candidate', async () => {
    const rec = await register(app, `rec2-${Date.now()}@test.dev`, 'recruiter');
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    await request(app).post(`/api/admin/recruiters/${rec.user.id}/authorize`).set('Authorization', `Bearer ${adminToken}`).send({});
    const cand = await register(app, `cand6-${Date.now()}@test.dev`, 'candidate');
    const s = await request(app).post('/api/referral/shortlists').set('Authorization', `Bearer ${rec.token}`).send({ candidateUserId: cand.user.id, note: 'good' });
    expect(s.status).toBe(201);
    const list = await request(app).get('/api/referral/shortlists').set('Authorization', `Bearer ${rec.token}`);
    expect(list.body.length).toBeGreaterThan(0);
  });
});
