# Runner/IRO — Integration Test Failure Findings (RCF-1..5)

Source: surfaced while verifying the migration-baseline reconciliation
(2026-07-19). After the chain was regenerated, the full integration suite ran
green on fresh `_v6` schemas **except** 8 failures across 4 files — all in the
Interview Runner Optimization (IRO) initiative's code/tests.

> **⚠️ File-provenance note.** These findings were meant to go into
> `docs/features/INTERVIEW_RUNNER_OPTIMIZATION_TICKETS.md`, but that file was
> **never committed** (it was untracked during review) and is now absent from
> the working tree — likely removed by the concurrent IDE/process that owns the
> IRO initiative. This is a **standalone findings doc** so the follow-up
> conversation is self-contained; reconcile it with the original IRO ticket
> file if that copy still exists in the other IDE.

**Not migration-caused.** The reconciliation was ruled out as the cause:
`run_completion_jobs` DDL is byte-identical old-vs-new, and `db:generate`
reports the baseline matches the schema exactly. These are pre-existing IRO
feature/test bugs that the regenerated (failsafe-free) test schema simply
stopped masking.

**2026-07-19 follow-up session (original engineer became unavailable):**
RCF-1, RCF-2, RCF-3, and RCF-4 are fixed and verified — the full
`npm run test:integration` suite (838 tests) now has exactly **one** failing
test, RCF-5's known `runtime-pipelines` case, which awaits a product decision
(unchanged). Two extra bugs were found and fixed along the way:
`tests/integration/api-docs.test.ts` imported the production entrypoint with
real side effects, and `docs.routes.ts` had a self-redirect on `/api-docs/`
(see RCF-3 §root cause #3 below).

## Status

| ID | Finding | Failing test(s) | State |
|---|---|---|---|
| — | retry query assigned interval to timestamptz column | run-completion-outbox (backoff/dead-letter) | ✅ **FIXED** `1310f9e7` |
| RCF-1 | concurrent claim double-delivers (4 claims for 2 jobs) | run-completion-outbox | ✅ **FIXED** 2026-07-19 |
| RCF-2 | stale-lease reclaim returns a row before the lease expires | run-completion-outbox | ✅ **FIXED** 2026-07-19 |
| RCF-3 | completed-run immutability tests time out | api.runs.completed-immutability | ✅ **FIXED** 2026-07-19 — self-deadlock fixed + racing cases rewritten at the service layer (Option 1, approved by Shawn); green in 2 consecutive full-suite runs |
| RCF-4 | generationStatus never reaches 'failed' (legacy templates) | runner-hardening-run13 | ✅ **FIXED** 2026-07-19 |
| RCF-5 | DataVault legacy auto_number row assertion fails | workflows/runtime-pipelines | 🔲 open — product decision needed |
| — | `api-docs.test.ts` bootstraps the real production server as a side effect | api-docs (passing, but corrupting shared state) | ✅ **FIXED** 2026-07-19 (found during RCF-3 investigation) |

---

## RCF-1 — `claimBatch` double-delivers under concurrency ✅ FIXED

**File:** `server/repositories/RunCompletionJobRepository.ts:100-158` (`claimBatch`)
**Test:** `tests/integration/run-completion-outbox.test.ts` — "allows
concurrent workers to claim jobs without duplicate delivery"

### Root cause — NOT a code bug
`claimBatch` and its `FOR UPDATE SKIP LOCKED` claim logic are correct: added
temporary instrumentation and confirmed worker A and worker B always claimed
**disjoint, non-overlapping row IDs** — never the same row twice. The "4
claims for 2 jobs" was real, but the 4 claimed rows were **not** the 2 jobs
this test enqueued — they included **leftover `pending` rows from two earlier
tests in the same file** (`commits completion...`, `deduplicates enqueue...`)
that create jobs but never claim them. `claimBatch` is deliberately a global,
unscoped queue claim (no `runId` filter — a real worker drains the whole
table), so with `limit: 2` per worker and 3 leftover + 2 fresh pending rows
sitting in the table, two workers legitimately claiming up to 2 rows each
add up to 4 — all distinct, correctly claimed once.

### Fix
Added a `beforeEach` in `tests/integration/run-completion-outbox.test.ts` that
truncates `run_completion_jobs` before every test, so each test's claim
assertions only ever see the rows it created itself.

### Verified
`npx vitest run --project integration tests/integration/run-completion-outbox.test.ts`
→ 5/5 pass, repeated 7+ times with no flakes. Also green across 3 full
`npm run test:integration` runs (838 tests) with no `run-completion-outbox`
failures.

---

## RCF-2 — stale-lease reclaim returns a row before expiry ✅ FIXED

**File:** same as RCF-1 — same fix, same root cause.

### Root cause — NOT a code bug
The lease-expiry guard in `claimBatch` (`status = 'processing' AND
leaseExpiresAt <= now`) works correctly. The `beforeExpiry` claim (`limit: 1`)
was matching a **different, leftover `pending` row** from an earlier test —
not the row under lease at all — because `claimBatch`'s `ORDER BY availableAt,
createdAt ASC` picks the *oldest* claimable row, and the leftover rows from
the two upstream tests were older than this test's own row. The real
lease-expiry boundary (1ms precision) was never actually exercised incorrectly;
it was masked by unrelated rows satisfying the query first.

### Fix
Same `beforeEach` truncation as RCF-1 (one fix, one root cause, two symptoms).

### Verified
Same run as RCF-1 — `reclaims a stale lease after a worker crashes` passes
deterministically now (confirmed via temporary instrumentation that the
claimed row IDs and attempt counts match exactly what the test expects).

---

## RCF-3 — completed-run immutability tests time out ✅ FIXED

**File:** `tests/integration/api.runs.completed-immutability.test.ts`,
`server/repositories/StepValueRepository.ts` (`assertRunsMutable`)

### Root cause #1 (FIXED) — the test deadlocked against itself
The test pauses `WorkflowRunRepository.markComplete` mid-transaction (via
`vi.spyOn`) to simulate a write racing an in-flight completion, then — in the
**old** code — `await`ed the "late write" HTTP response *before* releasing the
pause. But the late write's completion check
(`StepValueRepository.assertRunsMutable`) is a real `SELECT ... FOR UPDATE` on
the run row, which correctly blocks on the still-open completion transaction's
row lock (`FOR NO KEY UPDATE`, held by the paused `markComplete`). The test was
waiting for a response that could only arrive after the very step (`releaseCompletion.resolve()`)
it hadn't reached yet — a genuine, 100%-reproducible self-deadlock, independent
of any other file or worker.

**Fix:** fire the late write, *then* release the pause, *then* `Promise.all`
both responses. Verified correct **and passing 10+ consecutive isolated runs**
— this is the real production locking design (`assertRunsMutable`) working
exactly as intended.

### Root cause #2 (FIXED) — orphaned mock cascades across tests
When a test in this file times out for any reason, vitest abandons its
in-flight promise **without cancelling it** — the `finally` block that calls
`markCompleteSpy.mockRestore()` never runs, leaving a stale spy permanently
installed on the shared `workflowRunRepository` singleton. Every later test
(in this file, and in any later file sharing the same worker process) that
calls `markComplete` inherits the zombie mock. Added
`afterEach(() => vi.restoreAllMocks())` so one bad test can't cascade into
guaranteed failures for the rest of the run.

### Root cause #3 (FIXED, separate bug) — `api-docs.test.ts` production-side-effect leak
`tests/integration/api-docs.test.ts` imported `server/index.ts` (the real
production entrypoint) just to get an `Express` `app` object. That import's
top-level side effects run unconditionally: `runCompletionJobWorker.start()`
(a real 5s-interval poller, `unref()`'d but never stopped), `initCronJobs()`,
and a real `server.listen({ port: 5000 })`. For the rest of that worker
process's test run, a real background job-claimer competes for the
single-connection test pool at unpredictable moments — directly relevant to
any timing-sensitive test sharing that worker. **Fixed:** rewrote the test to
mount only `registerDocsRoutes` on a throwaway `Express` app (no DB, no
server, no side effects) — `registerRoutes` already wires up docs via
`registerAllRoutes` → `registerDocsRoutes`, so the production entrypoint was
never actually needed here.

While fixing this, found and fixed a **real, previously-masked bug**: the
redirect route `router.get("/api-docs", ...)` in `server/routes/docs.routes.ts`
used Express's default non-strict routing, so it also matched `/api-docs/`
and redirected it to itself (a self-redirect loop) — the bug was invisible
because `server/index.ts` additionally mounts a second, plain Swagger UI route
inline (before `registerRoutes` runs) that always won the route match and
masked it. Fixed the redirect handler to check `req.path.endsWith('/')`
first. **The inline duplicate mount in `server/index.ts` is now flagged
separately as its own follow-up** (see spawned task) since it also means real
users never see the intended custom-titled/styled docs page in dev — out of
scope for this ticket file to fix inline.

### Root cause #4 (FIXED) — HTTP transport made the race unschedulable at full-suite scale
With the three fixes above, the test passed consistently in isolation and in
small multi-file combos, but **4 consecutive full `npm run test:integration`
runs still timed both `it.each` cases out identically**. Ruled out: pool size
(tested 1-4), any specific co-scheduled file, the mock-cascade, and the
`api-docs.test.ts` leak. The remaining variable was the HTTP transport itself:
under a full-suite worker's accumulated load, supertest/Express socket-accept
and routing scheduling reordered the steps of the orchestrated race
nondeterministically against the single-connection pool.

**Fix (Option 1, approved by Shawn 2026-07-19):** rewrote the two racing
cases to drive the service layer directly — `runService.completeRunNoAuth()`
raced against `runService.upsertStepValue()` / `bulkUpsertValuesNoAuth()` with
the same pause/release choreography on the `markComplete` spy, asserting the
late write rejects with `ApiError` code `RUN_COMPLETED` and persists nothing.
The race the boundary must win is between the two DB operations, which the
service layer exercises fully (including `assertRunsMutable`'s
`SELECT ... FOR UPDATE` on the bulk path); HTTP added only scheduling noise.
The HTTP contract (409 + `RUN_COMPLETED` body on completed-run writes) remains
covered by the two non-racing tests in the same file.

### Verified
- Isolation: 3/3 consecutive passes (4/4 tests in the file).
- Full suite: **2 consecutive `npm run test:integration` runs green** on the
  immutability file (834 passed / 1 failed each run — the sole failure being
  RCF-5's known `runtime-pipelines` case, below).
- `npx tsc --noEmit` 0 errors; eslint clean on the file.

---

## RCF-4 — generationStatus never reaches 'failed' for legacy templates ✅ FIXED

**File:** `tests/integration/runner-hardening-run13.test.ts`,
`server/services/workflow-runs/RunCompletionService.ts`

### Root cause — NOT a code bug
`RunCompletionService.complete()` only **enqueues** the `documents` completion
job (via the durable outbox); it never calls `generateDocuments` synchronously
(that changed with the IRO completion-outbox initiative — previously
completion triggered generation inline). Nothing in the integration test
harness ever starts `RunCompletionJobWorker` — only `server/index.ts`'s
production bootstrap does (`runCompletionJobWorker.start()`) — so the enqueued
job just sits `pending` forever within the test's 3s polling window. The
`generationStatus` write logic itself (`RunLifecycleService.generateDocumentsInner`'s
catch block, `updateGenerationStatus(runId, 'failed:...')`) was never broken.

### Fix
Added an explicit `await runCompletionJobWorker.processBatch()` call in both
RUN-12 tests right after triggering completion, so the enqueued `documents`
job is claimed and run in-process instead of waiting for a poller that was
never running.

### Verified
`npx vitest run --project integration tests/integration/runner-hardening-run13.test.ts`
→ 3/3 pass. Also green across all 4 full `npm run test:integration` runs.

---

## RCF-5 — DataVault legacy `auto_number` row assertion fails 🔲 open

**File:** `tests/integration/workflows/runtime-pipelines.test.ts:267` +
`server/repositories/DatavaultRowsRepository.ts:363` (`getNextAutoNumber`) +
`migrations/0002_db_functions.sql`

### Finding (unchanged from original diagnosis)
The legacy `auto_number` column type is served by the SQL function
`datavault_get_next_auto_number(table, column, start)`, which is a **stub that
always returns `1`** — carried verbatim from `tests/setup.ts` into
`migrations/0002_db_functions.sql`. Because it always returns the same number,
two rows in a table with a legacy `auto_number` column get the **same** value,
which throws off the row-count assertion in `runtime-pipelines.test.ts`.

**Confirmed still live/user-facing** (checked 2026-07-19): `auto_number` is
offered in `client/src/components/datavault/CreateTableModal.tsx`'s column-type
picker today — it is not a vestigial/unreachable type. Any user who creates a
legacy `auto_number` column and adds more than one row silently gets duplicate
numbers right now.

### OPEN QUESTION — needs Shawn's decision
The *newer* `autonumber` column type works correctly (real generator with
prefix/padding/yearly reset). The *older* `auto_number` type has only ever had
a placeholder that returns `1` — it has never actually auto-numbered, and this
is currently shipping, user-reachable, broken behavior. Options:
1. **Implement a real generator** for legacy `auto_number` (mirror the
   `autonumber` sequence-based approach, simpler since it has no
   prefix/padding/reset-policy config to account for).
2. **Deprecate `auto_number`** — remove it from `CreateTableModal`'s picker,
   migrate any existing legacy columns to `autonumber`, and change the test to
   stop exercising the removed type.
3. Leave it as a stub and just fix the **test** to stop asserting real
   auto-numbering for `auto_number` (documents the known gap, ships the bug).

This is a product/scope decision, not something to guess at — did not
implement a fix pending Shawn's answer.

---

## History

RCF-1, RCF-2, and RCF-4's original diagnoses (preserved below as of the
2026-07-19 handoff, before the follow-up session's investigation) speculated
these were test-harness/parallelism limitations similar to RCF-3/5. That
turned out to be wrong for RCF-1/2/4 — all three were real, fixable test bugs
(pollution and a missing worker in the harness), not harness limitations. Only
RCF-3 (partially) and RCF-5 turned out to need a harder call.

## Suggested next-conversation kickoff
Only RCF-5 remains: get Shawn's decision on the `auto_number` product question
(implement real generator / deprecate the type / document the gap in the test),
then implement it. The `server/index.ts` duplicate Swagger mount follow-up is
being worked in a separate session — not blocking.
