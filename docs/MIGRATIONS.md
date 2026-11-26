# Database Migrations & Environment Configuration

## Current model (MVP)
The application uses a single document snapshot (`app_state` in Supabase or `.data/database.json` locally). All entities (users, profiles, referral jobs, requests, verifications, documents, notifications, consent records) live in one JSONB row. RLS on `app_state` allows only the server-side secret key.

## Adding a new collection
1. Add the interface to `server/types.ts` and `src/types.ts`.
2. Add the collection to `DatabaseSchema` in `server/db.ts`.
3. Initialize it in `seedInitialDatabase()`, `normalizeSnapshot()`, and `deleteUserAndData()`.
4. Add DB methods and routes.
5. Add tests.

## Future per-entity migration (when write volume grows)
Hot collections to migrate first: `referral_jobs`, `referral_requests`, `notifications`, `verification_documents`.

For each:
- Create a real Postgres table with foreign keys and indexes listed in `plan.md` §3.3.
- Enable RLS with policies scoped by `auth.uid()` (owner) or role via a capabilities table; service role bypasses for Express.
- Store document bytes in a private Supabase Storage bucket; issue signed URLs (≤ 5 min) after authorization.
- Route reads/writes through `DatabaseService` (the seam) so callers are unaffected.
- Keep the snapshot as a fallback during dual-write rollout.

## Environment variables
See `.env.example`. New in Milestone 7:
- `EMAIL_NOTIFICATIONS_ENABLED` (default false)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (optional)
