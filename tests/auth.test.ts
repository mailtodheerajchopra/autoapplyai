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
