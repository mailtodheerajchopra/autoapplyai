-- AutoApply AI — Supabase schema
-- Run once in the Supabase SQL Editor (Project AutoApply).
--
-- The database is a document snapshot model: the whole state of
-- server/db.ts's DatabaseSchema lives in one JSONB row. The service secret
-- key bypasses RLS for the Express server; the browser never talks to
-- Supabase directly.

create table if not exists public.app_state (
  id         text primary key default 'v1',
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Intentionally no RLS policies: with RLS on and zero policies, only the
-- server-side secret key can read or write. The publishable/anon key and
-- the public Data API get nothing.

-- Optional backstop for future per-entity migration (jobs, applications):
-- add real tables there and let DatabaseService route hot collections to
-- them before the snapshot layer.
