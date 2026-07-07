# SEC-034 — Typecheck / CI trust: false-green locally, misconfigured gate in CI, red strict zones

- **Severity:** Medium (process / trust-in-signal; not a runtime vuln)
- **Type:** Dev environment + CI + TypeScript-migration hygiene
- **Discovered:** 2026-07-07, verifying the SEC-020..033 remediation
- **Supersedes:** an earlier draft of this ticket that incorrectly claimed CI went red because of 3 test files and could be greened by fixing them. That was based on a truncated compiler output and is wrong — see Part C.

## TL;DR

Nothing in this repo currently type-checks green under any config, and the local dev environment silently *reports* green. As a result, TS regressions can't be caught by anyone — locally or in CI — and the CI test suite hasn't been running at all. One part (the CI misconfiguration, Part B) is fixed in the accompanying change; the rest are scoped follow-ups.

---

## Part A — Local dev environment produces false-green typechecks

`node_modules/.bin/` is **empty** on at least one dev machine even though `typescript@5.6.3` is installed at `node_modules/typescript/bin/tsc`. Consequences:
- `npx tsc` does **not** run the real compiler — with no local shim, npx downloads and runs an unrelated squatter package named `tsc` that prints *"This is not the tsc command you are looking for"* and **exits 0 without compiling**. Every `npx tsc` "pass" is meaningless.
- `npm run check` (`"check": "tsc"`) can't resolve `tsc` (`'tsc' is not recognized`).
- `npm run build` would also fail locally (needs `vite`/`esbuild`/`cross-env` shims).

Root cause: a broken/partial dependency install (a healthy `npm install`/`npm ci` always populates `.bin`).

**Fix:**
1. `npm ci` to regenerate `node_modules/.bin`; confirm `npm run check` / `npm run build` then work. Run when no dev server / other IDE is mid-build (it rebuilds `node_modules`).
2. Harden the script so it can't be faked: `"check": "node ./node_modules/typescript/bin/tsc"` (immune to `.bin` breakage and the `npx tsc` squatter). Add a one-line CONTRIBUTING note: never verify types with `npx tsc` in this repo — use `npm run check`.

---

## Part B — CI misconfiguration (FIXED in accompanying change)

`.github/workflows/ci.yml` ("Deployment Safety Check") ran full-project `npm run check` (bare `tsc`) as a **blocking** step. Because the full project does not pass `tsc` (Part C), that step failed on **every commit** — verified via the Actions API, the last 15 runs are all `conclusion: failure`, going back before the security work. Since it runs before the DB/test steps with no `continue-on-error`, **the entire test suite (unit + integration + auth) was skipped on every commit** — the security remediations had zero passing test signal.

This contradicts the team's own documented strategy: `strict-mode-check.yml` already runs the full check with `continue-on-error: true` (advisory) and enforces only the strict zones.

**Fix (done):** `ci.yml`'s Type Check step is now `continue-on-error: true` (advisory), matching `strict-mode-check.yml`. The pipeline now proceeds to Setup Database + the test suite, so tests actually run on every commit. Strict-mode enforcement remains in its dedicated workflow.

**Follow-up:** once tests run again, expect some to fail (real signal that's been hidden). Triage separately. Consider making "Deployment Safety Check" a required status check once green.

---

## Part C — Full-project `tsc` has ~858 pre-existing errors (documented legacy debt)

Running the real compiler over the whole project (`tsconfig.json` includes client, shared, server, tests, scripts with `strict: true`) yields **~858 errors across ~250 files**. This is **pre-existing, known, and documented** — tsconfig.json states: *"legacy code may not fully comply [with strict]... we are gradually migrating... strict zones are enforced via scripts/check-strict-zones.ts."*

**Do not attempt to zero this out in one pass** — it's a deliberate gradual migration. Track it as its own long-running workstream against `docs/TYPESCRIPT_STRICT_MODE_MIGRATION.md`. (Three test files were fixed opportunistically alongside this ticket — `StepService.test.ts`, `WorkflowService.test.ts`, `stepConfigSchemas.test.ts` — but they're a drop in the bucket, not a path to green.)

---

## Part D — The strict-zones gate is itself currently RED

`npm run check:strict-zones` (the *enforced* gate, via `tsconfig.strict.json`) does not pass. Running `tsc -p tsconfig.strict.json --noEmit` fails (exit 2) with ~10 violations in the existing scripting zone and files it transitively imports:
- `server/services/scripting/LifecycleHookService.ts:137` — implicit-any index into `{}`
- `server/services/WorkflowService.ts:653,691` — possibly-undefined (`newSection`, `newStep`)
- `server/services/AccountLockoutService.ts:36` (unused `email`), `:75` (`mostRecent` possibly undefined)
- `server/repositories/ActivityLogRepository.ts:274,299` — callback param type
- `server/repositories/CollectionFieldRepository.ts:82` — **`Cannot find name 'sql'` (real missing-import bug)**
- `server/repositories/DatavaultRowsRepository.ts:193,518` — possibly-undefined

So `strict-mode-check.yml`'s enforced step is also red. **Fix:** repair these ~10 violations (bounded, but they touch core auth/billing/workflow/datavault files — do it with the test suite running, i.e. after Part B lands, so behavior changes to null-handling are verified). The `CollectionFieldRepository` missing `sql` import should be fixed regardless — it's a genuine bug.

---

## Part E — Pulling the security-sensitive routes into a strict zone is NOT a config change

Requested: move the audited security routes (billing, webhooks, auth, datavault, esign, tenant, …) into a strict zone so their type safety is enforced. This is **infeasible incrementally** as things stand:

1. **Strict zones check the whole import closure.** `tsconfig.strict.json` type-checks included files *and everything they import*. A route drags in its controllers → services → repositories → shared schema. All of it must be strict-clean.
2. **Most security routes already fail even base strict.** In the Part C full run, `auth.routes.ts` (4), `templates.routes.ts` (7), `datavault.routes.ts`, `workflows.routes.ts`, `intake.routes.ts`, `places.routes.ts`, `projects.routes.ts`, `ai.doc.routes.ts`, `ai.feedback.routes.ts`, `ai/workflowEdit.routes.ts` all have errors — and their service/repo closures have more under the stricter flags.
3. Adding them to `tsconfig.strict.json` today would simply make the (already red) strict gate redder and block CI further.

**Realistic path:** treat security-route strictness as a scoped sub-migration, one route's dependency closure at a time, only adding a route to `tsconfig.strict.json` (and the `STRICT_ZONES` list in `scripts/check-strict-zones.ts`) once its closure compiles clean. Start with the routes whose closures are smallest / already near-clean (e.g. `metrics`, `userPreferences`, `branding`, `datavaultApiTokens`, `connections-v2`) rather than the deep ones (`workflows`, `datavault`, `auth`). Restore the existing strict zone (Part D) first.

---

## Acceptance criteria

- **A:** `npm run check` runs the real compiler locally and matches CI; `npx tsc` can no longer be mistaken for a passing typecheck.
- **B (done):** `ci.yml` proceeds past Type Check to run the full test suite on every commit; verify the next `main` run reaches the "Run All Tests" step.
- **C:** full-project strict-error count is tracked and trending down (own workstream).
- **D:** `npm run check:strict-zones` exits 0; `strict-mode-check.yml` enforced step is green.
- **E:** a documented, per-route plan exists for bringing security routes into strict zones; at least the smallest-closure security route is added and passing.

## Part F — Integration test-harness backlog now visible (183 failures)

Once tests actually ran (Parts B + the SESSION_SECRET fix), the suite went from 1508 to **2376 tests executing** — ~900 integration/unit-db tests that had been silently skipped now run. Result: **1860 pass, 183 fail**. The failures are a PRE-EXISTING backlog that was hidden because CI never ran tests; they are NOT regressions from the security work (the security-stale unit tests were fixed separately and are green, and the security-adjacent integration failures all die at harness *setup*, never reaching their assertions).

Dominant root causes (test-DB provisioning, not product bugs):
1. **`users.is_active` missing** in the per-worker test schemas (PG 42703 `errorMissingColumn`) — registration/login `select ... is_active ... from users` fails, so `setupIntegrationTest` (which registers a user) throws `internal_error`, cascading to dozens of integration files (ownershipAccess, hardening/*, datavault.permissions, api.*, auth/*, etc.). Likely `drizzle-kit push` not reflecting the current `users` schema / a migration-only column.
2. **`pgcrypto` not enabled** — `function digest(text, unknown) does not exist`; test DB setup needs `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
3. **Constraint idempotency** — `constraint "ai_settings_updated_by_users_id_fk" already exists` during schema setup.
4. **CI test-DB seed uses `root`** — repeated `FATAL: role "root" does not exist` in PG logs; a health-check/psql call defaults to the `root` user.
5. Remaining unit-db failures (WorkflowTemplateService/Repository, templateNode, PdfQueueService) — need per-file triage; likely factory/schema drift similar to the unit stale-mocks already fixed.

**This is a distinct workstream, not security.** It should be done with a working local DB (`docker-compose.test.yml`) after Part A (`npm ci`) so it can iterate without slow CI round-trips. Fixing root cause #1 alone should recover a large fraction of the 183.

**Verified fixed under this effort (green in CI):** AccountLockoutService, BrandingService, StepService, LifecycleHookService unit tests; the CI pipeline split (tests run independently of lint/typecheck); the `db:seed` `api_keys.name` bug; the `SESSION_SECRET` length bug; and the oauth2.client-credentials `safeFetch` mock.

## Related
- Follow-up to SEC-020..033 (Express route security remediation). The type/CI issues are independent of those fixes but were masking whether they had any test coverage.
