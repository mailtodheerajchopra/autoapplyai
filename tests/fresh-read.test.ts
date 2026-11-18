/**
 * Read-path freshness regression (the "0 findings / missing CV" class):
 * a warm serverless instance hydrates its snapshot once and shares no
 * memory with the instance that just served a write. Without the
 * freshness middleware, GET /api/resumes on the stale instance returned
 * an empty list even though the upload was durably persisted — which
 * made the CV gate block discovery, and the user saw "0 findings".
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

describe('read-path freshness (stale warm instance sees newer durable data)', () => {
  const app = createApp();

  it('serves a resume persisted by ANOTHER instance without re-login', async () => {
    // 1. Register on this instance (its snapshot now lacks the resume).
    const email = `fresh-read-${Date.now()}@test.dev`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Fresh Reader', email, password: 'secret-1' });
    expect(reg.status).toBe(201);
    const token = reg.body.token;
    const userId = reg.body.user.id;

    // 2. Simulate a second instance persisting a resume for that user:
    //    write it straight into the durable store behind this instance's back.
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.env.DATA_DIR!, 'database.json');
    // Ensure the external write lands on a strictly later mtime than the
    // version this instance observed (coarse FS timestamps) AND that the
    // 300ms probe throttle window has expired.
    await new Promise((r) => setTimeout(r, 400));
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    snapshot.resumes.push({
      id: 'res_other_instance',
      userId,
      fileName: 'Other.md',
      fileType: 'md',
      fileSize: 12,
      rawText: '# other instance cv',
      uploadedAt: new Date().toISOString(),
      parsedProfile: {},
    });
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    await new Promise((r) => setTimeout(r, 400));

    // 3. The stale instance must merge the newer snapshot on read.
    const res = await request(app)
      .get('/api/resumes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: any) => r.id === 'res_other_instance')).toBe(true);
  });
});
