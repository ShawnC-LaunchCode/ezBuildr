# DataVault Autonumber — Tickets (DVA-1..2)

Supersedes **RCF-5** in `tickets/RUNNER_COMPLETION_FAILURES_TICKETS.md`.

## Audit (2026-07-20)

**Scope:** the DataVault "autonumber" feature end to end — column creation,
row-value generation, storage, display, and the SQL/schema backing it.

**Method:** read the generation service/repository, both SQL functions, the
schema, the client column-type UI and row-add paths, and the failing test
`tests/integration/workflows/runtime-pipelines.test.ts:267`.

**Grade: D.** The feature is three half-built mechanisms that don't line up:

1. **`autonumber` (the "v4" type)** — a correct, sequence-backed generator with
   prefix / zero-padding / yearly-reset, implemented in
   `migrations/0002_db_functions.sql` `datavault_get_next_autonumber` (lines
   30-71) and `DatavaultRowsRepository.getNextAutonumber`
   (`server/repositories/DatavaultRowsRepository.ts:398`). **It is not exposed
   in the client UI at all** — no column-creation path offers it (grep for
   `autonumber` under `client/src` returns nothing). Dead from a user's view.
2. **`auto_number` (the legacy type)** — the *only* type a user can pick
   (`client/src/components/datavault/CreateTableModal.tsx:206`). Its server
   generator `datavault_get_next_auto_number` (`migrations/0002_db_functions.sql:86-100`)
   is a **stub that always returns `1`**, and its client grid-add path computes
   `maxValue + 1` **on the client** (`client/src/components/datavault/EditableDataGrid.tsx:164-181`)
   — a race/reuse data-integrity bug independent of the stub.
3. **`datavault_number_sequences` table** (`shared/schema/datavault.ts:135-151`)
   — a proper per-column counter row (`next_value`, `prefix`, `padding`,
   `reset_policy`), but **nothing generates from it**; it is only copied during
   cloning (`server/services/WorkflowClonerService.ts:1290-1314`).

Net effect: the pickable type is broken and self-inconsistent (stub returns
`1`, client computes `maxValue+1`), the correct generator is unreachable, and a
purpose-built counter table sits unused. `runtime-pipelines.test.ts:267` fails
because the stub returns `1` for every row, so a second insert collides on the
unique/PK auto-number column and the row count never increments.

**Product decision (Shawn, 2026-07-20):** collapse to ONE autonumber type,
plain integer, server-generated from a real per-column counter, **no yearly
reset** (that was the overkill). Prefix/zero-padding display formatting is a
**phase-two, optional** follow-up (DVA-2), not in scope for DVA-1. No existing
production autonumber data to migrate.

---

## How to work this document

Load these project skills before touching code (named again per ticket):
`db-schema-change` (any schema/migration/SQL-function reasoning),
`add-api-endpoint` (service/repository pattern + error contract),
`run-tests` (the 3-project Vitest split; naive `npm test` gives wrong results),
`verify` (proving against the live app), and the `test-runner` agent for test
runs. Do not commit or stage anything — the reviewer (Senior) controls commits.

---

## DVA-1 — Single integer autonumber, generated from `datavault_number_sequences`

**Priority: P1** (fixes a live data-integrity bug + a failing test). **Size: M.**
**Status: 🔲 open.**

### Finding
The pickable `auto_number` type never produces correct values (server stub
returns `1`; client computes `maxValue+1`), and the correct generator is a
different, UI-unreachable type. See the audit above for the three mechanisms
and exact `file:line` evidence.

### Preferred fix (the chosen design — do not invent an alternative)

Make `auto_number` the single surviving type and generate its value from the
existing `datavault_number_sequences` table, transactionally. Keep the type
name `auto_number` (it is already wired through ~8 client files, the enum, and
dev data — minimal churn). Leave the `autonumber` enum value dormant (Postgres
cannot cleanly drop an enum value; do **not** attempt to).

1. **Generation (server, the core change).** In the row-insert transaction
   (`server/services/DatavaultRowsService.ts:227-252`), replace the two
   branches (`auto_number` stub call + unreachable `autonumber` branch) with a
   single `auto_number` branch that:
   - locks/reads the column's counter row:
     `SELECT next_value FROM datavault_number_sequences WHERE tenant_id=… AND table_id=… AND column_id=… FOR UPDATE` (within the caller's `tx`);
   - if no row exists, insert one seeded from `column.autoNumberStart ?? 1`
     (handle the missing-row case — columns created before this change, or via
     paths that never made a counter row, must still work; an
     `INSERT … ON CONFLICT (tenant_id,table_id,column_id) DO NOTHING` then
     `SELECT … FOR UPDATE`, or an upsert-returning, is fine);
   - uses `next_value` as the cell value (**integer**, stored in the
     `datavault_values.value` jsonb as a number), then
     `UPDATE … SET next_value = next_value + 1, updated_at = now()`.
   The `FOR UPDATE` row lock is what makes this race-safe (this is the same
   boundary pattern as `StepValueRepository.assertRunsMutable`). Do **not**
   read `MAX()` of existing values, and do **not** create Postgres `SEQUENCE`
   objects. Put the DB work in a new/renamed method on
   `DatavaultRowsRepository` (replace `getNextAutoNumber` at line 363; delete
   `getNextAutonumber` at 398 and its call site).

2. **Counter row lifecycle.**
   - Create the counter row when an `auto_number` column is created
     (`DatavaultColumnsService` column-create path — find it near
     `deleteColumn` at `server/services/DatavaultColumnsService.ts:427`),
     seeded from `autoNumberStart`. (Generation must still self-heal a missing
     row per step 1, but the create path is the normal case.)
   - Delete-column cleanup: the counter row is `ON DELETE CASCADE` on
     `column_id` (`shared/schema/datavault.ts:139`), so the manual
     `cleanupAutoNumberSequence` call at `DatavaultColumnsService.ts:446` and
     the no-op `datavault_cleanup_sequence` SQL function it calls
     (`DatavaultRowsRepository.ts:446`) are now redundant — remove that call and
     the repo method. (Leave the dead SQL function in the migration; removing it
     needs DDL and is optional cleanup, noted in DVA-2.)

3. **Kill client-side generation.** In
   `client/src/components/datavault/EditableDataGrid.tsx:164-181`, remove the
   `maxValue + 1` pre-fill. Grid row-add must omit the `auto_number` value and
   let the server assign it, mirroring the row-editor add path
   (`client/src/components/datavault/RowEditorModal.tsx:72-77`), then rely on
   the existing refetch to display the server-assigned value. Keep the cells
   read-only (`EditableDataGrid.tsx:380,431-433`). `AddRowButton.tsx:47,80`
   already omits the value server-side — verify it still works, no change
   expected.

4. **No new DDL / no migration file.** `datavault_number_sequences` already
   exists in the baseline schema; this ticket only changes application code +
   uses that table. Do not add a migration. (If you believe DDL is unavoidable,
   STOP and flag it — that would be a scope change.) The dormant
   `autonumberPrefix/Padding/ResetPolicy` columns on `datavault_columns` and the
   dead SQL functions are left in place for DVA-2.

### Ties
- **Supersedes RCF-5** in `tickets/RUNNER_COMPLETION_FAILURES_TICKETS.md` — that
  ticket's failing test is the acceptance gate here.
- Skills: `db-schema-change`, `add-api-endpoint`, `run-tests`, `verify`.
- File footprint (server, then client — no overlap with other in-flight work):
  `DatavaultRowsService.ts`, `DatavaultRowsRepository.ts`,
  `DatavaultColumnsService.ts`; `EditableDataGrid.tsx` (+ verify
  `RowEditorModal.tsx`, `AddRowButton.tsx`). Single dev, sequential within the
  ticket. No dependency on the concurrent `server/index.ts` Swagger work.
- Execution order: server generation + counter lifecycle first (makes the
  failing test pass), client grid change second.

### Acceptance criteria
1. Adding two rows to a table with an `auto_number` column yields **distinct,
   increasing integer** values (e.g. seeded start `1` → `1`, `2`), via the
   server, in the insert transaction — verified by a new/updated integration
   test under the `integration` Vitest project.
2. `tests/integration/workflows/runtime-pipelines.test.ts:267` (`should execute
   writebacks via RunService.completeRun()`) **passes** — the row-count
   assertion now holds because generated values are distinct.
3. The `auto_number` counter seeds from `column.autoNumberStart` and generation
   self-heals if the counter row is missing (test the missing-row path).
4. Deleting an `auto_number` column removes its counter row via CASCADE (no
   manual cleanup call remains); a test or explicit verification confirms no
   orphaned `datavault_number_sequences` row.
5. Client grid add no longer computes `maxValue+1`; the value is server-assigned
   and displayed after refetch (verify live per the `verify` skill — attach
   evidence: a screenshot or network capture of a grid add showing the
   server-assigned number).
6. The unreachable `autonumber` generation path (`getNextAutonumber`, the
   `autonumber` service branch) is deleted; no dead references remain.
7. Gates green and captured in the turn-in: `npx tsc --noEmit` (0 errors),
   `eslint` clean on every touched file, and the relevant Vitest project(s)
   pass. Leave the shared tree gate-clean.

---

## DVA-2 — (Deferred, pickup-ready) Optional prefix + zero-padding display

**Priority: P3 / enhancement.** **Size: M.** **Status: 🟦 deferred — build when a
real invoice-style-ID requirement exists. Design locked below so pickup is fast.**

### Why deferred (decision, 2026-07-20)
DVA-1 stores a plain integer, so this formatting layer is **purely additive** —
no data migration, no storage change, no rework needed to add it later. Building
it now would be speculative (no concrete customer requirement to shape it) into a
document-correctness-sensitive path, right after yearly-reset was cut as overkill.
So it waits for a real need; the design is fixed here so it doesn't get
re-litigated and so DVA-1's integer storage remains the correct foundation.

### Locked design (do not re-litigate on pickup)
- **Integer stays canonical.** The stored `datavault_values.value` remains the raw
  integer DVA-1 generates. Prefix/zero-padding is a **presentation concern applied
  on read**, never stored. This keeps sort/filter numerically correct and means
  changing a column's format never rewrites historical rows (an issued ID should
  not retroactively change).
- **Config home:** `datavault_columns.autonumberPrefix` + `autonumberPadding`
  (`shared/schema/datavault.ts:94-95`) — these already exist; they become live
  (they are NOT dropped). Add column-config UI to set them
  (`client/src/components/datavault/CreateTableModal.tsx` and any column editor).
- **Format spec:** `{prefix}{'-' if prefix}{zeroPad(value, padding)}` → e.g.
  prefix `INV`, padding `4`, value `1` ⇒ `INV-0001`; empty prefix, padding `1`
  ⇒ `1`. Define this ONCE as a shared helper and apply it in all read consumers.
- **Read consumers to format (all three, or documents/grid disagree):**
  1. Document/workflow variable surface — `ReadTableBlockRunner` builds `rowData`
     from the raw value at `server/services/blockRunners/ReadTableBlockRunner.ts:133`.
  2. Grid cell display — `client/src/components/datavault/CellRenderer.tsx:54-55`.
  3. Row editor display — `client/src/components/datavault/RowEditorModal.tsx`.
  Prefer a single server-side formatter surfaced on the row read so the client
  and the document path consume one source of truth (avoids a JS/SQL formatter
  drift); the client CellRenderer then just displays it. Confirm the exact shape
  against the row-read API when picking this up.
- **Known accepted limitation:** `read_table` filters compare against the stored
  integer, so an `equals "INV-0001"` filter won't match. Autonumber filters are
  rare; document it rather than special-casing.

### Fold in the dead-code cleanup (only when this ships)
This is the migration that should also remove the now-dead artifacts, so the DB
is touched once, not twice — and only `resetPolicy`/enum are dropped, NOT
prefix/padding (this feature uses those):
- Drop the three unused SQL functions: `datavault_get_next_autonumber`,
  `datavault_get_next_auto_number`, `datavault_cleanup_sequence`
  (`migrations/0002_db_functions.sql`; zero production callers after DVA-1 —
  only historical one-offs under `scripts/` reference them).
- Optionally drop `autonumberResetPolicy` (+ the `autonumber_reset_policy` enum)
  and the dormant `autonumber` value in `datavaultColumnTypeEnum` — note that
  removing a pgEnum value requires recreating the type; weigh that cost, it may
  not be worth it. Follow the `db-schema-change` skill.

Not in scope until a real requirement exists.

---

## Status

| ID | Finding | State |
|---|---|---|
| DVA-1 | Single integer autonumber from `datavault_number_sequences` | ✅ **DONE** 2026-07-20 (committed `ae2004c3`; full integration suite 835/0) |
| DVA-2 | Optional prefix/padding display formatting (+ dead-code/DDL cleanup folded in) | 🟦 deferred, design-locked & pickup-ready (build on real invoice-ID need) |
