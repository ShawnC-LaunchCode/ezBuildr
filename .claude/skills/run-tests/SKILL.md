---
name: run-tests
description: Run, write, or debug tests in ezBuildr. Running npm test or vitest directly WILL produce wrong results here — the suite is split into 3 Vitest projects with separate commands and database setup, and some tests fail locally by design. TRIGGER this skill when the user asks to run tests (full suite, unit, integration, or one file), wants to verify a change or refactor didn't break anything, wants tests run before pushing a branch, reports a test failing, timing out, hanging, or flaky (especially passes-in-CI-but-fails-locally), or asks to write a new test that will then be executed. Also trigger when you decide on your own to run tests to validate code you changed. DO NOT TRIGGER for lint/typecheck-only work, load/performance testing, or tasks where no test will actually be run.
---

# Running Tests in ezBuildr

## The 3 Vitest projects (defined in `vitest.config.ts`)

| Project | Files | DB? | Setup file | Time | Command |
|---|---|---|---|---|---|
| `unit-fast` | ~85 files in `tests/unit/` | No (mocked) | `tests/setup-fast.ts` | ~13s | `npm run test:fast` |
| `unit-db` | 4 files listed in `dbUnitTests` in vitest.config.ts | Real PG | `tests/setup.ts` | ~75s | `npm run test:unit:db` |
| `integration` | `tests/integration/` | Real PG | `tests/setup.ts` | minutes | `npm run test:integration` |

## Which command to run

- **Default sanity check after a change:** `npm run test:fast` — fast, no DB needed.
- **Single file:** `npx vitest run --project unit-fast tests/unit/path/to.test.ts` (pick the project the file belongs to — a `tests/integration/` file needs `--project integration` and a DB).
- **Full unit:** `npm run test:unit` (unit-fast + unit-db, needs DB).
- **Everything:** `npm test` (runs with `VITEST_SINGLE_FORK=true` + coverage — slow but 100% reliable; this is what CI uses).
- Also run `npx tsc --noEmit` for type safety — tests passing does not imply the build compiles.

## Database for unit-db / integration tests

Tests honor `TEST_DATABASE_URL` (overrides `DATABASE_URL`, see `tests/setup.ts:37`). Local Docker PG (tmpfs, fast):

```bash
npm run test:docker:up    # postgres:16 on port 5434
# then: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/ezbuildr_test
npm run test:docker:down
```

`tests/setup.ts` creates one **isolated Postgres schema per worker** and applies `migrations/*.sql` manually (now a single compacted `0000_init_baseline.sql`; hardcoded drift failsafes remain around lines 230-274). Schemas are reused between files by design — don't "fix" that.

## Known failures that are NOT your regression

Check these before debugging:

- (RESOLVED 2026-07-14) `js_helpers.test.ts` used to be a known local failure; it is now green locally (the vm fallback executes JS, and its auth-mock bug was fixed). Treat any js_helpers failure as a real regression.
- `excludedIntegrationTests` in `vitest.config.ts` now only excludes `*.real.test.ts` (needs real external credentials). The full integration project runs 744/744 locally against Docker PG on 5434.
- Flaky parallel runs: re-run with `VITEST_SINGLE_FORK=true` before concluding a test is broken.

## Gotchas

- **Shared BaseRepository mock:** `vi.mock` of a repository module shares ONE `findById` mock across all repo singletons (they all extend `BaseRepository`). Dispatch inside the mock implementation by the `id` argument instead of creating per-repo mocks.
- Vitest 4: `minWorkers` is removed; projects with different `maxWorkers` need unique `sequence.groupOrder`.
- The `--exclude` CLI flag is unreliable with globs — add exclusions in `vitest.config.ts` instead.
- Coverage thresholds exist but are very low (5% lines) — don't chase them.
- In git worktrees: `node_modules/@types` needs a junction back to the main checkout for `tsc` to work, and the pre-commit hook runs repo-wide `tsc` that fails on pre-existing errors unrelated to your change.
- `tests/setup-fast.ts` pre-mocks `express-session`, sendgrid, and all AI SDKs — a unit-fast test never needs (and must not add) real network/DB access.

## Integration test authoring idioms

- Bootstrap: `setupIntegrationTest()` from `tests/helpers/integrationTestHelper.ts` returns `{ app, baseURL, tenantId, authToken, ... }`; it registers routes and creates a real user via `POST /api/auth/register`.
- HTTP calls: `createAuthenticatedAgent(baseURL, authToken)` (supertest wrapper).
- Data: `TestFactory` from `tests/helpers/testFactory.ts`, ideally inside `runInTransaction` from `tests/helpers/testTransaction.ts` for auto-rollback.
