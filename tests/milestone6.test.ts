import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

async function register(app: any, email: string, roleIntent?: string) {
  const res = await request(app).post('/api/auth/register').send({ name: 'User', email, password: 'secret-1', roleIntent });
  return res.body;
}

describe('Milestone 6 – security & resume access', () => {
  const app = createApp();

  it('resume access requires explicit consent', async () => {
    const cand = await register(app, `cand-${Date.now()}@test.dev`);
    const emp = await register(app, `emp-${Date.now()}@test.dev`, 'employee');
    // upload a resume for candidate
    await request(app).post('/api/resumes/upload').set('Authorization', `Bearer ${cand.token}`).send({ fileName: 'r.txt', fileType: 'txt', rawText: 'Java Spring Boot' });

    // no consent -> forbidden
    const forbidden = await request(app).get(`/api/referral/candidates/${cand.user.id}/resume`).set('Authorization', `Bearer ${emp.token}`);
    expect(forbidden.status).toBe(403);

    // request access
    const reqAccess = await request(app).post(`/api/referral/candidates/${cand.user.id}/resume-access-request`).set('Authorization', `Bearer ${emp.token}`).send({});
    expect(reqAccess.status).toBe(200);

    // candidate grants
    const grant = await request(app).post(`/api/referral/resume-access/${emp.user.id}/grant`).set('Authorization', `Bearer ${cand.token}`).send({});
    expect(grant.status).toBe(200);

    // now allowed
    const allowed = await request(app).get(`/api/referral/candidates/${cand.user.id}/resume`).set('Authorization', `Bearer ${emp.token}`);
    expect(allowed.status).toBe(200);

    // withdraw
    const wd = await request(app).post(`/api/referral/resume-access/${emp.user.id}/withdraw`).set('Authorization', `Bearer ${cand.token}`).send({});
    expect(wd.status).toBe(200);
    const forbidden2 = await request(app).get(`/api/referral/candidates/${cand.user.id}/resume`).set('Authorization', `Bearer ${emp.token}`);
    expect(forbidden2.status).toBe(403);
  });

  it('employee cannot access another candidate verification document', async () => {
    const cand = await register(app, `cand2-${Date.now()}@test.dev`);
    const emp = await register(app, `emp2-${Date.now()}@test.dev`, 'employee');
    const upload = await request(app).post('/api/documents').set('Authorization', `Bearer ${cand.token}`).send({ kind: 'identity', mimeType: 'text/plain', size: 4, contentBase64: 'dGVzdA==' });
    const docId = upload.body.id;
    const forbidden = await request(app).get(`/api/documents/${docId}/content`).set('Authorization', `Bearer ${emp.token}`);
    expect(forbidden.status).toBe(403);
  });

  it('anonymous candidate profile hides PII', async () => {
    const cand = await register(app, `cand3-${Date.now()}@test.dev`);
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${cand.token}`).send({ skills: ['Java'], visibility: 'anonymous', referralOptIn: true, submittedForReferral: true, currentEmployer: 'SecretCo' });
    const rec = await register(app, `rec-${Date.now()}@test.dev`, 'recruiter');
    const adminToken = (await request(app).post('/api/auth/demo-switch').send({ userId: 'usr_admin' })).body.token;
    await request(app).post(`/api/admin/recruiters/${rec.user.id}/authorize`).set('Authorization', `Bearer ${adminToken}`).send({});

    const res = await request(app).get('/api/referral/candidates/search?skills=Java').set('Authorization', `Bearer ${rec.token}`);
    expect(res.status).toBe(200);
    const c = res.body[0];
    expect(c.name).toBeUndefined();
    expect(c.currentEmployer).toBeUndefined();
    expect(c.anonymous).toBe(true);
  });

  it('candidate cannot access another candidate referral profile', async () => {
    const c1 = await register(app, `c1-${Date.now()}@test.dev`);
    const c2 = await register(app, `c2-${Date.now()}@test.dev`);
    await request(app).put('/api/referral/candidate-profile').set('Authorization', `Bearer ${c1.token}`).send({ currentEmployer: 'SecretCo' });
    const res = await request(app).get('/api/referral/candidate-profile').set('Authorization', `Bearer ${c2.token}`);
    expect(res.body).toBeNull();
  });
});
