# Security Policy

## Supported versions

Only the latest `main` (and the deployed production build) is supported with
security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, contact the maintainer directly:

- GitHub: [@mailtodheerajchopra](https://github.com/mailtodheerajchopra)
- Email: mailtodheerajchopra@gmail.com

Include as much of the following as you can:

- Type of issue (e.g. auth bypass, prompt injection, data exposure)
- Step-by-step reproduction or PoC
- Affected files/endpoints
- Impact assessment

You will receive an acknowledgement within **7 days**, and a fix or a plan
within **30 days**. We credit reporters in the release notes unless you prefer
to stay anonymous.

## What is in scope

- Authentication/session handling (`server/auth.ts`, OAuth flows)
- `userId` tenancy scoping on any endpoint
- The CV moderation gate and prompt-injection defenses (`server/moderation.ts`,
  prompt assembly in `server/gemini.ts`)
- Cross-user data exposure via the shared DiscoveryPool
- Secret leakage anywhere in the codebase

## What is not in scope

- Automated scanner noise without a demonstrated exploit path
- Reports from scanning applymatica.com (the live deployment) that create data
  for other users — load testing and pentesting of the production service are
  **not permitted**; run any load tests locally (`k6/` targets localhost)
- Social engineering, brute force, or DoS

## Secret handling for contributors

- All credentials are environment variables — never commit them.
- If you believe a secret was committed to this repository, email the maintainer
  immediately; history will be rewritten and the secret rotated.
