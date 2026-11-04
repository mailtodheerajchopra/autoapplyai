# Contributing to AutoApply AI

Thank you for considering a contribution! This project is a production app
([applymatica.com](https://www.applymatica.com)) as well as an open-source
codebase, so the bar for changes is: **correct, tested, and honest about trade-offs.**

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
Please read it before your first issue or pull request.

## Ground rules

1. **No secrets, ever.** Never commit API keys, passwords, or real user data.
   All credentials live in environment variables (see `.env.example`). A PR
   containing anything credential-shaped will be rejected and, if it reached
   history, force-removed.
2. **Security-sensitive areas need a discussion first.** Anything touching
   `server/moderation.ts`, auth (`server/auth.ts`), the prompt-assembly code in
   `server/gemini.ts`, or the shared DiscoveryPool deserves an issue *before* a
   PR, with your threat model spelled out.
3. **Candidate-safety filters are contract-tested.** If you change
   `server/discovery.ts` filters (conflict shield, freshness, location,
   experience), add or update tests in `tests/discovery-filters.test.ts`.
   Loosening a safety filter requires strong justification in the PR body.
4. **The product must degrade, never die.** Features must keep working when
   model quota is exhausted (the degradation chain: Gemini → Groq → mock) and
   when storage is briefly unreachable.

## Development environment

Prerequisites: **Node.js 20+**, npm 10+, and a free [Google AI Studio](https://aistudio.google.com) key
(plus optional Supabase / Groq / Google OAuth credentials).

```bash
git clone https://github.com/mailtodheerajchopra/autoapplyai.git
cd autoapplyai
npm install
cp .env.example .env        # fill in at least AUTH_SECRET; add GEMINI_API_KEY for real agent runs
npm run dev                 # full-stack dev server at http://localhost:3000
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Vite + API dev server (single port 3000) |
| `npm run test` | Vitest + Supertest suite (53 tests) — runs offline, keys are stripped in `tests/setup.ts` |
| `npm run lint` | TypeScript strict check (`tsc --noEmit`) |
| `npm run build` | Production build (Vite) |
| `npx vitest run tests/discovery-filters.test.ts` | Just the safety-filter tests |

**You can develop with zero credentials**: without env vars the app boots in
degraded mode (mock agent paths), which is enough for all UI work.

Optional infrastructure (all free-tier):

- **Supabase** — durable storage in production. Locally the app falls back to a
  JSON file store (`.data/`, gitignored).
- **Groq key** — adds the open-source fallback tier (Llama 3.3 70B) used when
  both Gemini models are quota-exhausted.
- **Google OAuth** — create an OAuth client in Google Cloud console with
  redirect URI `http://localhost:3000/api/auth/google/callback` for local testing.

## Coding style

- **TypeScript, strict mode** — `npm run lint` must pass; no `any` unless it is
  fencing an external payload at the boundary (see `server/db.ts` hydration).
- **Server**: Express-style route modules; new endpoints go in
  `server/routes.ts` with `authMiddleware` (and `adminGuard` for admin-only),
  and every data access is **`userId`-scoped** — tenancy leaks are release-blockers.
- **Client**: React 19 function components + Tailwind utility classes, colocated
  in `src/components/`. Keep components dumb about persistence; all I/O goes
  through `src/api.ts`.
- **Model calls**: always bounded by a timeout, always behind the degradation
  chain, always through `deepSanitize` for untrusted payloads, and the
  `UNTRUSTED_DATA_RULE` prefix stays in every prompt.
- **Async by design**: long agent work runs in the background (202 + poll),
  never inline in an HTTP request beyond the 60s serverless cap.
- **Comments explain *why***, not what. If a line needs a comment to say what
  it does, the line is wrong.
- **Tests live beside the behaviour they lock in** (`tests/*.test.ts`). A bug
  fix that changes filter behaviour ships with a regression test.

## Commit & pull-request process

1. **Branch from the latest `main`** with a short, imperative name
   (`fix/location-guard`, `feat/tracker-export`).
2. **Keep PRs small and single-purpose.** One behaviour per PR; unrelated
   refactors belong in their own PR.
3. Run `npm run lint && npm run test && npm run build` locally — all three must
   pass; CI runs the same trio.
4. Write a PR body that answers: *what changed, why, what could break, how you
   tested it.* Screenshots for UI changes are appreciated.
5. Mark the PR ready for review once CI is green. At least one approval is
   required; the maintainer may ask for changes — that's normal, not personal.
6. Merge is **squash** by default; the commit message should read like a
   changelog entry (`Location filter in the jobs feed (My Country + Remote / …)`).

## Reporting bugs & security issues

- Regular bugs: open a GitHub issue with steps to reproduce, expected vs actual,
  and your environment (browser/OS; do **not** paste tokens or CVs).
- Security vulnerabilities: please do **not** open a public issue — see
  `SECURITY.md` for responsible disclosure.

## Licensing

Contributions are licensed under the project's [Apache-2.0 license](LICENSE)
(Contribution licensing per section 5 of the license).
