---
name: run-tests
description: Run, write, or debug tests in ezBuildr. Running npm test or vitest directly WILL produce wrong results here — the suite is split into 3 Vitest projects with separate commands and database setup, and some tests fail locally by design. TRIGGER this skill when the user asks to run tests (full suite, unit, integration, or one file), wants to verify a change or refactor didn't break anything, wants tests run before pushing a branch, reports a test failing, timing out, hanging, or flaky (especially passes-in-CI-but-fails-locally), or asks to write a new test that will then be executed. Also trigger when you decide on your own to run tests to validate code you changed. DO NOT TRIGGER for lint/typecheck-only work, load/performance testing, or tasks where no test will actually be run.
---

# Running Tests in ezBuildr

## The 3 Vitest projects (defined in `vitest.config.ts`)

| Project | Files | DB? | Setup file | Time | Command |
|---|---|---|---|---|---|
| `unit-fast` | ~85 files in `tests/unit/` | No (mocked) | `tests/setup-fast.ts` | ~13s | `npm run test:fast` |
| `unit-db` | the files listed in `dbUnitTests` in vitest.config.ts — **17** as of 2026-08-12, not 4; read the array, don't trust a count here | Real PG | `tests/setup.ts` | ~75s | `npm run test:unit:db` |
| `integration` | `tests/integration/` | Real PG | `tests/setup.ts` | minutes | `npm run test:integration` |

## Which command to run

- **Default sanity check after a change:** `npm run test:fast` — fast, no DB needed.
- **Single file:** `npx vitest run --project unit-fast tests/unit/path/to.test.ts` (pick the project the file belongs to — a `tests/integration/` file needs `--project integration` and a DB).
- **Full unit:** `npm run test:unit` (unit-fast + unit-db, needs DB).
- **Everything:** `npm test` (runs with `VITEST_SINGLE_FORK=true` + coverage — slow but 100% reliable; this is what CI uses).
- Also run `npx tsc --noEmit` for type safety — tests passing does not imply the build compiles.

## ⚠️ `test:docker:up` starts more than Postgres — re-run it after every pull

`docker-compose.test.yml` defines **two** services: `postgres` (host port **5434**) and
**`gotenberg`** (`gotenberg/gotenberg:8`, host port **3009**), the latter required by the
real PDF-fidelity tests. `npm run test:docker:up` starts what the compose file defines *at
the moment you run it* — a container set from earlier keeps running and never tells you a
service was added.

Getting this wrong cost real time on 2026-08-12: with only Postgres up, `test:integration`
reported **10 failed files / 5 failed tests / 35 skipped**, and only two failures mentioned
PDFs. Seven unrelated suites (`analytics_service`, `api.runs.first-next`,
`api.runs.resume-handoff`, `api.portal.run-access`, `dynamic_options_workflow`,
`organizations-workflow`, `transferOwnership`) failed with a bare
`AssertionError: expected 500 to be 200`, because run completion calls document generation,
which could not reach the converter. With `gotenberg` up, the same commit is 112/112 green.

**So: read the port in `ECONNREFUSED`, don't assume.** `5434` is Postgres; **`3009` is
Gotenberg**. The Postgres container can be `Up (healthy)` the whole time, so the usual
container check passes and proves nothing.

```bash
git diff <base>..HEAD -- docker-compose.test.yml    # after any merge or pull
npm run test:docker:up                              # adds services you are missing
docker compose -f docker-compose.test.yml ps        # confirm BOTH, not just PG
```

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
- **There are no known integration failures, and no skipped tests.** Measured 2026-08-12
  with **both** compose services up: `Test Files 112 passed (112)` · `Tests 1116 passed
  (1116)` — zero failed, zero skipped. **Treat any integration failure as your regression**
  — but first confirm `gotenberg` is running (see the compose warning above), because a
  missing service produces failures that read like code defects.

  This is a change in kind, not just in number. For months the suite carried 10 failures
  and reviewers certified work with "matches the documented baseline" — weak evidence,
  because two of the red files were *template* suites, blind to regressions in the area
  then under active change. There is no baseline to hide in now. Cleared across G171-5
  (`cc427d65`), G171-6 (`150e3148`) and `0f70b6c6`/`af69bdea`.

  Other projects on the same commit: `test:fast` **3190 passed / 0 failed** (273 files +
  1 skipped) · `test:unit:db` **17 files / 158 passed**. Recorded counts drift: this file
  said `test:fast` was 3113 while a re-measurement on the same commit gave **3116**, so
  re-measure your own base before blaming a change. A count that moves *down* is still a
  stop condition.

- **`unresolved_variables` works now — the warning that used to sit here is resolved.**
  It was *structurally* always `[]` (normalization collapsed the seeded null to `''`
  before `nullGetter`, which only fires for null/undefined, could record it). Fixed
  2026-08-12 in `f99110d4`: the *names* of unanswered variables travel to the renderer
  instead of their nulls, so no generated document changed. Guarded end-to-end by
  `tests/integration/docs.autogeneration.test.ts` — which holds **two** DOC-104 cases that
  must not be collapsed into one, an unanswered-but-known variable (blank + recorded) and
  an unknown tag (raises, document fails) — plus a no-DB companion at
  `tests/unit/services/EnhancedDocumentEngine.unresolvedVariables.test.ts`.

  The lesson that outlived it: `tests/unit/services/FinalBlockRenderer.test.ts:58`
  hardcodes `unresolvedVariables: ["missingField"]` inside a mock of the engine, so it
  asserted its own fixture and could not detect a feature that never worked. That is why
  this went unnoticed for months. Treat any test that mocks the thing it claims to verify
  with the same suspicion.
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
