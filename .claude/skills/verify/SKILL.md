---
name: verify
description: 'Use this skill whenever a change needs to be proven against the live locally-running ezBuildr app instead of (or in addition to) tests. That includes: spinning up, starting, or restarting the app or dev/test server on any port; hitting an API endpoint manually on the running server with a real token; confirming the app still boots and pages still load after a merge or refactor; proving a feature or flow (e.g. a run, workflow, endpoint) actually works end-to-end before committing; screenshotting or clicking through the UI; demoing a feature; or logging in locally (it documents the Google OAuth workaround). Phrases like "spin up the app", "prove it works", "verify end to end", "make sure it still boots", or "check it in the real app, not just tests" all mean this skill. Do NOT use it for running unit/integration test suites (use run-tests), deploying, checking production availability or incidents, code review, or writing e2e tests.'
---

# Verifying Changes in ezBuildr

## Boot the app

- Preferred: `preview_start` with the `ezbuildr-dev` config from `.claude/launch.json` (wraps `npm run dev`, port 5000).
- Manual: `npm run dev` (Express + Vite middleware on `http://localhost:5000`). Port busy → `npm run kill-server`.
- Test-mode server on a separate port: `npm run dev:test` (NODE_ENV=test, port 5174).
- Required env in `.env`: `DATABASE_URL`, `SESSION_SECRET`, `VL_MASTER_KEY`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `BASE_URL`, `ALLOWED_ORIGIN` (see CLAUDE.md). The dev `.env` already exists on this machine — don't regenerate keys; changing `VL_MASTER_KEY` breaks all stored secrets.

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
- **UI change:** drive it in the preview browser (`read_page` for text/structure, `javascript_tool` for computed styles, `computer` screenshot for visuals) at desktop and mobile widths (`resize_window`). Check `read_console_messages` for errors. UI changes also require the design skill (user's global instruction).
- **Script/hook change:** note `vm2`/`isolated-vm` are not installed locally — sandboxed JS execution paths can't run on this machine; verify logic via unit tests and flag the gap.

## Fast checks that catch most breakage

```bash
npx tsc --noEmit          # type-check (build gate)
npm run test:fast         # 13s, no DB
npm run lint              # zero-error policy (warnings ok)
```

Run all three before calling a change done; run targeted integration tests (see the run-tests skill) when the change touches server behavior.
