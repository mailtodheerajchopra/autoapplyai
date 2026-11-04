/**
 * Test bootstrap: deterministic, fully isolated from real dependencies.
 *  - File state store in a throwaway temp dir (never the dev .data file)
 *  - Fixed AUTH_SECRET (no ephemeral-dev-secret warning)
 *  - Gemini key absent → mock fallback paths under test
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
