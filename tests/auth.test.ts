import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { generateToken } from '../server/auth.js';

const SECRET = process.env.AUTH_SECRET!;

function signWith(secret: string, payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `tok_${encodedPayload}.${signature}`;
}

describe('stateless auth (HMAC tokens)', () => {
  const app = createApp();

  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  it('accepts a freshly minted token for the seeded demo user', async () => {
    const switchRes = await request(app)
      .post('/api/auth/demo-switch')
      .send({ userId: 'usr_alex_chen' });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.token).toMatch(/^tok_/);

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${switchRes.body.token}`);
    expect(res.status).toBe(200);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const token = generateToken('usr_alex_chen');
    const tampered = token.replace(/.$/, token.endsWith('A') ? 'B' : 'A');
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different AUTH_SECRET (rotation invalidates sessions)', async () => {
    const foreignToken = signWith('a-completely-different-secret', { v: 1, u: 'usr_alex_chen', e: Date.now() + 60_000 });
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${foreignToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = signWith(SECRET, { v: 1, u: 'usr_alex_chen', e: Date.now() - 1000 });
    const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects malformed token strings', async () => {
    const res = await request(app).get('/api/profile').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});

describe('self-service password change', () => {
  const app = createApp();

  it('registers, changes password, and re-authenticates with the new secret', async () => {
    const email = `pw-change-${Date.now()}@test.dev`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Pw Changer', email, password: 'old-secret-1' });
    expect(reg.status).toBe(201);
    expect(reg.body.persisted).toBe(true);

    // Wrong current password is rejected.
    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'new-secret-1' });
    expect(wrong.status).toBe(400);

    // Correct change succeeds and is durable before responding.
    const ok = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ currentPassword: 'old-secret-1', newPassword: 'new-secret-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.persisted).toBe(true);

    // The old secret no longer authenticates; the new one does.
    const oldLogin = await request(app).post('/api/auth/login').send({ email, password: 'old-secret-1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: 'new-secret-1' });
    expect(newLogin.status).toBe(200);
  });

  it('requires both current and new password', async () => {
    const token = generateToken('usr_alex_chen');
    const missing = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'x' });
    expect(missing.status).toBe(400);
  });

  it('rejects a new password shorter than 6 characters', async () => {
    const token = generateToken('usr_alex_chen');
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password123', newPassword: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
  });
});

describe('OAuth provider plumbing', () => {
  const app = createApp();

  it('reports both providers unconfigured when no client credentials exist', async () => {
    const res = await request(app).get('/api/auth/oauth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false, linkedin: false });
  });

  it('start endpoints 404 while unconfigured', async () => {
    expect((await request(app).get('/api/auth/google/start')).status).toBe(404);
    expect((await request(app).get('/api/auth/linkedin/start')).status).toBe(404);
  });

  it('callback redirects back with oauthError while unconfigured', async () => {
    const res = await request(app).get('/api/auth/google/callback?state=x.y&code=c');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauthError=not_configured');
    const li = await request(app).get('/api/auth/linkedin/callback?state=x.y&code=c');
    expect(li.status).toBe(302);
    expect(li.headers.location).toContain('oauthError=not_configured');
  });

  it('derives an https redirect_uri behind an https proxy (regression: precedence bug)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    try {
      const res = await request(app)
        .get('/api/auth/google/start')
        .set('x-forwarded-proto', 'https')
        .set('host', 'www.applymatica.com');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('redirect_uri=https%3A%2F%2Fwww.applymatica.com');
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });
});
