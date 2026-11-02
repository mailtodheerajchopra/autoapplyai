/**
 * Supabase round-trip (integration).
 *
 * Opts into REAL Supabase explicitly: credentials are read from the local
 * .env (gitignored) at file-scope. Skips cleanly when they are absent, so
 * CI without a Supabase project still passes. Uses a dedicated test row id
 * and cleans up — the live 'v1' snapshot row is never touched.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import { getSupabaseClient } from '../server/storage.js';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env');
const hasEnv = fs.existsSync(envPath);
if (hasEnv) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
  process.env.SUPABASE_URL = parsed.SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = parsed.SUPABASE_SECRET_KEY;
}

const TEST_ROW_ID = 'test_vitest_roundtrip';
const suite = hasEnv && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? describe : describe.skip;

suite('Supabase storage round-trip (integration)', () => {
  const client = getSupabaseClient()!;

  it('persists, reads back, and deletes a test row', async () => {
    const payload = { hello: 'world', n: 42, at: new Date().toISOString() };

    const up = await client.from('app_state').upsert(
      { id: TEST_ROW_ID, data: payload, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    expect(up.error).toBeNull();

    const read = await client.from('app_state').select('data').eq('id', TEST_ROW_ID).maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data?.data).toEqual(payload);

    const del = await client.from('app_state').delete().eq('id', TEST_ROW_ID);
    expect(del.error).toBeNull();

    const gone = await client.from('app_state').select('id').eq('id', TEST_ROW_ID).maybeSingle();
    expect(gone.data).toBeNull();
  });

  it('enforces RLS for unprivileged access (table is secret-key-only)', async () => {
    // A client created with an obviously-wrong key must NOT be able to read.
    const rogue = createClient(process.env.SUPABASE_URL!, 'sb_secret_invalid_key_for_rls_test', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const res = await rogue.from('app_state').select('id').limit(1);
    // Either an error (auth rejected) or zero rows leaked — never real data.
    expect(res.error).toBeTruthy();
  });
});
