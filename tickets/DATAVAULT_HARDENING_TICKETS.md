# DataVault — Hardening Tickets (DVH-1..4)

Source: the reviewer's closing assessment of the DataVault audit initiative,
2026-08-03, after all 14 of its tickets closed (`tickets/backlog/DATAVAULT.md`).

Scope: the four items that stood between DataVault's **B−** grade and a B+. All
four have the same shape — **an invariant that currently holds only because every
caller remembers to go through the right service method, with no database
backstop.** Nothing here is broken; each ticket adds a layer that makes a future
mistake impossible rather than merely unlikely.

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

### Sequencing

| Ticket | Migration? | Notes |
|---|---|---|
| DVH-1 | no | independent, do first — it changes what is stored |
| DVH-2 | **yes** | after DVH-1, because DVH-1 changes which rows collide |
| DVH-3 | **yes** | must not run concurrently with DVH-2 |
| DVH-4 | **yes** | must not run concurrently with DVH-2 or DVH-3 |

**Only one migration may be in flight at a time.** `db:generate` numbers from the
local chain, so two devs generating concurrently both produce the same index and
collide. The chain is at `0010` as of `595c10b0`.

DVH-1 is the only one safe to run in parallel with anything.

---

## DVH-1 — A blank cell is stored as `""`, which breaks `required` and false-conflicts on unique columns 🔲

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

**Backfill:** the dev DB holds only test data, so no migration is needed. Add a note
to the ticket's verification if that ever stops being true — legacy `""` rows would
otherwise stay invisible to `is_empty` and visible to uniqueness.

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

## DVH-2 — Uniqueness is enforced only in application code, so concurrent inserts can duplicate 🔲

**Priority: P1** · Size: M · File: `shared/schema/datavault.ts` + migration

### Finding

DV-4 enforces `isUnique` / `isPrimaryKey` in `DatavaultRowsService.assertUniqueValues`
as a SELECT-then-INSERT inside the caller's transaction. Under READ COMMITTED two
concurrent transactions both see no conflict and both insert, so a column marked
unique can still end up with duplicates.

DV-7 closed this for the **upsert** path only, with a transaction-scoped advisory
lock on the match key:

```ts
await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
```

A plain concurrent `POST /api/datavault/tables/:tableId/rows` takes no such lock.
The only unique index on `datavault_values` is
`datavault_values_row_column_unique` on `(row_id, column_id)` — one value per cell,
not value-uniqueness within a column.

This was parked as DV-B2 during the audit because a per-column guarantee on an EAV
table needs a design decision. That decision is now this ticket.

### Preferred fix

Add a **partial unique index** on `datavault_values (column_id, value)` restricted to
values belonging to unique columns, so Postgres enforces it regardless of caller.

The complication to solve, and the reason this is M not S: `datavault_values` has no
`is_unique` column — uniqueness is a property of `datavault_columns`. Two workable
shapes, pick one and justify it:

- **(a) Denormalise a flag.** Add `datavault_values.is_unique_column boolean` kept in
  sync when a column's flag changes, and build `CREATE UNIQUE INDEX ... ON
  datavault_values (column_id, value) WHERE is_unique_column`. Simple index, but the
  flag must be maintained on column update — a real invariant to hold.
- **(b) Index unconditionally per column.** Create/drop a partial unique index
  per unique column as its flag toggles (`WHERE column_id = '<uuid>'`). No
  denormalised state, but it means **runtime DDL** on a customer action, which is a
  genuine operational concern (lock behaviour, index bloat, failure mid-toggle).

The reviewer leans **(a)** — a maintained boolean is a smaller ongoing risk than DDL
triggered by a UI toggle. If you choose (b), say why.

Either way: soft-deleted rows must not participate, and the existing service-layer
check **stays** so the error remains a readable 409 rather than a raw constraint
violation. Catch the constraint error and map it to the same `ConflictError` DV-4
throws.

### Ties

- **After DVH-1** — it changes which rows collide.
- Load **`db-schema-change`** (mandatory) and **`run-tests`**. Migration `0011`.
- **Do not run concurrently with DVH-3 or DVH-4** — one migration at a time.
- Existing coverage: `tests/unit/services/DatavaultRowsService.test.ts`,
  `tests/integration/datavault.routes.test.ts`.

### Acceptance criteria

1. Two **concurrent** row creates with the same value in a unique column produce
   exactly **one** row; the loser gets a 409, not a 500.
2. The rejection message is the same readable one DV-4 produces — a raw Postgres
   constraint string must not reach the client.
3. Turning `isUnique` **on** for a column with existing duplicates still fails with
   the existing readable error rather than a migration/index error.
4. Turning `isUnique` **off** allows duplicates again.
5. Archived rows do not participate in uniqueness (a value held only by an archived
   row does not block a new row) — the DV-4 guarantee still holds.
6. `npm run db:migrate` applies cleanly on a **fresh** database, and the migration is
   reversible or documented as one-way.
7. The chosen shape's invariant is tested: for (a), that the flag stays correct
   across column create/update/delete; for (b), that index create/drop follows the
   toggle.
8. New tests assert 1–5 and 7. Criterion 1 must genuinely run concurrently — note
   that `server/db.ts` caps the **test** pool at 1 connection, so two
   `db.transaction()` calls serialise and a `Promise.all` proves nothing. Use
   separate pools/clients, and state how you achieved real concurrency.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `test:fast` ≥ 2381;
   8-suite DataVault integration sweep green.

---

## DVH-3 — `datavault_rows` and `datavault_values` have no RLS policy, not even staged 🔲

**Priority: P1** · Size: M · File: new migration + `docs/architecture/TENANT_ISOLATION_RLS.md`

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

⚠️ **The empty-string GUC trap:** RLS Phase 4 hit a fail-closed bug where an empty
`current_setting` made every policy deny. That is recorded in the RLS docs — read it
before writing the predicate, and cover it in a test.

Cover `datavault_columns`, `datavault_table_permissions`, `datavault_database_access`
and `datavault_table_access` in the same migration; they are the same derivation and
splitting them means a second migration for no reason.

Update `docs/architecture/TENANT_ISOLATION_RLS.md` with the new coverage so the
enforcement checklist is accurate.

### Ties

- **Do not run concurrently with DVH-2 or DVH-4** — one migration at a time.
- Load **`db-schema-change`** (mandatory) and **`run-tests`**.
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

## DVH-4 — Filtered grid queries have no index support on `datavault_values.value` 🔲

**Priority: P2** · Size: S · File: new migration

### Finding

`datavault_values` has exactly two indexes:

```sql
CREATE INDEX "datavault_values_row_idx"    ON "datavault_values" ("row_id");
CREATE INDEX "datavault_values_column_idx" ON "datavault_values" ("column_id");
```

DV-8's filters run correlated `EXISTS` subqueries of the shape
`WHERE column_id = $1 AND <value predicate>`. The `column_id` index narrows to that
column, then every value in it is scanned. There is **no index on `value`**, so:

- equality filters scan the whole column,
- `contains` (`LIKE '%x%'`) cannot use an index at all,
- typed comparisons (`::numeric`, `::timestamptz`) are computed per row.

Correct, and fine at current scale — this is a ceiling, not a defect. It is filed
because DV-8 made filtering a primary, user-facing path, so the first wide customer
table will find it.

### Preferred fix

Add a composite index on `(column_id, value)` so equality and range filters can be
served from the index rather than scanning the column. Measure before choosing more:
run `EXPLAIN ANALYZE` on a representative filtered query at, say, 100k values and
include the before/after plans in your report.

Consider — and justify either way, with the plan output rather than intuition:

- a `text`-extracted expression index (`(value #>> '{}')`) if the jsonb comparison
  cannot use the plain composite;
- a `pg_trgm` GIN index for `contains`, **only if** `EXPLAIN` shows the sequential
  scan actually dominates. `pg_trgm` is an extension, so confirm Neon supports it
  before proposing it, and do not add an extension speculatively.

Do not add indexes that the plans do not justify — each one costs write throughput
on the hottest table in DataVault.

### Ties

- **Do not run concurrently with DVH-2 or DVH-3** — one migration at a time.
- Load **`db-schema-change`** (mandatory) and **`run-tests`**.
- Related: DV-B4 (parked) — `getRowsWithValues` fetches every value for every row
  regardless of selected columns. Different layer, but the same "wide table" trigger
  will surface both; mention in your report if you see them interact.

### Acceptance criteria

1. `EXPLAIN ANALYZE` for an equality filter shows an index scan on the new index
   rather than a scan of the column's values — before/after plans included in the
   report.
2. A representative filtered query over a seeded table of ≥100k values improves
   measurably; state the numbers.
3. Every index added is justified by a plan; any considered-and-rejected index is
   named with the reason.
4. Filter correctness is unchanged — the 8-suite DataVault sweep is green,
   especially DV-8's filter tests.
5. `npm run db:migrate` applies cleanly on a fresh database.
6. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `test:fast` ≥ 2381.

---

## Gate

- [ ] DVH-1..4 all ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥ 2381 · `npm run test:unit:db` no new failures
- [ ] `npm run test:integration` → 96 files, no new failures
- [ ] `npm run db:migrate` applies cleanly on a fresh database (three migrations)
- [ ] Reviewer has committed each passed ticket + this gate
