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

## Status

| ID | Finding | Failing test(s) | State |
|---|---|---|---|
| — | retry query assigned interval to timestamptz column | run-completion-outbox (backoff/dead-letter) | ✅ **FIXED** `1310f9e7` |
| RCF-1 | concurrent claim double-delivers (4 claims for 2 jobs) | run-completion-outbox | 🔲 open |
| RCF-2 | stale-lease reclaim returns a row before the lease expires | run-completion-outbox | 🔲 open |
| RCF-3 | completed-run immutability tests time out (300s) | api.runs.completed-immutability | 🔲 open |
| RCF-4 | generationStatus never reaches 'failed' (legacy templates) | runner-hardening-run13 | 🔲 open |
| RCF-5 | DataVault legacy auto_number row assertion fails | workflows/runtime-pipelines | 🔲 open |

---

## RCF-1 — `claimBatch` double-delivers under concurrency 🔲

**File:** `server/repositories/RunCompletionJobRepository.ts:100-158` (`claimBatch`)
**Test:** `tests/integration/run-completion-outbox.test.ts:99-115` — "allows
concurrent workers to claim jobs without duplicate delivery"

### Finding
Two jobs are enqueued, then two workers each `claimBatch({ limit: 2 })` inside
`Promise.all`. The test expects the two jobs claimed **once total** (`length 2`,
2 unique ids). Actual: **4** — both workers claim both jobs.

`claimBatch` runs in a real transaction (`this.transaction` → `db.transaction`)
and the candidate SELECT uses `.for('update', { skipLocked: true })`, which
*should* make a concurrent worker skip the locked rows. It doesn't hold.

### Diagnosis (unresolved — needs a decision)
The "4" result cannot be reconciled with the code analytically:
- With a real txn + `FOR UPDATE SKIP LOCKED` and >1 pool connection, the second
  worker should skip the locked rows → total 2.
- Serialized on a size-1 pool, the first worker commits (rows → processing,
  future lease) before the second's SELECT → second finds nothing → total 2.

Getting 4 implies the two "concurrent" transactions are **not isolating**
(neither sees the other's row locks, and both UPDATEs by id succeed). That
points at **test-harness transaction behaviour** (the size-1 test pool + how
`db.transaction` runs under `Promise.all`) as much as at the code.

Two candidate fixes, gated on the open question below:
1. **Code hardening (correct regardless):** re-assert the claimability predicate
   in the UPDATE's `WHERE` (not just `inArray(id, …)`), so a second worker's
   UPDATE matches zero rows once the first has flipped status/lease. *(Tried
   during review; did not flip this test — reverted, because it didn't achieve
   the outcome against this harness. Keep as a real improvement anyway.)*
2. **Single-statement claim:** `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
   LOCKED LIMIT n) RETURNING *` — the canonical Postgres queue-claim, removing
   the SELECT-then-UPDATE gap.

### OPEN QUESTION (this is old "Q2", in plain terms)
**Is this test meant to pass against the local test setup as-is?** The test
simulates two workers grabbing jobs *at the same instant*. But the test database
uses a **single shared connection** (pool size 1), so two things that are
supposed to happen "simultaneously" actually take turns. `SKIP LOCKED` — the
Postgres feature that stops two real workers from grabbing the same job — can
only be exercised with genuinely parallel connections. So the failure may be
the **test asking for parallelism the harness can't provide**, not the
production code being wrong. Decision needed: fix the production claim to be
provably safe (fix #1/#2 above) *and* adjust the test to run on real parallel
connections — or accept that this scenario is only verifiable in a different
environment.

---

## RCF-2 — stale-lease reclaim returns a row before expiry 🔲

**File:** `server/repositories/RunCompletionJobRepository.ts:100-158` (`claimBatch`)
**Test:** `tests/integration/run-completion-outbox.test.ts:117-144` — "reclaims a
stale lease after a worker crashes"

### Finding
A job is claimed with a 1000ms lease at `claimedAt`. A second claim at
`claimedAt + 999ms` (lease **not** yet expired) is expected to return `[]`
(`beforeExpiry`), then a claim at `claimedAt + 1000ms` should reclaim it.
Actual: the `beforeExpiry` claim **returns the row** — the lease-expiry guard
isn't holding it back.

### Diagnosis (unresolved)
The candidate predicate for a leased row is
`status = 'processing' AND leaseExpiresAt <= now`. At `claimedAt + 999`, with
`leaseExpiresAt = claimedAt + 1000`, that's `1000 <= 999` → false, so the row
should be excluded. Two possibilities to investigate together:
- the first claim did not actually transition the row (so it's still `pending`
  and matches), or
- a timing/precision issue in how `now`/`leaseExpiresAt` are compared.

Likely shares a root cause with RCF-1 (both are `claimBatch` behaviour under the
test harness). Investigate the two together; instrument the row state between
the claims.

---

## RCF-3 — completed-run immutability tests time out 🔲

**File:** completion pipeline (`server/services/workflow-runs/RunCompletionService.ts`,
`RunCompletionJobWorker.ts`) + `tests/integration/api.runs.completed-immutability.test.ts:76,151`

### Finding
Both cases ("single creator autosave" / "bulk run-token autosave" crossing an
in-flight completion boundary) **time out** — a 300s `beforeAll`/hook timeout
and a 30s test timeout. The completion flow appears to hang rather than assert.

### Diagnosis (unresolved)
The `available_at` fix (`1310f9e7`) removed one hard throw in the retry path but
did **not** resolve these timeouts, so the completion worker/loop is stalling
for another reason (waiting on a job that never completes, a poll that never
terminates, or a lease that never releases — possibly downstream of RCF-1/2).
Needs the IRO completion design to trace safely.

---

## RCF-4 — generationStatus never reaches 'failed' for legacy templates 🔲

**File:** document-generation completion path + `tests/integration/runner-hardening-run13.test.ts:151,199`
(`waitForGenerationStatus`)

### Finding
RUN-12 cases (creator completion and no-auth/run-token completion must fail
legacy cross-project templates "as not found" without rendering) **time out
waiting for `generationStatus` to reach a `failed` prefix**. The status never
transitions, so the poller times out.

### Diagnosis (unresolved)
Either the completion no longer sets `generationStatus` on this legacy path, or
it's gated behind the completion worker that's stalling (see RCF-3). Trace the
`generationStatus` writes on the legacy-template failure path.

---

## RCF-5 — DataVault legacy `auto_number` row assertion fails 🔲

**File:** `tests/integration/workflows/runtime-pipelines.test.ts:267` +
`server/repositories/DatavaultRowsRepository.ts:363` (`getNextAutoNumber`) +
`migrations/0002_db_functions.sql`

### Finding
The pipeline test expects `initialCount + 1` rows after an insert; the assertion
fails (row count / uniqueness off).

### Diagnosis + OPEN QUESTION (this is old "Q3", in plain terms)
The legacy `auto_number` column type is served by the SQL function
`datavault_get_next_auto_number(table, column, start)`, which is a **stub that
always returns `1`** — it was carried verbatim from `tests/setup.ts` into
`migrations/0002_db_functions.sql` (documented there as a pre-existing gap) so
behaviour wouldn't change during the reconciliation. Because it always returns
the same number, two rows in a table with a legacy `auto_number` column get the
**same** value, which can violate a uniqueness expectation and throw off the
row-count assertion.

**Plain-English question:** the *newer* `autonumber` column type works correctly
(real generator with prefix/padding/yearly reset). The *older* `auto_number`
type has only ever had a placeholder that returns `1` — it has never actually
auto-numbered. **Do we (a) write a real implementation for the legacy type, or
(b) is `auto_number` deprecated/unused in real workflows**, in which case the
test should stop exercising it (or migrate those columns to `autonumber`)?
Answering this decides whether RCF-5 is a code fix or a test/data change.

---

## Suggested next-conversation kickoff
Confirm whether the IRO initiative's original ticket file still exists in the
other IDE (reconcile with this doc), then work RCF-1..5 with the IRO
completion/lease/autonumber design in hand. RCF-1 and RCF-2 are one investigation
(`claimBatch` under the harness); RCF-3 and RCF-4 likely chain off the completion
worker; RCF-5 is a standalone product decision (legacy autonumber).
