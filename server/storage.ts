/**
 * Pluggable persistence engine for the JSON document snapshot.
 *
 * The database (server/db.ts) keeps an in-memory snapshot and persists it
 * through one of these adapters:
 *
 *  - FileStore    → local development (default). Same behaviour as before.
 *  - SupabaseStore → serverless/production. A single-row `app_state` table
 *                    in Supabase Postgres holds the JSON snapshot; read-only
 *                    filesystems on Vercel make a local file impossible.
 *
 * Scale note: snapshot-per-save is intentionally simple and is the same
 * shape the local dev database always used. When write volume grows past a
 * handful of ops/sec, replace engine-by-engine with real per-entity tables
 * — the DatabaseService API is the seam for that migration.
 */
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface StateStore {
  readonly name: string;
  /** Load the persisted snapshot, or null when nothing is stored yet. */
  load(): Promise<unknown | null>;
  /** Persist the whole snapshot (atomic replace, last write wins). */
  save(snapshot: unknown): Promise<void>;
}

// Re-read at call time (not module init) so dotenv/config loads first.
let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return cachedClient;
}

export const APP_STATE_ROW_ID = 'v1';

class FileStore implements StateStore {
  readonly name = 'file';
  private readonly filePath: string;

  constructor() {
    // DATA_DIR lets tests (and exotic deployments) relocate the snapshot file.
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
    this.filePath = path.resolve(dataDir, 'database.json');
  }

  async load(): Promise<unknown | null> {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (e) {
      console.warn('[storage:file] Could not load snapshot:', e);
    }
    return null;
  }

  async save(snapshot: unknown): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.error('[storage:file] Failed to persist snapshot:', err);
    }
  }
}

class SupabaseStore implements StateStore {
  readonly name = 'supabase';
  private client: SupabaseClient;

  constructor() {
    const client = getSupabaseClient();
    if (!client) throw new Error('SupabaseStore requires SUPABASE_URL and SUPABASE_SECRET_KEY');
    this.client = client;
  }

  async load(): Promise<unknown | null> {
    const { data, error } = await this.client
      .from('app_state')
      .select('data')
      .eq('id', APP_STATE_ROW_ID)
      .maybeSingle();
    if (error) {
      throw new Error(`[storage:supabase] Failed to load snapshot: ${error.message}`);
    }
    return data ? (data as { data: unknown }).data : null;
  }

  async save(snapshot: unknown): Promise<void> {
    const { error } = await this.client
      .from('app_state')
      .upsert(
        { id: APP_STATE_ROW_ID, data: snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
    if (error) {
      throw new Error(`[storage:supabase] Failed to persist snapshot: ${error.message}`);
    }
  }
}

export function getStore(): StateStore {
  if (isSupabaseConfigured()) return new SupabaseStore();
  return new FileStore();
}
