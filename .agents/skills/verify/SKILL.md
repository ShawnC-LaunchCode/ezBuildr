---
name: verify
description: Boot ezBuildr locally and prove a change works end-to-end in the real app. TRIGGER this skill when the user asks to start, run, or restart the dev server, screenshot or click through a page, check the app still boots after a merge, verify or demo an endpoint or feature against the running server rather than just tests, or log in locally (Google OAuth can't be driven headlessly — this skill has the workaround). Also trigger before committing any nontrivial server or client change, when you should confirm the affected flow actually works. DO NOT TRIGGER for running unit/integration test suites (use run-tests), deployments, production incident checks, or adding e2e test coverage.
---

# Verifying Changes in ezBuildr

## Boot the app

- Preferred: `preview_start` with the `ezbuildr-dev` config from `.Codex/launch.json` (wraps `npm run dev`, port 5000).
- Manual: `npm run dev` (Express + Vite middleware on `http://localhost:5000`). Port busy → `npm run kill-server`.
- Test-mode server on a separate port: `npm run dev:test` (NODE_ENV=test, port 5174).
- Required env in `.env`: `DATABASE_URL`, `SESSION_SECRET`, `VL_MASTER_KEY`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `BASE_URL`, `ALLOWED_ORIGIN` (see AGENTS.md). The dev `.env` already exists on this machine — don't regenerate keys; changing `VL_MASTER_KEY` breaks all stored secrets.

## Getting authenticated (no browser OAuth needed)

Google OAuth can't be driven headlessly. Two working paths:

1. **API-level:** register a throwaway user for a JWT, exactly like integration tests do:
   ```
   POST /api/auth/register  { email, password, firstName, lastName }
   ```
   then send `Authorization: Bearer <token>`. See `tests/helpers/integrationTestHelper.ts:57` for the full bootstrap (tenant + org + project creation) — reuse it via a tsx script rather than reinventing.
2. **UI-level:** the login page also supports email/password auth for locally-registered users — register via the API first, then log in through the form.

## What "verified" means per change type

- **API change:** curl/supertest the real endpoint on the running server — status code, body shape, and the failure case (401 without token, 403/404 cross-tenant). Passing unit tests alone is not verification.
- **Workflow engine / step change:** create a workflow via the builder or API, add the relevant step, start a run, submit values, confirm `stepValues` and execution trace look right.
- **UI change:** drive it in the preview browser (`preview_snapshot` for text/structure, `preview_inspect` for styles) at desktop and mobile widths. Check `preview_console_logs` for errors. UI changes also require the design skill (user's global instruction).
- **Script/hook change:** note `vm2`/`isolated-vm` are not installed locally — sandboxed JS execution paths can't run on this machine; verify logic via unit tests and flag the gap.

## Fast checks that catch most breakage

```bash
npx tsc --noEmit          # type-check (build gate)
npm run test:fast         # 13s, no DB
npm run lint              # zero-error policy (warnings ok)
```

Run all three before calling a change done; run targeted integration tests (see the run-tests skill) when the change touches server behavior.
