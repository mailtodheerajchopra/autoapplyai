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
  /** Persist the whole snapshot (atomic replace). Returns the durable version written. */
  save(snapshot: unknown): Promise<string>;
  /**
   * The durable store's current version marker (e.g. row updated_at), or null
   * when nothing is stored. Powers optimistic-concurrency checks in db.ts so a
   * stale instance can never clobber a newer snapshot with last-write-wins.
   */
  getVersion(): Promise<string | null>;
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
    if (!fs.existsSync(this.filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (e) {
      // A corrupted-but-present file must THROW, not return null — hydrate()
      // treats null as "nothing stored" and would overwrite the file with
      // seed data, destroying possibly-recoverable state.
      console.warn('[storage:file] Snapshot file exists but could not be parsed:', e);
      throw e;
    }
  }

  async save(snapshot: unknown): Promise<string> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    // Version marker = the file's mtime, the same value getVersion() reports,
    // so a second process observes our write and we observe theirs.
    return fs.statSync(this.filePath).mtime.toISOString();
  }

  async getVersion(): Promise<string | null> {
    try {
      if (fs.existsSync(this.filePath)) {
        return fs.statSync(this.filePath).mtime.toISOString();
      }
    } catch {
      // File disappeared mid-check → treat as nothing stored.
    }
    return null;
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

  async save(snapshot: unknown): Promise<string> {
    // We supply updated_at ourselves so the returned version is exactly what
    // the durable row now holds (Supabase would otherwise normalise it).
    const writtenAt = new Date().toISOString();
    const { error } = await this.client
      .from('app_state')
      .upsert(
        { id: APP_STATE_ROW_ID, data: snapshot, updated_at: writtenAt },
        { onConflict: 'id' }
      );
    if (error) {
      throw new Error(`[storage:supabase] Failed to persist snapshot: ${error.message}`);
    }
    return writtenAt;
  }

  async getVersion(): Promise<string | null> {
    const { data, error } = await this.client
      .from('app_state')
      .select('updated_at')
      .eq('id', APP_STATE_ROW_ID)
      .maybeSingle();
    if (error) {
      throw new Error(`[storage:supabase] Failed to read snapshot version: ${error.message}`);
    }
    return data ? ((data as { updated_at: string | null }).updated_at ?? null) : null;
  }
}

export function getStore(): StateStore {
  if (isSupabaseConfigured()) return new SupabaseStore();
  return new FileStore();
}
