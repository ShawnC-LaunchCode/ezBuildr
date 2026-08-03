# DataVault — Hardening Tickets (DVH-1..3)

Source: the reviewer's closing assessment of the DataVault audit initiative,
2026-08-03, after all 14 of its tickets closed (`tickets/backlog/DATAVAULT.md`).

Scope: the items standing between DataVault's **B−** grade and a B+. They mostly
share one shape — **an invariant that holds only because every caller remembers to
go through the right service method, with no database backstop** — and each ticket
adds a layer that makes a future mistake impossible rather than merely unlikely.

**The file's original framing said "nothing here is broken." That was wrong**, and
the correction is load-bearing: reviewing DVH-2 before dispatch found that
`unarchiveRow` performs no uniqueness check at all, so a single user can put
duplicate values in a column flagged unique using three ordinary UI actions. DVH-2 is
a **P0 bug fix**, not hardening. See its Finding, part 1.

Findings were verified against `595c10b0`. **Line numbers are advisory** — the
locator is the quoted code and the named symbol; grep for those. A stale line
number is not a broken ticket.

**Baseline at file creation:** `test:fast` **2381**, `test:unit:db` 136,
`test:integration` **96 files / 1031 passed**, 0 failures. `tsc` 0 errors, lint
clean.

---

## How to work this document

- Each ticket has: **Finding**, **Preferred fix**, **Ties**, **Acceptance
  criteria** (all must pass).
- Load the project skills named in each ticket's Ties **before** touching code —
  `add-api-endpoint`, `db-schema-change`, `run-tests`, `verify`.
- **`npm test` naively gives wrong results here** — three Vitest projects with
  different commands and DB requirements. Use the `run-tests` skill.
- **Sweep the eight DataVault integration suites, not just the ones your ticket
  names.** The previous initiative committed a red test twice by scoping the sweep
  to a ticket's stated files: `datavault.routes`, `datavault.autonumber`,
  `datavault-v4-regression`, `datavault.permissions`, `dataBlocks`,
  `datavault.row-notes`, `datavault.api-tokens`, `dynamic_options_workflow`.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Decisions taken before dispatch (2026-08-03, repo owner)

Both were escalated during ticket review; neither is open for a dev to revisit.

1. **DVH-2 gets a real database constraint, not an application lock.** The
   originally-proposed partial unique index on `datavault_values` was found
   unbuildable (see DVH-2's *Why the obvious fix does not work*). The advisory-lock
   alternative was rejected because it is cooperative — it protects only callers
   that remember to take it, which is the exact failure class this initiative
   exists to remove. DVH-2 is therefore **Size L** and adds a table.
2. **Unarchiving a row whose unique value has since been taken fails with a 409.**
   Rejected alternatives: letting the unarchive win and invalidating the newer row;
   clearing the conflicting cell on restore (destroys stored data); making archived
   rows keep reserving their values (reverses DV-4's deliberate decision).

### Sequencing

| Ticket | Migration? | Notes |
|---|---|---|
| DVH-1 | no | dispatch immediately, parallel with DVH-3 — disjoint files |
| DVH-3 | **yes** (`0011`) | dispatch immediately, parallel with DVH-1 |
| DVH-2 | **yes** (`0012`) | **after DVH-1 and DVH-3 both land.** Needs DVH-1 (it changes which rows collide) and cannot share a migration index with DVH-3 |

**Only one migration may be in flight at a time.** `db:generate` numbers from the
local chain, so two devs generating concurrently both produce the same index and
collide. The chain is at `0010` as of `595c10b0`.

DVH-1 and DVH-3 have **no file overlap** — DVH-1 is service + its tests, DVH-3 is a
migration + docs + a new integration test — so they run in parallel worktrees. They may
also run DB-backed suites concurrently, because `scripts/new-worktree.ps1` gives each
worktree its **own** test database (`ezbuildr_test_<name>`). That is only true of
worktrees created by that script; two runs against one database clobber each other's
per-worker schemas and fake dozens of failures.

**Former DVH-4** (index support for filtered grid queries) was removed from this
round — it is P2, speculative by its own admission, and its proposed index carried
the same btree size-limit defect as DVH-2's. It now lives in
`tickets/DATAVAULT_PERF_TICKETS.md` as **DVP-1**.

---

## DVH-1 — A blank cell is stored as `""`, which breaks `required` and false-conflicts on unique columns 🔄

**Priority: P1 (bug)** · Size: S · File: `server/services/DatavaultRowsService.ts`

*Three defects, deliberately one ticket: all three are the same missing coercion in
`validateAndCoerceValue`, and fixing any one of them separately would leave the
data model inconsistent.*

### Finding

`validateAndCoerceValue` checks `required` only inside the null branch, then falls
through to `String(value)` for text types:

```ts
if (value === null || value === undefined) {
  if (column.required && !isAutoNumberType(column.type)) {
    throw new Error(`Column '${column.name}' is required`);
  }
  return null;
}

switch (column.type) {
  case 'text': case 'email': case 'phone': case 'url':
    return String(value);
```

So an empty string skips the required check entirely and is stored as `""`. Three
consequences:

1. **`required` requires nothing.** A required text column accepts `""`. Verified
   against `595c10b0`.
2. **Unique columns false-conflict on blanks.** DV-4's `assertUniqueValues` skips
   `null` but treats `""` as a real value, so leaving a unique column empty on two
   rows returns **409**.
3. **The codebase disagrees with itself about what "empty" means.** DV-1's
   `nonEmptyValue`, which powers the `is_empty` / `is_not_empty` filters, treats
   `""` as empty:
   ```sql
   value IS NOT NULL AND value != 'null'::jsonb AND value != '""'::jsonb
   ```
   A blank cell is therefore *empty* to the filter engine and *a value* to the
   uniqueness engine, over the same row.

The UI reaches this constantly: `RowEditorModal` builds its payload from form state,
so a blank text input sends `""`.

### Preferred fix

Coerce a blank (or whitespace-only) string to `null` **before** the required check,
so there is exactly one representation of empty:

```ts
const normalized = typeof value === 'string' && value.trim() === '' ? null : value;
```

Then let the existing null branch handle required-ness and return. Do **not**
special-case `""` inside `assertUniqueValues` — that fixes one symptom, leaves two
representations in storage, and leaves `required` broken.

Apply only to the string-ish types (`text`, `email`, `phone`, `url`). Do not touch
`json` (where `""` may be meaningful), `select`/`multiselect` (validated against
options), or `number`/`boolean`/`date` (already coerced).

**Backfill: none, and this is settled — do not add one.** The repo owner confirmed on
2026-08-03 that production DataVault holds no real rows either, not just the dev DB. So
there are no legacy `""` cells anywhere to migrate. Keeping this ticket migration-free
is what lets it run in parallel with DVH-3. If you believe you have found a case
requiring a backfill, that is a blocker to report, not a migration to write.

### Ties

- Interacts with **DV-4** (uniqueness), **DV-1** (`nonEmptyValue`), and the
  `required` check — all reachable from `validateAndCoerceValue`.
- **Do DVH-1 before DVH-2**: it changes which rows collide, so building a DB unique
  index first would index the wrong set.
- Load **`add-api-endpoint`** and **`run-tests`**. No migration.
- Existing coverage: `tests/unit/services/DatavaultRowsService.test.ts`,
  `tests/integration/datavault.routes.test.ts`.

### Acceptance criteria

1. `POST /api/datavault/tables/:tableId/rows` with `""` for a **required** text
   column is **rejected** with the existing `Column 'X' is required` message.
2. Same for a whitespace-only string (`"   "`).
3. Two rows may both leave a **unique** text column blank — no 409.
4. A blank text value is stored as SQL `NULL`, asserted on the stored jsonb type,
   not as `""`.
5. An `is_empty` filter matches a row whose text column was submitted blank, and
   `is_not_empty` does not — proving the filter engine and storage now agree.
6. `json` columns still accept `""` as a value (not coerced to null).
7. `select` / `multiselect` behaviour is unchanged — an empty value still fails
   option validation rather than becoming null.
8. New tests assert 1–7; the tests for 1 and 3 must fail before the fix — run them
   pre-fix and say so in your report.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥ 2381.

---

## DVH-2 — A "unique" column can hold duplicates: unarchive never re-checks, and concurrent inserts race 🔲

**Priority: P0 (live bug) + P1 (hardening)** · Size: L · Files: `shared/schema/datavault.ts`,
`server/services/DatavaultRowsService.ts`, `server/repositories/DatavaultRowsRepository.ts`,
`server/services/DatavaultColumnsService.ts`, migration `0012`

*This ticket was rewritten on 2026-08-03. The original proposed a partial unique index
on `datavault_values`; that fix cannot be built (see below), and reviewing it turned up
a second, more serious defect that needs no concurrency at all.*

### Finding — part 1: unarchive resurrects duplicates (P0, user-reachable)

`unarchiveRow` verifies ownership and restores the row. It performs **no uniqueness
check whatsoever**:

```ts
async unarchiveRow(tenantId: string, rowId: string, tx?: DbTransaction): Promise<void> {
  // Verify ownership
  await this.verifyRowOwnership(rowId, tenantId, tx);

  // Unarchive the row
  await this.rowsRepo.unarchiveRow(rowId, tx);
}
```

`bulkUnarchiveRows` is the same shape. Combined with DV-4's deliberate (and correct)
decision that archived rows do not participate in uniqueness, that gives a three-step
sequence any single user can perform in the UI:

1. Archive row A, which holds `E-1` in a column flagged unique.
2. Create row B with `E-1` — allowed, because A is archived.
3. Unarchive row A.

Two live rows now hold `E-1` in a unique column, and nothing surfaces it. No
concurrency, no race, no second user. Verified against `595c10b0`.

### Finding — part 2: concurrent inserts race (P1)

`assertUniqueValues` is a SELECT-then-INSERT inside the caller's transaction:

```ts
const conflicts = await this.rowsRepo.findUniqueValueConflicts(
  tableId, uniqueValues, excludeRowId, tx
);
if (conflicts.length === 0) { return; }
```

Under READ COMMITTED neither of two concurrent transactions sees the other's
uncommitted row, so both pass the check and both insert.

DV-7 closed exactly this for the **upsert** path with a transaction-scoped advisory
lock in `DatavaultRowsRepository.findRowIdByColumnValue`:

```ts
const lockKey = `${tableId}:${columnId}:${String(value)}`;
await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
```

A plain `POST /api/datavault/tables/:tableId/rows` takes no such lock. The only unique
index on `datavault_values` is `datavault_values_row_column_unique` on
`(row_id, column_id)` — one value per cell, not value-uniqueness within a column.

**Extending that advisory lock to the create/update path is explicitly not the fix
here** (Decision 1 in the header). It is cooperative: it protects only callers that
remember to take it, and it would not have caught part 1 at all, because the offending
path is not an insert.

### Why the obvious fix does not work

Do not spend time on `CREATE UNIQUE INDEX ON datavault_values (column_id, value)`. It
fails two ways, and the second is fatal:

- **Size.** A btree index entry cannot exceed **2704 bytes**. `datavault_values.value`
  is `jsonb` capped at **1MB** (`MAX_VALUE_BYTES`, `server/utils/valueSizeLimit.ts`).
  The first long text pasted into a unique column would fail the insert with a raw
  `index row size ... exceeds btree version 4 maximum` error.
- **Scope.** The index must apply only to unique columns and only to non-archived
  rows. A partial index's `WHERE` clause **may only reference columns of the table
  being indexed**, and `datavault_values` holds neither fact: `is_unique` lives on
  `datavault_columns`, `deleted_at` on `datavault_rows`. Denormalising *both* flags
  onto the hottest table in DataVault creates two new invariants that must hold
  across column-flag toggles and archive/unarchive/purge — trading one soft failure
  for two harder ones.

### Preferred fix

A dedicated keys table carrying a real constraint. Shape to build:

```sql
datavault_unique_keys (
  id         uuid primary key default gen_random_uuid(),
  row_id     uuid not null references datavault_rows(id)    on delete cascade,
  column_id  uuid not null references datavault_columns(id) on delete cascade,
  value_hash bytea not null,
  created_at timestamp default now(),
  constraint datavault_unique_keys_column_value_unique unique (column_id, value_hash)
)
```

`column_id` already implies the table, so no `table_id` is needed. Add an index on
`row_id` for the archive/update cleanup path.

**Hash the value in SQL, never in JavaScript.** Postgres 16 has a built-in
`sha256(bytea)`, so both the service write and any backfill use the *identical*
expression — `sha256(convert_to(<value>::jsonb::text, 'UTF8'))` — and therefore agree
by construction. A hash computed in JS and compared against one computed in SQL is a
silent-drift bug waiting to happen; if you find yourself writing `createHash` in
TypeScript, stop.

Paths that must maintain keys, all inside the caller's existing transaction:

| Path | Key behaviour |
|---|---|
| create row | insert a key per unique-column value |
| update row value | delete the old key, insert the new one |
| archive row / bulk archive | **delete** that row's keys (preserves DV-4: archived rows don't reserve values) |
| unarchive row / bulk unarchive | **re-insert** keys from the row's current values; a violation here is the part-1 fix |
| hard delete / purge row | handled by `on delete cascade` |
| `isUnique` or `isPrimaryKey` turned **on** | backfill keys for all live rows of that column |
| `isUnique` / `isPrimaryKey` turned **off** | delete all keys for that column |
| column deleted | handled by `on delete cascade` |

**The existing `assertUniqueValues` check stays.** It is what produces the readable
error in the common case. The constraint is the backstop: catch Postgres error code
**`23505`** on any key write and map it to the same `ConflictError` DV-4 throws, so a
raw constraint string never reaches a client. For the unarchive path the message should
name the blocking column, e.g. `A row with this column 'Employee ID' already exists`
— reuse DV-4's phrasing rather than inventing a second one, so `classifyRouteError`
keeps mapping it to 409.

Turning `isUnique` on for a column that already has duplicates must keep failing with
the **existing readable error**, checked before the backfill — not as a raw constraint
violation from the backfill insert.

### Ties

- **Dispatch only after DVH-1 and DVH-3 have landed.** DVH-1 changes which values
  collide (blank → `null`, so blanks stop being keys at all); DVH-3 owns migration
  `0011`, so this one is `0012`.
- Load **`db-schema-change`** (mandatory), **`add-api-endpoint`**, and **`run-tests`**.
- File footprint collides with **DVH-1** (`DatavaultRowsService.ts`) — hence the
  sequencing, not a parallel dispatch.
- Prior art: DV-7's lock helper in `DatavaultRowsRepository.findRowIdByColumnValue`
  shows the `${tableId}:${columnId}:${value}` key convention; DV-14's unarchive work
  is the path part 1 lives on.
- Existing coverage: `tests/unit/services/DatavaultRowsService.test.ts`,
  `tests/integration/datavault.routes.test.ts`,
  `tests/integration/datavault-v4-regression.test.ts`.

### Acceptance criteria

1. The part-1 sequence is rejected: archive a row holding a unique value, create a
   second row with that value, then unarchive the first → **409** with DV-4's readable
   message, and the row stays archived. **This test must fail before your fix — run it
   pre-fix and say so in your report.**
2. Same for `bulkUnarchiveRows`: a batch containing one conflicting row does not
   silently restore it. State and test whether the batch fails whole or per-row —
   whichever you choose, it must not leave a duplicate live.
3. Unarchiving a row whose unique value is still free succeeds, as today.
4. Two **concurrent** row creates with the same value in a unique column produce
   exactly **one** row; the loser gets a **409, not a 500**.
5. No raw Postgres constraint text reaches the client on any path — assert on the
   response body, not just the status code.
6. Archived rows still do not participate in uniqueness: a value held only by an
   archived row does not block a new row (DV-4's guarantee).
7. Turning `isUnique` **on** for a column with existing duplicates fails with the
   existing readable error, and leaves no partial keys behind.
8. Turning `isUnique` **off** allows duplicates again; turning it back on with
   duplicates present fails per criterion 7.
9. Hard-deleting a row, and deleting a column, remove their keys (cascade verified,
   not assumed).
10. `npm run db:migrate` applies cleanly on a **fresh** database; the migration is
    reversible or documented as one-way.
11. New tests assert 1–9. Criterion 4 must genuinely run concurrently — `server/db.ts`
    caps the **test** pool at 1 connection, so two `db.transaction()` calls serialise
    and a `Promise.all` over them proves nothing. Use separate pools/clients, and
    state in your report how you achieved real concurrency and how you know you did.
12. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥ 2381;
    the 8-suite DataVault integration sweep green.

---

## DVH-3 — `datavault_rows` and `datavault_values` have no RLS policy, not even staged ✅

**Priority: P1** · Size: M · File: new migration + `docs/architecture/TENANT_ISOLATION_RLS.md`

> **✅ Verified at review 2026-08-03.** Reviewer re-ran every gate independently in
> the `dvh-3` worktree rather than trusting the dev report: `tsc --noEmit` exit 0,
> `npm run lint` clean, `test:fast` **2381 passed** / 14 skipped, and the 8-suite
> DataVault sweep plus all three RLS suites **11 files / 184 tests passed**. Applied
> `db:migrate` to an independently-created fresh database (`dvh3_reviewer_check`) and
> confirmed by direct `pg_policies` query that all **11** DataVault tables now carry a
> `tenant_isolation` policy — the 5 from `0001` plus the 6 this ticket adds — and that
> all three helper functions exist in `pg_proc`.
>
> Substance checks: `migrations/0011_datavault_rls_phase4.sql` contains **zero** raw
> `current_setting` calls and reuses `app_current_tenant()` with `0001`'s
> `CASE WHEN ... IS NULL THEN false` guard throughout; all three derivation shapes are
> implemented as separate helpers rather than one predicate copy-pasted six times; the
> `_journal.json` change is a purely additive generated `idx: 11` entry. The
> non-owner-role requirement is genuinely met — the test file asserts `rolsuper = false`,
> `rolbypassrls = false`, and that the test role differs from `datavault_rows`'s actual
> owner, so the isolation assertions cannot pass vacuously. Fail-closed is covered for
> both an unset **and** an explicitly empty GUC.
>
> Not verified live: this ticket stages policies that owner/superuser connections
> bypass, so there is no browser-observable behaviour to drive. Criterion 5 (full suite
> still green as owner) is the proof that enforcement was not flipped.
>
> Noted, not fixed (out of scope, filed as an observation): the doc's §8 Files table
> still names `migrations/0005_rls_phase4_workflows_sections_steps.sql`, a file removed
> in the 2026-07-19 migration regeneration. The dev added a clarifying parenthetical.

### Finding

`migrations/0001_enable_rls.sql` stages tenant-isolation policies for five DataVault
tables:

```
'datavault_api_tokens', 'datavault_databases', 'datavault_number_sequences',
'datavault_row_notes', 'datavault_tables'
```

**`datavault_rows` and `datavault_values` are absent** — the two tables holding the
actual customer data. So are `datavault_columns`,
`datavault_table_permissions`, `datavault_database_access` and
`datavault_table_access`.

Tenant isolation for DataVault row data is therefore **service-layer only**. Every
row/table service method does call `verifyTableOwnership`, and the audit found no
gap in that — but there is no database backstop, so a single future endpoint that
forgets the check is a cross-tenant read with nothing behind it. That is the largest
single item behind DataVault's B− grade.

Note RLS is repo-wide **defined but not enforced** (prod connects as the table
owner; see the header of `0001_enable_rls.sql`). This ticket does **not** change
that. It closes the gap so that whenever enforcement is switched on, the tables that
matter are covered.

### Preferred fix

Add policies in a new `--custom` migration, mirroring the **ownership-derived**
pattern `0001` already uses for `workflows` / `sections` / `steps` — because
`datavault_rows` and `datavault_values` have **no `tenant_id` column**; tenancy is
derived (`datavault_values.row_id → datavault_rows.table_id →
datavault_tables.tenant_id`).

Follow `0001`'s conventions exactly: `DROP POLICY IF EXISTS` + `to_regclass` guards
+ idempotent, and **never** set the tenant GUC session-level (see
`docs/architecture/TENANT_ISOLATION_RLS.md`, SEC-051).

⚠️ **The empty-string GUC trap is already solved — reuse the solution, do not
re-derive it.** `0001` defines `app_current_tenant()`, which does
`NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`, and every
ownership-derived policy wraps its predicate in `CASE WHEN app_current_tenant() IS NULL
THEN false ELSE ... END` so an empty GUC denies *without* evaluating the derivation
(which would otherwise raise `22P02`). Call `app_current_tenant()` and copy that `CASE`
shape. Hand-rolling `current_setting` in your predicate is how RLS Phase 4 got a
fail-closed bug; a test must still cover it (criterion 4).

Cover `datavault_columns`, `datavault_table_permissions`, `datavault_database_access`
and `datavault_table_access` in the same migration — one migration, not five.

**They are not all the same derivation, though — there are three shapes.** Verify each
against `shared/schema/datavault.ts` rather than copy-pasting one predicate six times:

| Table | Derivation |
|---|---|
| `datavault_rows`, `datavault_columns`, `datavault_table_permissions`, `datavault_table_access` | `table_id → datavault_tables.tenant_id` |
| `datavault_database_access` | `database_id → datavault_databases.tenant_id` |
| `datavault_values` | `row_id → datavault_rows.table_id → datavault_tables.tenant_id` (two hops) |

Follow `0001` Part 2's precedent and add small `STABLE` SQL helper functions for the
derivations rather than inlining a two-hop `EXISTS` into four policies. Do **not** pin
`search_path` on them — `0001` deliberately leaves it unpinned so they resolve `public`
in prod and the per-worker schema in tests.

Update `docs/architecture/TENANT_ISOLATION_RLS.md` with the new coverage so the
enforcement checklist is accurate.

### Ties

- **Owns migration `0011`.** Safe to run in parallel with DVH-1 (no file overlap);
  DVH-2 is dispatched only after this lands, and takes `0012`.
- Load **`db-schema-change`** (mandatory) and **`run-tests`**.
- **Copy the test harness, don't build one.**
  `tests/integration/rls-phase4-workflows.test.ts` already creates a
  `rls_tester_<schema>` `NOLOGIN` role and does the `SET ROLE` + transaction-local
  `set_config` dance, including the search_path gotcha `SET ROLE` introduces. Model
  your test on it.
- **Distinct from `DEBT-11`** (`backlog/TECH_DEBT.md`), and the two must not be
  conflated: DEBT-11 is the *product decision to enforce* RLS repo-wide, which the
  repo owner holds. This ticket only closes a **coverage gap** — the two DataVault
  tables holding customer data have no policy while their five siblings do. It
  changes nothing about enforcement, and it makes DEBT-11 safer to say yes to later,
  because flipping enforcement with `datavault_rows` uncovered would silently leave
  the most valuable table unprotected.
- Prior art to copy, not re-derive: `migrations/0001_enable_rls.sql`'s
  ownership-derived block, and the non-owner-role test pattern from RLS Phase 4.
- Tests must connect as a **non-owner role** to observe policies at all — as the
  table owner or superuser, RLS is bypassed and every test passes vacuously.

### Acceptance criteria

1. Policies exist for `datavault_rows`, `datavault_values`, `datavault_columns`,
   `datavault_table_permissions`, `datavault_database_access`,
   `datavault_table_access`.
2. Connected as a **non-owner role** with tenant A's GUC set, a `SELECT` on
   `datavault_rows` returns tenant A's rows and **none** of tenant B's.
3. Same for `datavault_values` via its derived path.
4. An **empty** tenant GUC denies rather than permits (fail-closed), with a test
   asserting it.
5. Existing behaviour as the table owner is unchanged — the full suite still passes,
   confirming this is staged and not enforced.
6. `npm run db:migrate` applies cleanly on a fresh database.
7. `docs/architecture/TENANT_ISOLATION_RLS.md` lists the new coverage.
8. New tests assert 2–4 as a non-owner role. A test that passes as owner/superuser
   proves nothing — state in your report which role your tests used.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `test:fast` ≥ 2381;
   `test:integration` no new failures.

---

## Gate

- [ ] DVH-1, DVH-2, DVH-3 all ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥ 2381 · `npm run test:unit:db` no new failures
- [ ] `npm run test:integration` → 96 files, no new failures
- [ ] `npm run db:migrate` applies cleanly on a fresh database (`0011` + `0012`)
- [ ] The 8-suite DataVault integration sweep green on the final tree
- [ ] DVP-1 (`tickets/DATAVAULT_PERF_TICKETS.md`) is untouched by this round and
      still accurate — it inherits the btree size-limit finding from DVH-2
- [ ] Reviewer has committed each passed ticket + this gate
