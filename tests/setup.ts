/**
 * Test bootstrap: deterministic, fully isolated from real dependencies.
 *  - File state store in a throwaway temp dir (never the dev .data file)
 *  - Fixed AUTH_SECRET (no ephemeral-dev-secret warning)
 *  - Gemini key absent → AI tiers degrade honestly to empty results
 *    (the hardcoded mock fallback was removed; boards tier needs no keys)
 *  - Supabase URL absent → the app under test never touches real storage
 *    (the Supabase round-trip lives in tests/storage-supabase.test.ts,
 *    which opts in explicitly)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoapply-test-'));

process.env.NODE_ENV = 'test';
// Sandbox persona endpoints are dev/prod-gated; test suites mint demo tokens.
// DEMO_MODE re-enables the seeded persona dataset for the suites that
// exercise the isolation contract against known sample data.
process.env.ENABLE_DEMO_AUTH = 'true';
process.env.DEMO_MODE = 'personas';
process.env.AUTH_SECRET = 'test-only-hmac-secret-do-not-ship';
process.env.DATA_DIR = tmpDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;

// Boards-first discovery pipeline: the default scan now targets nine live ATS
// boards. Keep that tier offline + deterministic here — a fixture Greenhouse
// response for `stripe`, fast 404s for every other ATS host, and pass-through
// for everything else (the injected fetchImpl in boards.test.ts overrides this
// locally; scanBoards only reads ok/status/json, which the shim provides).
type ShimResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const jsonShim = (status: number, body: unknown): ShimResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const ATS_HOST = /boards-api\.greenhouse\.io|api\.lever\.co|jobs\.ashbyhq\.com|api\.ashbyhq\.com|api\.smartrecruiters\.com|apply\.workable\.com|recruitee\.com/i;
const recentIso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const GH_STRIPE_FIXTURE = {
  meta: { total: 2 },
  jobs: [
    {
      id: 9001,
      title: 'Full Stack Developer (Remote)',
      absolute_url: 'https://boards.greenhouse.io/stripe/jobs/9001',
      location: { name: 'Remote, US' },
      company_name: 'Stripe',
      first_published: recentIso(2),
      content: '<p>Build full-stack features with React, Node.js, TypeScript, REST APIs and microservices.</p>',
    },
    {
      id: 9002,
      title: 'Platform Engineer',
      absolute_url: 'https://boards.greenhouse.io/stripe/jobs/9002',
      location: { name: 'Remote, EU' },
      company_name: 'Stripe',
      first_published: recentIso(5),
      content: '<p>Terraform, Go, Kubernetes.</p>',
    },
  ],
};
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (ATS_HOST.test(url)) {
    if (/greenhouse\.io\/v1\/boards\/stripe\b/i.test(url)) return jsonShim(200, GH_STRIPE_FIXTURE) as unknown as Response;
    return jsonShim(404, {}) as unknown as Response;
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;
