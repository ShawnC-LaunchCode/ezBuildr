# DataVault — Integration & Enterprise-Readiness Tickets (DV-1..13 + backlog)

Source: full-system audit of DataVault, 2026-08-02, prompted by "DataVault has not
gotten a lot of attention through a lot of changes — make sure it still does all of
the things it needs to do, and that everything is enterprise ready."

Scope: `shared/schema/datavault.ts` (14 tables), `server/routes/datavault/*` (8 route
files) + `datavault.routes.ts` + `datavaultApiTokens.routes.ts`, the 8 `Datavault*`
services and 9 `Datavault*` repositories, the ACL layer (`DatavaultAclService`), and
every path that connects DataVault to interviews: `WritebackExecutionService`,
`WriteRunner`/`WriteBlockRunner`, `ReadTableBlockRunner`, `QueryBlockRunner`,
`QueryRunner`, `QueryService`, and the runner's `useChoiceOptions` option resolver.
Client surface: `client/src/components/datavault/*` (36 components),
`client/src/pages/datavault/*`.

Overall grade at audit time: **D+** — the CRUD core, tenancy checks and ACL layer are
genuinely well built (B+ in isolation: every row/table service method calls
`verifyTableOwnership`/`verifyTenantOwnership`, and `DatavaultAclService` resolves a
sensible owner/edit/view lattice across user, org, team, project and workflow scopes).
But **all three of the interview integration paths named in the ask are broken**, and
unique/primary-key constraints are decorative. The grade is about the seams, not the
core.

Every finding below was verified against the working tree at audit time. **Line
numbers are advisory** — they were accurate when written and drift as fixes land. The
locator is the quoted code and the named symbol; grep for those. A stale line number
is not a broken ticket and does not need re-issuing.

**Baseline at audit time:** `npm run test:fast` = **181 files / 2313 passed**, 1 file
+ 14 tests skipped, 0 failures. Any ticket that lowers the passing count has broken
something.

---

## How to work this document

- **Tickets are grouped into 4 phases**, ordered by risk and dependency. Do not start
  a phase until the previous phase's **Phase Gate** has been verified and committed by
  the reviewer.
- Each ticket has: **Finding**, **Preferred fix**, **Ties**, and **Acceptance
  criteria** (all must pass).
- **Load the project skills named in each ticket's Ties before touching code.** For
  this initiative that is almost always `add-api-endpoint` (anything under
  `server/routes/`, `server/services/`, `server/repositories/`), `run-tests` (**`npm
  test` naively gives wrong results here — there are 3 Vitest projects with different
  commands and DB requirements**), `db-schema-change` (any schema or migration work),
  and `design` (any UI change — this is a standing repo rule).
- DB-backed suites (`unit-db`, `integration`) **must not run concurrently** with
  another agent's DB suite — schemas are per-worker, not per-process, and two
  simultaneous runs fake dozens of failures.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Phase overview

| Phase | Theme | Tickets | Est. effort |
|---|---|---|---|
| 1 | The three interview integration paths are broken | DV-1..3 | ~2 days |
| 2 | Row-write data integrity | DV-4..7 | ~2 days |
| 3 | Grid, filter and count correctness | DV-8..9 | ~1 day |
| 4 | Surface honesty & enterprise controls | DV-10..13 | ~1.5 days |
| Backlog | Not phase-gated | DV-B1..B4 | — |

### Decisions (ruled by the repo owner, 2026-08-02 — do not re-litigate)

- **D-1 — Dynamic dropdown options are resolved server-side.** A new purpose-built
  endpoint accepts both `hybridAuth` and run-token auth and returns only the bound
  label/value pairs. Rejected: pointing the client at
  `/api/datavault/tables/:id/rows` (breaks public run links, ships whole rows to the
  browser). Governs DV-3.
- **D-2 — The declarative writeback-mapping path is deleted, not built.** The
  Send-Data-To-Table block is the one supported way an interview writes into
  DataVault. Governs DV-10.
- **D-3 — DataVault API tokens are hidden, not implemented.** We stop issuing
  credentials that authenticate nothing; a real external API is a separate initiative
  (see DV-B1). Governs DV-11.

### File footprint map (use this to sequence dispatch)

| File | Tickets |
|---|---|
| `server/services/DatavaultRowsService.ts` | DV-4, DV-5, DV-6 → **sequence in this order** |
| `server/repositories/DatavaultRowsRepository.ts` | DV-6, DV-7, DV-8, DV-9 → **sequence** |
| `server/services/blockRunners/ReadTableBlockRunner.ts` | DV-1 (alone) |
| `server/lib/queries/QueryRunner.ts` | DV-2 (alone) |
| `server/lib/writes/WriteRunner.ts` | DV-7 |
| new options route + `useChoiceOptions.ts` | DV-3 (alone) |
| `server/routes/datavault/rows.routes.ts` + `FilterPanel.tsx` | DV-8 |
| `WritebackExecutionService` + `RunLifecycleService` + migration | DV-10 (alone) |
| `client/.../DatabaseApiTokens.tsx` + parent | DV-11 (alone) |
| `server/services/QueryService.ts` | DV-12 (alone) |
| `server/routes/datavault/*` + services | DV-13 (**collides with DV-8; run last**) |

Disjoint and parallel-safe: **DV-1, DV-2, DV-3** (Phase 1 — all three at once).
**DV-10, DV-11, DV-12** (Phase 4 — all three at once, DV-13 after DV-8).

---

# Phase 1 — The three interview integration paths are broken

The ask named three capabilities: interviews store data in DataVault, DataVault feeds
interview dropdowns, and we query DataVault for interviews. Storing works (via the
Send-Data-To-Table block). **The other two do not work at all**, and the query path
additionally leaks across tenants. This phase fixes reads.

Explicitly out of scope for this phase: row-write validation (Phase 2) and the grid
UI (Phase 3).

## DV-1 — Read Table block queries a `data` column that does not exist ✅

**Priority: P0 (bug)** · Size: M · File: `server/services/blockRunners/ReadTableBlockRunner.ts`

> **Verification pass — 2026-08-02 (reviewer).** PASS, all 7 criteria met.
> Gates re-run by the reviewer in the **main checkout** (not the dev's worktree —
> the dev's green was produced after replacing the `node_modules` junction with a
> local `npm ci`, so it was not reproducible as-shipped): `npx tsc --noEmit` 0
> errors, `npm run lint` (repo-wide, `--max-warnings 0`) exit 0, `npm run
> test:fast` **182 files / 2318 passed** (baseline 181/2313; +1 file +1 test from
> this ticket, +4 tests from DV-2 applied alongside), and
> `tests/integration/dataBlocks.test.ts` **9/9 passed**.
> **Regression value proved independently:** reverting only
> `ReadTableBlockRunner.ts` to HEAD and re-running the suite fails **7 of 9** —
> `expected undefined to be 'Alpha'` (the null-hydration bug) and five
> `expected false to be true` failures where the block errors on the nonexistent
> `data` column. The tests are real, not tautological.
> AC2's five operators are covered by an `it.each` block (equals, contains,
> greater_than, is_empty, in) — a plain `grep` for `it(` misses it.
> Implementation notes: correlated `EXISTS` over `datavault_values` collected into
> a **single** `and(...)`/`.where()` (avoiding the DV-2 trap), `sql.raw` eliminated
> entirely so `columnId` is now a bound parameter, `isNull(deletedAt)` added, and
> `is_empty` reimplemented as `NOT EXISTS(non-empty)` — which is stronger than the
> ticket asked for, since it also matches rows with no value row at all. Nine
> pre-existing eslint suppressions were removed rather than any added.
> **Note for TEST_DATABASE_URL:** main's `.env` has none, so integration runs from
> the main checkout must set it explicitly or they fail auth against the Neon dev
> DB.

### Finding

`queryTableRows()` in `ReadTableBlockRunner` builds every filter and sort against a
`data` JSON column on `datavault_rows`:

```ts
const columnPath = `data->>'${filter.columnId}'`;
...
whereConditions.push(sql`${sql.raw(columnPath)} = ${filter.value}`);
```

and reads results the same way in `execute()`:

```ts
rowData[col.id] = row.data?.[col.id] ?? null;
```

**`datavault_rows` has no `data` column.** Confirmed against
`migrations/0000_init_baseline.sql`:

```sql
CREATE TABLE "datavault_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"updated_by" varchar
);
```

Cell values live in the EAV table `datavault_values` (`row_id`, `column_id`, `value`
jsonb). The `data`-as-jsonb-blob shape belongs to the separate `records` table
(Collections), which this runner appears to have been written against.

Consequences, both live:

1. **Any read_table block with a filter or a sort throws** — Postgres `42703 column
   "data" does not exist` — surfacing as `Read table failed: ...` and failing the
   block.
2. **A read_table block with no filter and no sort "succeeds" but returns garbage**:
   the row query works, then `row.data?.[col.id]` is `undefined` for every column, so
   every emitted cell is `null`. Downstream steps see the right row *count* with all
   values blank.

Additionally the query has **no `deleted_at IS NULL` condition**, so archived rows are
returned as live data.

### Preferred fix

Rewrite `queryTableRows()` to query the EAV model. **Do not invent a new query
approach — mirror `DatavaultRowsRepository.getRowsWithValues()`**, which already does
exactly this correctly: select the row ids from `datavault_rows`, then fetch
`datavault_values` for those ids with a single `inArray` query and group by `rowId`.

For filters, mirror the `EXISTS`-subquery shape in
`server/lib/queries/QueryRunner.ts` (`alias(datavaultValues, ...)` + correlated
`exists()`), but **collect all conditions into one `and(...)` passed to a single
`.where()` call** — see DV-2 for why chaining `.where()` is a trap. Keep the existing
`columnId` regex guard, and keep `sql.raw` out of the new code entirely: with EAV,
`columnId` is a bound parameter (`eq(v.columnId, filter.columnId)`), not string-
interpolated SQL, so the injection surface disappears.

Add `isNull(datavaultRows.deletedAt)` to the base conditions. Sort must compare
typed values, not raw jsonb text — cast per the column's declared type (mirror the
`::numeric` cast already present in the `greater_than` branch).

Delete the `data->>` code path rather than leaving it commented out.

### Ties

- **DV-2** is the same class of bug in the sibling query path and shares the
  `EXISTS`-subquery pattern — but a different file, so the two can run in parallel.
  Whoever lands second should not "unify" the two into a shared helper without saying
  so; a shared EAV filter builder is a reasonable deviation if both tickets' tests
  stay green.
- Load the **`add-api-endpoint`** skill (service/repository conventions, error-string
  contract) and **`run-tests`**.
- Existing coverage to extend: `tests/integration/dataBlocks.test.ts` (has read_table
  coverage), plus a new unit test alongside
  `tests/unit/services/` for the runner.
- File footprint: `server/services/blockRunners/ReadTableBlockRunner.ts` only.
  Collides with nothing.

### Acceptance criteria

1. A read_table block against a table with rows returns **actual cell values** keyed
   by column id — not `null` — for every selected column.
2. A read_table block **with an `equals` filter** returns only matching rows and does
   not throw. Same for `contains`, `greater_than` on a `number` column, `is_empty`,
   and `in`.
3. A read_table block **with a sort** on a `number` column orders numerically (so 9
   sorts before 10, not after).
4. Archived rows (`deleted_at` not null) are **excluded** from results.
5. A filter naming a column id that does not belong to the table is skipped with a
   warning, as today — not silently treated as a match.
6. New/updated tests in `tests/integration/dataBlocks.test.ts` assert 1–4. The test
   for criterion 1 must be written so it **fails against the current code** (i.e. it
   asserts a concrete non-null value, not merely that a row count is right) — state in
   your report that you confirmed this by running it before your fix.
7. `npx tsc --noEmit` reports 0 errors; `npm run lint` clean on the touched file;
   `npm run test:fast` still reports ≥2313 passing.

---

## DV-2 — `QueryRunner` silently discards table + tenant scoping, leaking rows across tenants ✅

**Priority: P0 (security)** · Size: M · File: `server/lib/queries/QueryRunner.ts`

> **Verification pass — 2026-08-02 (reviewer).** PASS, all 7 criteria met.
> Gates re-run by the reviewer in the **main checkout** — the dev's own green came
> from a temporary `node:stream` shim that no longer exists, so it was not
> reproducible as-shipped. Results with DV-1 applied alongside: `npx tsc --noEmit`
> 0 errors, `npm run lint` exit 0, `npm run test:fast` **182 files / 2318 passed**,
> `tests/unit/lib/queries/QueryRunner.test.ts` **9/9**.
> **Regression value proved independently:** reverting only `QueryRunner.ts` to HEAD
> fails **exactly the 4 new tests** (5 pre-existing still pass) — table scope
> escape, cross-tenant leak, dropped filters, and archived rows. Confirms the leak
> was real and the tests catch it.
> AC5 verified mechanically: `grep -c _tenantId` → 0, `grep -c "as any"` → 0.
> Implementation notes: the dev used `$dynamic()` — the correct Drizzle idiom for
> conditional builder chaining — and assigns every builder result, so the
> mutate-and-discard pattern that caused the leak cannot recur silently. Tenant
> enforcement is belt-and-braces as the ticket asked: `innerJoin(datavaultTables)`
> + `eq(datavaultTables.tenantId, tenantId)` alongside the existing
> `eq(rows.tableId, query.tableId)`. Dead `<@` assignment and five self-doubting
> comments removed; four eslint suppressions removed, none added.

### Finding

`QueryRunner.executeQuery()` builds a correctly scoped base query, then applies each
filter by calling `.where()` **again on the same builder and discarding the return
value**:

```ts
const sqlQuery = this.db.select({ id: datavaultRows.id })
    .from(datavaultRows)
    .where(and(
        eq(datavaultRows.tableId, query.tableId),
        sql`${datavaultRows.deletedAt} IS NULL`
    ));
...
for (const filter of resolvedFilters) {
    ...
    (sqlQuery as any).where(exists(  // <-- second .where(), result thrown away
        this.db.select({ one: sql`1` }).from(v).where(and(
            eq(v.rowId, datavaultRows.id), eq(v.columnId, filter.columnId), condition
        ))
    ));
}
```

Drizzle's `.where()` **overwrites** `config.where` and returns `this` — it does not
AND with the existing clause. Verified empirically against the repo's own
`drizzle-orm@0.45.2`, building the exact shape above:

```
1) after first .where:
   select "id" from "datavault_rows"
   where ("datavault_rows"."table_id" = $1 and "datavault_rows"."deleted_at" IS NULL)

2) after second .where(), return value discarded:
   select "id" from "datavault_rows"
   where exists (select 1 from "datavault_values" where "datavault_values"."column_id" = $1)

3) after a third .where() (2 filters):
   select "id" from "datavault_rows"
   where exists (select 1 from "datavault_values" where "datavault_values"."column_id" = $2)
```

So for any query with **one or more filters**:

- **`table_id = ?` is gone** — the query scans `datavault_rows` across every table in
  every tenant. The `_tenantId` parameter is unused (note the underscore), so nothing
  else re-imposes scope. This is a **cross-tenant read**: a filtered query returns any
  tenant's rows whose value in the named column matches.
- **`deleted_at IS NULL` is gone** — archived rows come back.
- **Only the last filter applies** — every earlier filter is overwritten.

Reachable in production via `QueryBlockRunner.execute()`, which is registered in
`BlockRunner` (`this.registerRunner(new QueryBlockRunner())`) and calls
`queryRunner.executeQuery(query, context.data, tenantId)`. `QueryBlockRunner` resolves
a real `tenantId` and passes it in good faith; `executeQuery` ignores it. The query
definition itself is loaded with `workflowQueriesRepository.findById(config.queryId)`,
which is also unscoped.

The same discarded-return bug is present on the sort path
(`sqlQuery.leftJoin(...).orderBy(...)`) and the limit (`sqlQuery.limit(...)`); those
happen to work because Drizzle mutates in place for a *first* call, but they are the
same latent hazard and should not be left in the mutate-and-discard style.

### Preferred fix

Build the condition list first, then pass it to a **single** `.where(and(...))`, and
assign every builder result rather than discarding it. Concretely:

```ts
const conditions = [
  eq(datavaultRows.tableId, query.tableId),
  isNull(datavaultRows.deletedAt),
];
for (const filter of resolvedFilters) { /* ...push exists(...) into conditions... */ }
let q = this.db.select({ id: datavaultRows.id }).from(datavaultRows).where(and(...conditions));
```

Then **enforce the tenant** rather than ignoring it: stop taking `_tenantId` and
instead `innerJoin(datavaultTables, eq(datavaultRows.tableId, datavaultTables.id))`
with `eq(datavaultTables.tenantId, tenantId)` in the same `and(...)`. Mirror
`DatavaultRowsRepository.batchVerifyOwnership()`, which already scopes exactly this
way. Belt-and-braces is correct here: the join is the invariant, the
`eq(tableId, query.tableId)` is the intent.

Also remove the `(sqlQuery as any)` cast — it is what hid the bug from the type
checker. If a cast still seems necessary, the query is being built in the wrong order.

Leave the operator semantics alone except the `in` case, whose dead first assignment
(`<@`, immediately overwritten by `@>`) and three self-doubting comments should be
reduced to the one working expression.

### Ties

- **DV-1** is the same bug class in `ReadTableBlockRunner`; different file, so
  parallel-safe. **DV-12** hardens `QueryService`, which is the other (currently
  caller-less) entry point to this runner.
- Load **`add-api-endpoint`** and **`run-tests`**. Read
  `docs/architecture/SECURITY_THREAT_MODEL.md` — cross-tenant scoping is a stated
  invariant (CLAUDE.md convention #7).
- Existing coverage: `tests/unit/lib/queries/QueryRunner.test.ts`.
- File footprint: `server/lib/queries/QueryRunner.ts` only (plus its test). Signature
  change to `executeQuery` touches `QueryBlockRunner` and `QueryService` call sites —
  keep the arity, just use the parameter.

### Acceptance criteria

1. A query with **one filter** returns only rows from `query.tableId` — asserted with
   a second table in the **same** tenant that also has a matching value, which must
   not appear in the results.
2. A query with **one filter** returns no rows belonging to a **different tenant**,
   asserted with a matching row seeded under a second tenant.
3. A query with **two filters** applies **both** (a row matching only one filter is
   excluded).
4. Archived rows are excluded from filtered and unfiltered queries alike.
5. `executeQuery` uses its `tenantId` argument (no leading-underscore parameter
   remains) and there is no `as any` cast on the query builder in the file.
6. New tests in `tests/unit/lib/queries/QueryRunner.test.ts` assert 1–4. Criteria 1
   and 2 must be seeded with rows that the **current** code returns, so the tests fail
   before the fix — confirm this by running them pre-fix and say so in your report.
7. `npx tsc --noEmit` 0 errors; `npm run lint` clean on touched files; `npm run
   test:fast` ≥2313 passing.

---

## DV-3 — DataVault-backed dropdowns resolve against an endpoint that does not exist ✅

**Priority: P0 (bug)** · Size: M · File: new `server/routes/datavault/options.routes.ts` + `client/src/components/runner/blocks/choice/useChoiceOptions.ts`

> **Review pass 1 — 2026-08-02 (reviewer): SENT BACK.** One blocker; everything
> else reviewed and sound. Not committed.
>
> **Blocker — the global `client/src/lib/queryClient.ts` change must be reverted.**
> `apiRequest` was switched from `getAccessToken()` to
> `getAuthHeaders().Authorization`. That changes auth for **all 15 `apiRequest`
> call sites app-wide**, including `AdminUsers.tsx`, `AdminAiSettings.tsx` and
> `AdminUserWorkflows.tsx` — and `getAuthHeaders()` ranks a **run token above** the
> user's JWT with no endpoint restriction: step 2 loops over *every* path segment
> and returns the first stored run token it finds. So on `/run/*` or `/preview/*`
> (or any URL with a segment matching a stored run id), ordinary authenticated
> requests would start carrying a narrow run token instead of the user's JWT.
>
> This contradicts an invariant documented in the very file the change imports
> from — `fetchAPI` in `vault-api.ts`:
> ```ts
> // IMPORTANT: Only send run tokens for run-specific endpoints
> // Builder endpoints (workflows, sections, steps, etc.) should use session auth
> const isRunEndpoint = endpoint.startsWith('/api/runs/');
> if (runToken && isRunEndpoint) { ... } else if (globalAccessToken) { ... }
> ```
> **Required fix:** revert `queryClient.ts` entirely, then get the run token onto
> *this one request* without changing global behaviour — either extend the
> `isRunEndpoint` allowlist to cover the options endpoint (keeping the
> else-branch precedence intact), or have `fetchTableOptions` attach the token
> explicitly. AC5 still has to pass, so a public-run test must cover whichever
> route you choose. Keep the `fetchAPI` precedence rule: **run token only for
> endpoints that are genuinely run-scoped, user JWT otherwise.**
>
> **Reviewed and accepted, do not redo:**
> - `options.routes.ts` is sound — Zod on every param, `optionalHybridAuth` +
>   the existing `creatorOrRunTokenAuth` (a proper donor reuse), 401 when neither
>   identity is present, run-token tenant resolved from the run's workflow,
>   `verifyTenantOwnership` + `requirePermission` for user callers, columns
>   verified to belong to the table → 400, `showArchived: false`, response
>   projected to `{value,label}` only, `classifyRouteError` on the way out.
> - The `userId && !runAuth` guard is *defensive redundancy*, not a hole: the
>   reviewer checked `creatorOrRunTokenAuthLogic`, which `return next()`s as soon
>   as a `userId` exists and therefore never populates `runAuth` alongside one.
>   So an in-tenant ACL bypass is **not** reachable. Leave it as-is.
> - The `useChoiceOptions.ts` rewrite is clean: dead `TableRow`/`TableResponse`
>   interfaces deleted, `normalizeChoiceOptions` still the single choke point, the
>   deliberately-narrow effect dependency array untouched.
> - Live proof accepted: 200 with three projected `{value,label}` pairs.
>
> Reviewer did **not** re-run the full gates this pass — they will be re-run in
> the main checkout once the blocker is fixed, since the dev's own `test:fast`
> green came from a temporary physical dependency install that no longer exists.

> **Review pass 2 — 2026-08-02 (reviewer): PASS.** Blocker fixed, all 9 criteria
> met, committed.
> **Blocker closed:** `queryClient.ts` reverted and proved byte-identical by blob
> hash (`4f7474b1` both sides), independently re-verified by the reviewer. The dev
> chose option (b) — request-scoped auth — attaching `getAuthHeaders()` to the
> single options GET, so all 15 other `apiRequest` call sites keep JWT-only
> behaviour and the `fetchAPI` run-token invariant is intact.
> Gates re-run by the reviewer in the **main checkout under its normal install,
> no workaround**: `npx tsc --noEmit` 0 errors, `npm run lint` exit 0,
> `npm run test:fast` **182 files / 2319 passed** (2318 + 1, matching the dev's
> figure exactly), and a **regression sweep across all 8 DataVault integration
> suites → 122/122 passed** — run because this ticket changed route registration
> in `datavault.routes.ts`, which the per-ticket suite alone would not have caught.
> **Regression value proved:** reverting only `useChoiceOptions.ts` fails both new
> client tests, each showing the dead `/api/tables/tbl-1/rows` URL.
> **Coverage checked, not assumed:** test counts compared against main —
> `useChoiceOptions.test.tsx` 7→8, `datavault.rowArchive.routes.test.ts` 13→13
> (mocks only). No existing test was replaced or silently dropped.
> **Accepted deviation:** the fix uses raw `fetch` rather than the `apiRequest`
> helper the ticket named, to keep auth request-scoped. Reasonable, and safer than
> the alternative — but it forgoes `apiRequest`'s 401-refresh/retry, so an expired
> JWT makes the dropdown show its error state instead of refreshing. Filed as
> **DV-B5**; not worth blocking on for a dropdown that degrades visibly.

### Finding

A choice question can be configured with `options: { type: 'table_column', tableId,
columnId, labelColumnId, limit }` (see `DynamicOptionsConfig` in
`shared/types/stepConfigs.ts`). At run time `fetchTableOptions()` in
`useChoiceOptions` resolves it like this:

```ts
const response = await fetch(
    `/api/tables/${tableId}/rows?limit=${limit}`,
    { credentials: 'include' }
);
...
const rows = data.rows ?? [];
return rows.map((row: TableRow, idx: number) => {
    const idVal = row.data[columnId];
    ...
});
```

Three independent breaks:

1. **`/api/tables/:tableId/rows` does not exist.** Grepping the whole `server/` tree
   for `api/tables` returns nothing; DataVault rows are served from
   `/api/datavault/tables/:tableId/rows`. The fetch 404s, `response.ok` is false, and
   the hook throws `Failed to fetch table data: Not Found` → caught in the effect →
   `error` set and `options` set to `[]`.
2. **Wrong response shape.** The hook reads `row.data[columnId]`. The DataVault rows
   endpoint returns `{ rows: [{ row, values }], pagination }` — values keyed by column
   id under `values`, and there is no `data` property anywhere (same root confusion as
   DV-1).
3. **Wrong auth for the actual use case.** `credentials: 'include'` sends cookies, but
   the app authenticates with a stateless JWT bearer via `apiRequest`. A public
   interview run has no user session at all — only a run token — so even a corrected
   URL would 401 on the exact surface that matters most.

`table_column` is resolved **nowhere else** — grepping `server/` and `shared/` for
`table_column` finds only the type union and a Zod enum. There is no server-side
resolver. `tests/integration/dynamic_options_workflow.test.ts` only asserts that such
a workflow can be *configured*; it never resolves the options, which is why this has
stayed green.

Net effect: **a DataVault-backed dropdown in a live interview always renders empty**,
with an error in the hook's state.

### Preferred fix

Per **decision D-1**, resolve server-side. Add `GET
/api/datavault/tables/:tableId/options?columnId=&labelColumnId=&limit=` that returns
`{ options: [{ value, label }] }` and nothing else — no row ids, no unbound columns.

- Register it in `server/routes/datavault/` alongside the existing files and wire it
  from the same place they are (follow `rows.routes.ts` exactly for structure: Zod
  parse, `classifyRouteError`, `asyncHandler`).
- **Auth:** accept both an authenticated user and an active run token. Use
  `optionalHybridAuth` plus the run-token check the runner's other endpoints use —
  find the donor by grepping the run routes for how a run token is validated, and
  mirror it rather than inventing a scheme. When the caller is a user, enforce
  `datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read')` as
  every other row route does. When the caller is a run token, scope to the run's
  workflow tenant — a run token must not be able to read a table outside its own
  tenant.
- Read rows through `datavaultRowsService.getRowsWithOptions` (already tenant-checked,
  already excludes archived rows) and project to `{ value, label }`, falling back to
  the value column when `labelColumnId` is absent — matching the current client
  intent (`labelColumnId ?? columnId`).
- Cap `limit` with the existing `paginationSchema` / `DATAVAULT_CONFIG` constants
  rather than a new magic number.
- Client: replace `fetchTableOptions`'s body with a call to the new endpoint through
  the app's normal `apiRequest` helper (so auth headers are attached), and map
  `{ value, label }` straight into `ChoiceOption` (`id`/`alias` = value, `label` =
  label). Keep `normalizeChoiceOptions` as the single choke point — do not bypass it.
- Delete the `row.data[...]` shape and the `TableRow`/`TableResponse` interfaces it
  needed.

Do **not** widen the effect's dependency array in `useChoiceOptions` — the comment
there explains at length why it is deliberately narrow, and widening it reintroduces a
network request per keystroke.

### Ties

- Shares the "`data` blob vs EAV" root cause with **DV-1**, but a different file and a
  different fix; parallel-safe.
- Load **`add-api-endpoint`** (this is a new endpoint — the error-string contract and
  tenancy checks are the whole point), **`run-tests`**, and **`design`** if any visible
  state changes (an empty-vs-loading-vs-error dropdown state is UI).
- Related backlog: `LIST-B5` (dynamic options for **list** fields) is a *different*,
  still-parked product decision — do not try to solve it here.
- Existing coverage: `tests/unit/client/useChoiceOptions.test.tsx`,
  `tests/integration/dynamic_options_workflow.test.ts` (extend the latter to actually
  resolve).
- File footprint: new route file + its registration + `useChoiceOptions.ts`. Collides
  with nothing in this initiative.

### Acceptance criteria

1. `GET /api/datavault/tables/:tableId/options?columnId=…` returns
   `{ options: [{ value, label }] }` for a table the caller can read.
2. `labelColumnId` omitted → `label` falls back to the value column's value.
3. Archived rows do not appear in the options.
4. A user **without** read permission on the table gets **403**; an unknown `tableId`
   gets **404**; a missing/invalid `columnId` gets **400**.
5. A caller presenting a **valid run token** for a run in the table's tenant gets
   options; a run token for a run in a **different** tenant gets 403/404 (state which
   and be consistent with the donor pattern).
6. The response body contains **no** row ids and no columns other than the requested
   value/label pair.
7. In the runner, a `type: 'table_column'` choice question renders its options with no
   console error — asserted in `tests/unit/client/useChoiceOptions.test.tsx` against a
   mocked successful response, and end-to-end in
   `tests/integration/dynamic_options_workflow.test.ts` by resolving options for a
   seeded table.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean on touched files; `npm run
   test:fast` ≥2313 passing.
9. **Live proof required:** drive the dev app, open an interview containing a
   DataVault-backed dropdown, and attach a screenshot of the populated dropdown plus
   the network entry showing a 200 from the new endpoint. Use the **`verify`** skill.

---

## Phase 1 Gate

- [ ] DV-1, DV-2, DV-3 all ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run lint` → clean (repo-wide; it runs `--max-warnings 0`)
- [ ] `npm run test:fast` → ≥2313 passing, 0 failures
- [ ] `npm run test:integration` → no new failures vs. baseline
- [ ] One batched live drive-through covering DV-1 and DV-3 (a read_table block feeding
      a DataVault-backed dropdown in one interview proves both)
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 2 — Row-write data integrity

DataVault is presented as a database: columns declare `required`, `is_unique`,
`is_primary_key`, and auto-numbering. Two of those four are not enforced, and the
shared validation routine misbehaves on partial updates. This phase makes the declared
constraints real.

Out of scope: the grid UI (Phase 3), and the unreachable writeback path (Phase 4).

## DV-4 — `isUnique` / `isPrimaryKey` are never enforced on write 🔲

**Priority: P0 (bug)** · Size: M · File: `server/services/DatavaultRowsService.ts`

### Finding

`DatavaultColumnsService` lets a column be marked unique, and validates the flag at
the moment it is set:

```ts
private async validateUniqueConstraint(columnId: string, isUnique: boolean, tx?) {
  if (isUnique) {
    const hasDuplicates = await this.rowsRepo.checkColumnHasDuplicates(columnId, tx);
    if (hasDuplicates) { throw new Error('Cannot make this column unique because it contains duplicate values. ...'); }
  }
}
```

It also forces uniqueness onto primary keys — `const isUnique = data.isPrimaryKey ?
true : (data.isUnique ?? false)` — and `DatavaultTablesService.createTable` creates
every new table's key column with `isUnique: true`.

**Nothing enforces it afterwards.** `validateRowData()` in `DatavaultRowsService` —
the single path all row writes funnel through — checks `required`, coerces by type, and
validates reference targets and select options, but never once reads `column.isUnique`
or `column.isPrimaryKey`. Grepping `server/` for `isUnique` outside the columns service
finds only schema definitions, the portability entity graph, and the cloner. There is
no unique index on `datavault_values` that could catch it either: the only unique index
is `datavault_values_row_column_unique` on `(row_id, column_id)`, which enforces one
value per cell — not value uniqueness within a column.

Consequences: a "primary key" column happily accepts unlimited duplicates via the
grid, the API, and the Send-Data-To-Table block. Worse, duplicate keys silently break
the *lookup* semantics built on top of them — `WriteRunner.executeUpdate` /
`executeUpsert` resolve a match with `findRowByColumnValue`, which does `.limit(1)`, so
with duplicates an update silently mutates an arbitrary one of them.

Secondary defect in the same helper: `checkColumnHasDuplicates` groups on raw jsonb
with no null handling —

```sql
EXISTS (SELECT value FROM datavault_values WHERE column_id = ? GROUP BY value HAVING COUNT(*) > 1)
```

— so two rows that merely have *empty* values for the column count as duplicates, and
marking a sparsely-filled column unique fails with a misleading message. It also
ignores `deleted_at`, so archived rows block the flag.

### Preferred fix

Enforce uniqueness inside `validateRowData()`, where every write already converges —
do **not** add checks at each call site. For each column in the incoming values that
is `isUnique || isPrimaryKey` and whose coerced value is non-null, verify no *other*
live row in the table holds that value.

Add one repository method to `DatavaultRowsRepository` for this — mirror the shape of
the existing `findRowByColumnValue` (same join, same `datavault_values` predicate) but
returning conflicting row ids and taking an `excludeRowId` so updates don't collide
with themselves. Batch it: one query for all unique columns in the write, not one per
column (mirror `batchFindByIds`'s single-query-with-`inArray` style).

Throw with a message the route layer already maps to a 4xx. `rows.routes.ts` currently
special-cases `raw.includes('not a valid option') || raw.includes('missing') ||
raw.includes('Required')` before falling through to `classifyRouteError`. **Do not add
a fourth ad-hoc substring** — use the `add-api-endpoint` skill's error-string contract
so `classifyRouteError` maps it, and if that requires a small addition to
`classifyRouteError`, do that instead and say so.

Also fix `checkColumnHasDuplicates` to ignore null/empty jsonb values and archived
rows, so the flag can be turned on for a sparsely-populated column.

A DB-level partial unique index would be the stronger guarantee, but it cannot be
expressed per-column on an EAV table without a schema change — **out of scope here**;
it is filed as DV-B2.

### Ties

- **Sequence: DV-4 → DV-5 → DV-6.** All three edit `DatavaultRowsService.ts` (DV-4 and
  DV-5 both edit `validateRowData` itself). Do not dispatch them in parallel.
- DV-4 also touches `DatavaultRowsRepository.ts`, which DV-6/7/8/9 touch — another
  reason to sequence.
- **DV-7** depends on this conceptually: its duplicate-insert race is only fully closed
  once uniqueness is enforced. Note the dependency; do not fix DV-7 here.
- Load **`add-api-endpoint`** (error-string contract is load-bearing for AC 4) and
  **`run-tests`**.
- Existing coverage: `tests/unit/services/DatavaultRowsService.test.ts`,
  `tests/unit/services/DatavaultColumnsService.test.ts`,
  `tests/integration/datavault.routes.test.ts`.

### Acceptance criteria

1. Creating a row with a value that duplicates an existing live row's value in an
   `isUnique` column is **rejected**, with a message naming the column.
2. Same for `isPrimaryKey` columns, including the key column auto-created by
   `createTable`.
3. Updating a row and re-submitting **its own** current value in a unique column
   **succeeds** (no self-collision).
4. The rejection surfaces as HTTP **409 or 400** (pick one, state it, be consistent)
   from both `POST /api/datavault/tables/:tableId/rows` and `PATCH
   /api/datavault/rows/:rowId` — **not** 500.
5. A duplicate value in a column that is neither unique nor a primary key is still
   accepted.
6. Uniqueness is checked against live rows only: a value held solely by an **archived**
   row does not block a new row.
7. `checkColumnHasDuplicates` returns false when the only repetition is null/empty
   values, so a sparsely-filled column can be marked unique.
8. Unique enforcement costs **one** query regardless of how many unique columns are in
   the write — assert via a spy on the repository method, or state the query count in
   your report.
9. New tests in `tests/unit/services/DatavaultRowsService.test.ts` assert 1–3, 5–7, and
   in `tests/integration/datavault.routes.test.ts` assert 4.
10. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
    passing.

---

## DV-5 — Partial row updates falsely fail on required columns and regenerate auto-numbers 🔲

**Priority: P0 (bug)** · Size: S · File: `server/services/DatavaultRowsService.ts`

*(Two defects, deliberately one ticket: both live inside `validateRowData()` and a fix
for either rewrites the same loop.)*

### Finding

`updateRow` documents itself as validating "only for provided columns" —

```ts
// Validate and coerce values (only for provided columns)
const validatedValues = await this.validateRowData(row.tableId, values, tx);
```

— but `validateRowData()` is written for creates and treats the incoming map as a
complete row:

```ts
// Check required columns (excluding auto_number columns)
for (const column of columns) {
  if (column.required && column.type !== 'auto_number' && column.type !== 'autonumber' && !(column.id in values)) {
    throw new Error(`Required column '${column.name}' is missing`);
  }
}
...
for (const column of columns) {
  if (column.type === 'auto_number' && !(column.id in values)) {
    const startValue = column.autoNumberStart ?? 1;
    const nextNumber = await this.rowsRepo.getNextAutoNumber(tenantId, tableId, column.id, startValue, tx);
    values[column.id] = nextNumber;   // <-- mutates the caller's object
  }
}
```

On the update path this produces two wrong behaviours:

1. **A partial update of a table that has any required column fails**, with
   `Required column 'X' is missing`, even when the patch has nothing to do with X.
   `PATCH /api/datavault/rows/:rowId` accepts exactly the values the caller sends
   (`z.record(z.string(), z.any())`) and passes them straight through, so any
   well-formed partial PATCH against such a table is rejected.
2. **An `auto_number` column is re-generated on every update** that doesn't include
   it: `getNextAutoNumber` increments the tenant's counter row and the new number is
   upserted over the row's existing one. The row's identifier changes under the user,
   and the sequence burns a value per edit.

Both are masked in the main grid because `InfiniteEditableDataGrid` re-sends the whole
value map on a single-cell edit:

```ts
await datavaultAPI.updateRow(rowId, { ...row.values, [columnId]: value });
```

They are **not** masked for any other caller: `RowEditorModal`, `RowDetailDrawer`, the
`WriteRunner` update path (which sends only mapped columns), and any external/API
consumer doing a genuine partial patch.

### Preferred fix

Give `validateRowData` an explicit mode instead of inferring intent from the value
map — e.g. a `mode: 'create' | 'update'` argument (or a small options object).

- `create`: current behaviour — enforce required-present, generate missing
  auto-numbers.
- `update`: skip the required-presence loop entirely (still reject an explicit `null`
  for a required column via `validateAndCoerceValue`, which already does this — keep
  that), and **never** generate auto-numbers.

Stop mutating the caller's `values` object; build the generated values into a local map
and merge. The current in-place mutation is why the update path's damage escapes the
function at all.

`_createRowImpl` passes `'create'`, `_updateRowImpl` passes `'update'`. Do not change
either method's public signature.

### Ties

- **Sequenced after DV-4** — both edit `validateRowData()`; DV-4's unique check lands
  in the same loop this ticket restructures. Read DV-4's diff first.
- **DV-6** (the `autonumber` type) edits the same generation loop and comes after this.
- Load **`add-api-endpoint`** and **`run-tests`**.
- Existing coverage: `tests/unit/services/DatavaultRowsService.test.ts`,
  `tests/integration/datavault.autonumber.test.ts`.

### Acceptance criteria

1. `PATCH /api/datavault/rows/:rowId` with a values map that **omits** a required
   column **succeeds** (204).
2. `PATCH` that explicitly sets a required column to `null` is still **rejected**.
3. `POST` (create) that omits a required column is still **rejected** with `Required
   column 'X' is missing`.
4. After two consecutive partial updates of a row in a table with an `auto_number`
   column, the row's auto-number value is **unchanged**, and the tenant's
   `datavault_number_sequences.next_value` has **not** advanced.
5. Creating two rows still yields **distinct, increasing** auto-numbers (no
   regression).
6. `validateRowData` does not mutate the `values` object passed to it — asserted
   directly.
7. New tests in `tests/unit/services/DatavaultRowsService.test.ts` assert 1–3 and 6;
   `tests/integration/datavault.autonumber.test.ts` asserts 4–5. The test for 4 must be
   seeded so it **fails before the fix** — confirm and report.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## DV-6 — The `autonumber` column type is never generated 🔲

**Priority: P1** · Size: M · File: `server/services/DatavaultRowsService.ts`, `server/repositories/DatavaultRowsRepository.ts`

### Finding

`datavaultColumnTypeEnum` contains **both** `'auto_number'` and `'autonumber'`. The
schema gives `autonumber` a full feature set that `auto_number` lacks —
`autonumberPrefix`, `autonumberPadding`, `autonumberResetPolicy` on
`datavault_columns`, mirrored by `prefix`, `padding`, `reset_policy`, `last_reset` on
`datavault_number_sequences`.

**None of it is ever used.** The generation loop in `validateRowData` matches only the
legacy type:

```ts
if (column.type === 'auto_number' && !(column.id in values)) {
```

and `getNextAutoNumber` returns a bare integer, never reading prefix, padding, or
reset policy:

```ts
const nextValue = sequence?.nextValue ?? startValue;
...
return nextValue;
```

Grepping `server/` for `autonumberPrefix` finds only the schema, the portability entity
graph's field list, and `WorkflowClonerService` copying the values across — no reader.

So an `autonumber` column:

- is skipped by generation, so its value stays null;
- is *exempted* from the required check (`column.type !== 'autonumber'`), so the null
  is accepted silently;
- is treated as a normal editable field by the UI — `RowEditorModal` only special-cases
  `auto_number` (`const isAutoNumber = column.type === "auto_number"`), so the user is
  asked to type their own "auto" number;
- never gets a prefix or zero-padding, and `resetPolicy: 'yearly'` never resets.

### Preferred fix

Generate `autonumber` alongside `auto_number` in the same loop, and format it in the
repository where the counter already lives.

- Extend `getNextAutoNumber` (or add a sibling that shares its locking body) to read
  the sequence row's `prefix`, `padding` and `resetPolicy` and return the formatted
  string: `${prefix ?? ''}${String(n).padStart(padding, '0')}`. Keep the existing
  `FOR UPDATE` counter-lock structure exactly as-is — it is correct and its comment
  explains why; do not swap it for a Postgres sequence.
- Implement `resetPolicy: 'yearly'`: when `last_reset` is null or in a previous
  calendar year, reset `next_value` to the column's start value and stamp `last_reset`,
  **inside the same locked transaction**.
- Seed `prefix`/`padding`/`resetPolicy` into the counter row from the column config.
  `createNumberSequence` currently only seeds `nextValue`; carry the rest, and keep it
  idempotent. Note `getNextAutoNumber`'s self-heal upsert also needs them, or a
  pre-existing counter row will keep formatting with defaults.
- Make the UI treat `autonumber` as read-only exactly as it treats `auto_number` —
  `RowEditorModal`'s `isAutoNumber` check and its required-field filter both need the
  second type. Grep the client for `"auto_number"` and fix every such single-type
  check.

If the two enum values are in fact redundant and `autonumber` should simply be retired
in favour of `auto_number` + config, **stop and raise that** rather than implementing
both — it is a schema decision, and `db-schema-change` plus the repo owner's ruling
apply. Do not silently pick one.

### Ties

- ⚠️ **Carried forward from DV-1 (landed 2026-08-02).** DV-1 added
  `sortExpression()` to `ReadTableBlockRunner.ts`, which casts **both**
  `auto_number` and `autonumber` columns to `::numeric` for sorting. That is safe
  only because `autonumber` values are currently always null. The moment this
  ticket makes `autonumber` emit a prefixed string like `INV-0001`, sorting a
  read_table block by that column throws Postgres 22P02. **Change the
  `autonumber` case in `sortExpression()` to sort as text (or to sort by the
  underlying sequence) as part of this ticket, and add a test for it.**
- **Sequenced after DV-4 and DV-5** — same file, and DV-5 restructures the exact
  generation loop this ticket extends.
- Also edits `DatavaultRowsRepository.ts` → collides with DV-7, DV-8, DV-9.
- Load **`db-schema-change`** (only if you conclude a schema/enum change is needed —
  and if so, escalate first), **`add-api-endpoint`**, **`run-tests`**, and **`design`**
  for the read-only field treatment.
- Existing coverage: `tests/integration/datavault.autonumber.test.ts`.

### Acceptance criteria

1. Creating a row in a table with an `autonumber` column populates that column
   automatically; the caller does not supply it.
2. The generated value honours `autonumberPrefix` and `autonumberPadding` — e.g.
   prefix `INV-`, padding 4, start 1 → `INV-0001`, then `INV-0002`.
3. With `autonumberResetPolicy: 'never'`, values keep incrementing across calendar
   years.
4. With `'yearly'`, the first generation in a new calendar year restarts at the
   column's start value and updates `last_reset` (simulate by back-dating
   `last_reset`).
5. Concurrent creates produce **distinct** `autonumber` values (extend the existing
   concurrency assertion for `auto_number`).
6. An `autonumber` column is rendered read-only in the row editor and is not listed as
   a missing required field.
7. Partial updates do not regenerate an `autonumber` value (the DV-5 guarantee extends
   to the new type).
8. New/updated tests in `tests/integration/datavault.autonumber.test.ts` assert 1–5
   and 7; a client test asserts 6.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## DV-7 — Upsert writes bypass validation, can duplicate, and match archived rows 🔲

**Priority: P1** · Size: M · File: `server/lib/writes/WriteRunner.ts`, `server/repositories/DatavaultRowsRepository.ts`

### Finding

Three defects in the Send-Data-To-Table write path, all in the match/upsert code.

**(a) The upsert-update branch skips all validation.** Create and update go through
the service; upsert-update goes straight to the repository:

```ts
const valueList = Object.entries(values).map(([columnId, value]) => ({ columnId, value }));
await datavaultRowsRepository.updateRowValues(existingRowId, valueList, userId, tx);
```

`updateRowValues` upserts raw jsonb. So an upsert-update writes values that never pass
`validateAndCoerceValue`: a non-numeric string into a `number` column, an option not in
a `select` column's list, a non-UUID into a `reference` column, an unbounded value that
skips `assertValueSizeWithinLimit`. The same block via `mode: 'update'` validates
correctly — identical user intent, different guarantees.

**(b) The documented race fix does not hold.** The comment claims otherwise, then
concedes it:

```ts
// RACE CONDITION FIX: Use row-level locking (SELECT FOR UPDATE) to prevent race conditions
// This locks the row if it exists, preventing another transaction from inserting a duplicate
const existingRowId = await this.findRowIdByColumnValue(tableId, matchColumnId, matchValue, tenantId, tx, true);
...
// NOTE: Between check and insert, another transaction might create the row
// But SELECT FOR UPDATE ensures no duplicate exists at check time
```

`SELECT … FOR UPDATE` locks rows that exist; it takes no lock when the result is empty.
Two concurrent upserts for a not-yet-existing key both find nothing and both insert.
Nothing downstream catches it — per **DV-4**, uniqueness is unenforced.

**(c) The match query ignores soft deletes.**
`DatavaultRowsRepository.findRowByColumnValue` filters on `tableId` and the value only:

```ts
.where(and(eq(datavaultRows.tableId, tableId), eq(datavaultValues.value, value as string)))
.limit(1)
```

No `isNull(datavaultRows.deletedAt)`. So an `update` or `upsert` can silently target an
**archived** row — resurrecting deleted data — while the user sees no live row with
that key. The method also takes `tenantId` only to discard it (`void tenantId; //
Tenant check implicit via tableId ownership verification`); that reasoning holds for
today's callers, which all verify the table first, but it makes the method unsafe to
reuse.

### Preferred fix

- **(a)** Route the upsert-update branch through `datavaultRowsService.updateRow(...)`,
  exactly as `executeUpdate` does. Delete the direct `updateRowValues` call and the now
  unused `valueList` construction. (`updateRow` will accept the partial map once DV-5
  lands — that is the dependency below.)
- **(c)** Add `isNull(datavaultRows.deletedAt)` to `findRowByColumnValue`, and stop
  discarding `tenantId`: join `datavault_tables` and scope on it, mirroring
  `batchVerifyOwnership`. Remove the `void tenantId` line.
- **(b)** Make the duplicate impossible rather than narrowing the window: once DV-4
  enforces uniqueness, the second insert is rejected. Catch that conflict in
  `executeUpsert` and retry the match once, then update — the standard
  insert-then-retry upsert. Replace the misleading comments with an accurate note about
  what actually provides the guarantee. If DV-4 has not landed when you pick this up,
  **stop and say so** rather than reimplementing uniqueness here.

Separately: `executeWrite` logs the entire block config at `info`, including resolved
column mappings (`logger.info({ operation: "write_start", mode, config, ... })`). That
is interview answers — potentially PII — in application logs. Drop `config` from the
log payload and keep the ids.

### Ties

- **Depends on DV-4** (uniqueness) and **DV-5** (partial updates through
  `updateRow`). Dispatch after both are ✅.
- Edits `DatavaultRowsRepository.ts` → collides with DV-6, DV-8, DV-9; sequence.
- Load **`add-api-endpoint`** and **`run-tests`**.
- Existing coverage: `tests/unit/writes/WriteRunner.test.ts`,
  `tests/integration/dataBlocks.test.ts`.

### Acceptance criteria

1. An upsert whose match finds an existing row and whose values include an **invalid**
   value for a column type (non-numeric for `number`, unlisted option for `select`,
   non-UUID for `reference`) is **rejected** — same error as the `update` mode for the
   same input.
2. A valid upsert-update still writes the values and returns `operation: 'update'`.
3. `findRowByColumnValue` does **not** match an archived row: an upsert whose key
   exists only on an archived row **creates a new row** rather than updating the
   archived one.
4. `findRowByColumnValue` returns null for a table in a different tenant even when the
   value matches; no `void tenantId` remains in the method.
5. Two concurrent upserts with the same new match value produce **exactly one** row.
6. `executeWrite`'s log payload no longer includes `config` (or any resolved values);
   asserted with a logger spy, or demonstrated in your report.
7. New/updated tests in `tests/unit/writes/WriteRunner.test.ts` assert 1–4 and 6, and
   `tests/integration/dataBlocks.test.ts` asserts 5.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## Phase 2 Gate

- [ ] DV-4, DV-5, DV-6, DV-7 all ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥2313 passing · `npm run test:unit:db` no new failures
- [ ] `npm run test:integration` → no new failures vs. baseline
- [ ] Live proof: in the running app, create a row that violates a unique column and
      confirm a 4xx with a readable message (not a 500); edit one cell in a table that
      has a required column and an auto-number column, and confirm the auto-number is
      unchanged
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 3 — Grid, filter and count correctness

The DataVault grid is the primary human surface. It currently shows filters that do
nothing and counts that include deleted rows.

## DV-8 — The server ignores the `filters` query param, so the filter panel does nothing 🔲

**Priority: P1** · Size: M · File: `server/routes/datavault/rows.routes.ts`, `server/repositories/DatavaultRowsRepository.ts`, `client/src/components/datavault/FilterPanel.tsx`

### Finding

Two defects in one feature.

**(a) Filters are sent and dropped.** The client serialises them:

```ts
if (options?.filters && options.filters.length > 0) {
  params.append('filters', JSON.stringify(options.filters));
}
```

(`datavault-api.ts`, `listRows`). They are threaded all the way through real UI —
`FilterPanel` writes to `useDatavaultFilterStore`, `[tableId].tsx` reads it into
`apiFilters` and passes `filters={apiFilters}` to `InfiniteDataGrid`, which puts them
in the query key and the request.

`GET /api/datavault/tables/:tableId/rows` reads `limit`, `offset`, `showArchived`,
`sortBy`, `sortOrder` — and **never `req.query.filters`**. Nothing filters client-side
either. So the panel reports `Filters (2)` in its header while the grid shows every
row. Users get silently wrong data — the worst failure mode of the three grid bugs.

**(b) The operator list is keyed on the wrong type vocabulary.**
`getOperatorsForType` in `FilterPanel` switches on `short_text`, `long_text`,
`multiple_choice`, `radio`, `checkbox`, `yes_no` — those are **workflow step types**,
not DataVault column types. The actual `datavaultColumnTypeEnum` values are `text`,
`number`, `boolean`, `date`, `datetime`, `email`, `phone`, `url`, `json`,
`auto_number`, `autonumber`, `reference`, `select`, `multiselect`. Only `number`,
`date`, `datetime` and `boolean` overlap. Every `text`/`email`/`select`/`multiselect`
column therefore falls to `default` and is offered only
`equals`/`not_equals`/`is_empty`/`is_not_empty` — **`contains` is never offered for a
text column**, though the operator exists and is the one users reach for. (`checkbox`
is not even a step type any more — it was retired.)

### Preferred fix

**Server:** parse and apply `filters`. Validate with Zod rather than trusting
`JSON.parse` — an array of `{ columnId: uuid, operator: <enum>, value: unknown }`,
capped in length by a `DATAVAULT_CONFIG` constant, rejecting unknown operators with
400. Push the predicate down into `DatavaultRowsRepository.getRowsWithValues` /
`findByTableId` **and** `countByTableIdWithFilter`, so `total` and `hasMore` describe
the filtered set — a filtered grid whose total counts unfiltered rows paginates
wrongly.

Build the predicates as **correlated `EXISTS` subqueries over `datavault_values`**,
collecting them into a single `and(...)` for one `.where()` call. **Read DV-2 before
writing this** — the identical mutate-and-discard `.where()` trap is what made that a
cross-tenant leak, and this is the same query shape. Compare typed, not raw jsonb:
cast to `numeric` for `number` columns and to `timestamptz` for date/datetime, matching
the cast style DV-1 establishes.

**Client:** rewrite `getOperatorsForType` against the real
`datavaultColumnTypeEnum` values, and make sure every operator you offer is one the
server implements — the two lists must not drift again. `text`/`email`/`phone`/`url`
get the string set including `contains`/`not_contains`; `select`/`multiselect` get
`equals`/`not_equals`/`in`/`not_in`/`is_empty`/`is_not_empty`; `reference` and `json`
get the conservative default. Delete the dead step-type cases rather than leaving them
alongside.

### Ties

- **Read DV-2 first** — same `.where()` hazard, same EAV `EXISTS` shape. Ideally land
  DV-1/DV-2 before this so there is a donor pattern in the tree.
- Edits `DatavaultRowsRepository.ts` → collides with DV-6, DV-7, DV-9; sequence.
  **DV-13 also touches `rows.routes.ts` and must run after this.**
- Load **`add-api-endpoint`**, **`run-tests`**, and **`design`** (the filter panel is
  UI — this is the standing repo rule).
- Existing coverage: `tests/integration/datavault.routes.test.ts`,
  `tests/unit/repositories/DatavaultRowsRepository.test.ts`, and the component tests
  under `tests/unit/components/datavault/`.

### Acceptance criteria

1. `GET /api/datavault/tables/:tableId/rows?filters=[…]` with an `equals` filter
   returns only matching rows.
2. `contains` on a text column, `greater_than` on a number column (numeric, not
   lexicographic — 10 > 9), a date comparison, `is_empty`, and `in` all filter
   correctly.
3. Two filters are **ANDed** (a row matching only one is excluded).
4. `pagination.total` and `hasMore` reflect the **filtered** count, not the table
   total.
5. Filters compose correctly with `showArchived=false` (archived rows stay excluded)
   and with `sortBy`.
6. A malformed `filters` param, an unknown operator, a non-uuid `columnId`, or more
   than the configured maximum number of filters → **400**, not 500 and not silently
   ignored.
7. A filter on a `columnId` from **another table** returns no rows and does not leak;
   it must not throw a 500.
8. In `FilterPanel`, a `text` column offers `contains`; a `select` column offers `in`;
   no operator is offered that the server does not implement (assert the client's
   operator set is a subset of the server's).
9. New tests in `tests/integration/datavault.routes.test.ts` assert 1–7; a component
   test asserts 8.
10. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
    passing.
11. **Live proof required:** drive the dev app, add a `contains` filter on a text
    column in the DataVault grid, and attach a screenshot showing the row count drop
    plus the network entry. Use the **`verify`** skill.

---

## DV-9 — Row counts include archived rows; column sorts compare jsonb lexicographically 🔲

**Priority: P1** · Size: S · File: `server/repositories/DatavaultRowsRepository.ts`

### Finding

**(a) Two count methods ignore `deleted_at`.** The repository has three counters and
only one filters soft deletes. `countByTableIdWithFilter` does it right:

```ts
if (!showArchived) { whereConditions.push(isNull(datavaultRows.deletedAt)); }
```

`countByTableId` and `countByTableIds` do not:

```ts
async countByTableId(tableId: string, tx?: DbTransaction): Promise<number> {
  const [result] = await database.select({ count: sql<number>`count(*)::int` })
    .from(datavaultRows).where(eq(datavaultRows.tableId, tableId));
```

`countByTableIds` is what feeds the table cards —
`DatavaultTablesService.listTablesWithStats` calls `this.rowsRepo.countByTableIds(...)`
— so **every table card overstates its row count by the number of archived rows**, and
disagrees with the grid's own footer, which uses the filtered counter.
`countByTableId` backs `DatavaultRowsService.countRows` with the same defect.

**(b) Sorting by a column value sorts raw jsonb.** In `findByTableId`:

```ts
.leftJoin(datavaultValues, and(eq(datavaultValues.rowId, datavaultRows.id), eq(datavaultValues.columnId, column.id)))
.where(and(...whereConditions))
.orderBy(sortDir(datavaultValues.value))
```

`datavault_values.value` is `jsonb`, so ordering is by jsonb collation, not by the
column's declared type. For a `number` column that means `10` sorts before `9`; for
`date` columns stored as ISO strings it happens to work, and for mixed types the order
is arbitrary. The grid's sort therefore looks broken on exactly the columns users most
want sorted.

### Preferred fix

**(a)** Add `isNull(datavaultRows.deletedAt)` to `countByTableId` and
`countByTableIds`. Prefer a `showArchived` parameter defaulting to `false`, so the
three counters share one convention — mirror `countByTableIdWithFilter`'s signature.
Check every caller compiles with the new default and that none was relying on the
inflated number.

**(b)** Cast in `ORDER BY` according to the column's declared `type`, which
`findByTableId` already fetches (it looks the column up by slug to get its id — take
`type` in the same `select`). `number` → `::numeric`, `date`/`datetime` →
`::timestamptz`, everything else → `#>>'{}'` text extraction so quoting doesn't leak
into the order. Guard the numeric cast against non-numeric junk in the column (a
`CASE`/`NULLIF` on the text form, or Postgres will error on a bad row) — do not let one
malformed value 500 the grid.

### Ties

- Edits `DatavaultRowsRepository.ts` → collides with DV-6, DV-7, DV-8. **Run last of
  the four**; DV-8 restructures the same `findByTableId` where-clause construction.
- Load **`add-api-endpoint`** and **`run-tests`**.
- Existing coverage: `tests/unit/repositories/DatavaultRowsRepository.test.ts`,
  `tests/integration/datavault.routes.test.ts`,
  `tests/unit/services/DatavaultTablesService.test.ts`.

### Acceptance criteria

1. With 3 live and 2 archived rows, the table-card stats from
   `listTablesWithStats` report **3**.
2. `countRows` (via `countByTableId`) reports **3** for the same fixture.
3. Passing `showArchived: true` reports **5**, so the archived view still has a
   correct total.
4. The grid footer total and the table card count **agree** for the same table —
   asserted directly against the same fixture.
5. Sorting ascending by a `number` column returns 2, 9, 10 in that order (not 10, 2,
   9).
6. Sorting by a `date` column orders chronologically; sorting by a text column is
   unaffected by JSON quoting.
7. A column containing a non-numeric value does not error the sort request (no 500).
8. New tests in `tests/unit/repositories/DatavaultRowsRepository.test.ts` assert 5–7
   and `tests/integration/datavault.routes.test.ts` asserts 1–4. The fixture for 1–2
   must contain archived rows so the assertion **fails before the fix** — confirm and
   report.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## Phase 3 Gate

- [ ] DV-8, DV-9 ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥2313 passing · `npm run test:integration` no new failures
- [ ] One batched live drive-through of the DataVault grid: filter, sort a number
      column, archive a row, confirm the card count and grid footer agree
- [ ] Reviewer has committed each passed ticket + this gate

---

# Phase 4 — Surface honesty & enterprise controls

Two features are advertised in the product but wired to nothing; one service is a
loaded gun with no trigger; and DataVault mutations leave no audit trail.

## DV-10 — Delete the unreachable declarative writeback path 🔲

**Priority: P1** · Size: M · File: `server/services/WritebackExecutionService.ts`, `server/services/workflow-runs/RunLifecycleService.ts`, `server/repositories/DatavaultWritebackMappingsRepository.ts`, `shared/schema/datavault.ts` + migration

### Finding

`datavault_writeback_mappings` has a table, a repository, a service
(`WritebackExecutionService`, ~160 lines), and a call site in
`RunLifecycleService.executeWritebacks()` reached from run completion. It is fully
implemented and **completely unreachable**: there is no route and no UI that creates a
mapping. Grepping `server/routes/` and `client/src` for `writeback` returns exactly one
hit — a display label in the export dialog:

```ts
datavault_writeback_mappings: "Writeback mappings",
```

So `datavaultWritebackMappingsRepository.findByWorkflowId(workflowId)` always returns
`[]`, and `executeWritebacksForRun` always short-circuits:

```ts
if (mappings.length === 0) {
  log.debug("No writeback mappings configured for workflow");
  return { rowsCreated: 0, errors: [] };
}
```

Meanwhile the capability it was meant to provide — an interview writing its answers
into a DataVault table — is delivered by the Send-Data-To-Table block
(`WriteBlockRunner` → `WriteRunner`), which is wired end to end and has a builder UI.

Per **decision D-2** this path is deleted rather than completed. Worth noting for the
implementer: had it been reachable it would have written raw step values straight into
typed columns (`rowValues[columnId] = value` with no projection), so a choice answer or
a List envelope would have landed as `[object Object]` — another reason not to revive
it.

### Preferred fix

Remove the dead path, in this order:

1. Delete the `executeWritebacks` call from `RunLifecycleService` and the method
   itself, plus `WritebackExecutionResult` from `server/services/workflow-runs/types.ts`
   if it becomes unused. Check `RunCompletionService` / `RunCompletionJobWorker` for a
   `kind: 'writebacks'` job type — if the completion outbox enqueues writeback jobs,
   that enqueue and its handler go too. **Do not leave an outbox job kind with no
   handler**; `tests/integration/run-completion-outbox.test.ts` and
   `tests/unit/services/RunCompletionJobWorker.test.ts` cover this area and will tell
   you.
2. Delete `WritebackExecutionService.ts` and
   `DatavaultWritebackMappingsRepository.ts`, and their exports from
   `server/repositories/index.ts` / the services barrel.
3. Remove `datavaultWritebackMappings` from `shared/schema/datavault.ts` (table,
   insert schema, type), `shared/schema/relations.ts`, and the portability entity graph
   (`server/services/portability/entityGraph.ts`) + `ExportWorkflowDialog`'s label
   map. Portability tests reference this node — expect
   `tests/unit/portability/entityGraph.test.ts` and `tests/integration/portability.import.test.ts`
   to need updating.
4. Generate a migration to drop the table. **Load `db-schema-change` first** — author
   migrations via `npm run db:generate` only, never by hand-editing the journal, and
   check for unmerged migrations before generating so you don't collide on the index.
5. Check `WorkflowClonerService` for mapping-copy code and remove it.

Delete, don't comment out. Grep for `writeback` (case-insensitive) across the repo at
the end; the only surviving hits should be in `migrations_archive/` and old migration
snapshots, which are historical and stay.

### Ties

- Independent of every other ticket in this initiative — dispatch in parallel with
  DV-11 and DV-12.
- Load **`db-schema-change`** (mandatory — there is a `DROP TABLE`) and
  **`run-tests`**.
- The repo owner has confirmed the database holds only test data, so there is no
  production writeback-mapping data to preserve.
- Touches run-completion and portability code; both have integration coverage, so run
  the integration project, not just `test:fast`.

### Acceptance criteria

1. `WritebackExecutionService.ts` and `DatavaultWritebackMappingsRepository.ts` no
   longer exist; no import of either remains.
2. `RunLifecycleService` has no `executeWritebacks` method and no writeback import; a
   run still completes successfully end to end.
3. No outbox job kind is enqueued that lacks a handler — the completion-outbox and
   job-worker tests pass unmodified in intent (updating them to drop writeback
   assertions is fine; leaving a dangling kind is not).
4. `datavaultWritebackMappings` is gone from `shared/schema/datavault.ts`,
   `relations.ts`, `entityGraph.ts`, and the export dialog's label map.
5. A generated migration drops `datavault_writeback_mappings`; `npm run db:migrate`
   applies cleanly on a fresh database, and the integration suite (which applies
   migrations itself) is green.
6. An export/import round trip still succeeds — `npm run test:integration
   portability` green, and the portability unit tests updated for the removed node.
7. `grep -ri writeback` over `server/`, `client/`, `shared/`, `tests/` returns no
   live-code hits.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing (minus any writeback-specific tests you deliberately deleted — state the
   new expected number and why).

---

## DV-11 — Stop issuing DataVault API tokens that authenticate nothing 🔲

**Priority: P1** · Size: S · File: `client/src/components/datavault/DatabaseApiTokens.tsx` + its parent, `server/routes/datavaultApiTokens.routes.ts`

### Finding

Customers can mint DataVault API tokens with scopes and an expiry, and the plaintext
token is returned once for them to save. `DatavaultApiTokensService` implements the
whole lifecycle properly — hashed storage, uniqueness check, scope validation, and a
verifier:

```ts
const tokenHash = hashToken(plainToken);
...
return token.scopes.includes(requiredScope);
```

**`validateTokenAndScope` has zero callers.** Grepping `server/` for it (and for
`datavaultApiTokensService.`) finds only the create/list/delete routes — no middleware
authenticates a DataVault token, and no endpoint accepts one. There is no external
DataVault API.

So the product hands out credentials that do nothing. A customer wiring an integration
against them gets 401s with no explanation, and we have distributed long-lived secrets
for an API that does not exist. (Same shape as the known-inert e-signature provider
registry.)

Per **decision D-3**: hide the surface now, build the API as its own initiative
(DV-B1).

### Preferred fix

Gate the token UI behind a feature flag that is **off by default**, using whatever flag
mechanism the repo already uses — grep for an existing pattern (env-var-backed config
or a feature-flag helper) and copy it; do not introduce a new flag system for one
switch. Hide the entry point, not just the panel body, so there is no dead tab.

Leave the server routes in place but make the state honest:

- Keep `POST` functional behind the same flag so the feature can be re-enabled for
  testing, **or** have it return 501/404 when the flag is off — pick one, state which,
  and make the client agree.
- Do **not** delete the service or the table: DV-B1 will use them, and existing token
  rows are harmless once nothing accepts them.

Add a short comment on `validateTokenAndScope` recording that it is intentionally
uncalled pending DV-B1, so the next audit doesn't re-file it as dead code.

If any existing tokens should be revoked as part of this, that is the repo owner's
call — **ask, don't decide**. The database holds only test data today, so the likely
answer is no.

### Ties

- Independent — dispatch in parallel with DV-10 and DV-12.
- Load **`design`** (mandatory: this removes a visible surface — make the absence
  clean, not a blank card) and **`run-tests`**.
- Existing coverage: `tests/integration/datavault.api-tokens.test.ts` — it must still
  pass, or be updated to reflect the flag. Do not delete its coverage.
- Filed follow-up: **DV-B1** (build the external API).

### Acceptance criteria

1. With the flag off (the default), the token-management UI is not reachable — no tab,
   button, or route to it — and no blank/broken region is left behind.
2. With the flag on, the UI works exactly as today.
3. The chosen server behaviour with the flag off is implemented and asserted (either
   routes gated with the documented status code, or routes intact and only the UI
   hidden — whichever you chose, test it).
4. `validateTokenAndScope` carries a comment naming DV-B1 as the reason it is
   uncalled.
5. `tests/integration/datavault.api-tokens.test.ts` passes (updated for the flag if
   needed, with equivalent coverage).
6. A client test asserts 1 and 2.
7. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.
8. **Live proof:** screenshot of the DataVault database settings with the flag off,
   showing no token surface and no layout gap. Use the **`verify`** skill.

---

## DV-12 — `QueryService` has no tenant scoping and a mass-assignment update 🔲

**Priority: P1** · Size: S · File: `server/services/QueryService.ts`

### Finding

Every method in `QueryService` operates on an id with no tenant check, and the
`tenantId` it is handed is explicitly discarded:

```ts
async createQuery(data: Omit<WorkflowQuery, 'id'>, _tenantId: string) {
    const validated = workflowQuerySchema.omit({ id: true }).parse(data);
    const [query] = await db.insert(workflowQueries).values(validated).returning();
    return query;
}
async getQuery(id: string) { /* findFirst by id only */ }
async listQueriesForWorkflow(workflowId: string) { /* by workflowId only */ }
async deleteQuery(id: string) { await db.delete(workflowQueries).where(eq(workflowQueries.id, id)); }
```

and `updateQuery` spreads caller input straight into the update:

```ts
async updateQuery(id: string, updates: Partial<WorkflowQuery>) {
    const [updated] = await db.update(workflowQueries)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workflowQueries.id, id))
        .returning();
```

`Partial<WorkflowQuery>` includes `workflowId`, `dataSourceId` and `tableId`, so a
caller could repoint a query at another tenant's table — precisely the mass-assignment
pattern `docs/architecture/SECURITY_THREAT_MODEL.md` exists to prevent, and a direct
violation of CLAUDE.md convention #7 (service-layer `tenant_id` scoping).

**Currently unreachable** — grepping `server/` for `queryService` finds no route or
service caller; the live query path goes through `QueryBlockRunner` →
`workflowQueriesRepository` → `QueryRunner`. So this is a loaded gun, not an active
breach: P1, not P0. It is cheap to fix now and expensive to discover later, and DV-2
removes the *other* half of the same hole.

### Preferred fix

Scope every method by tenant, mirroring how the `Datavault*` services do it — resolve
the owning tenant and compare, throwing the exact error strings
`classifyRouteError` maps (`"not found"` → 404, `"Access denied"` → 403). Since
`workflow_queries` has no `tenant_id` column, derive it through
`workflowId → project → tenantId`, exactly as `QueryBlockRunner.getTenantIdFromWorkflow`
already does — extract or reuse that rather than writing a third copy.

Replace `updateQuery`'s spread with an explicit allow-list of mutable fields (`name`,
`filters`, `sort`, `limit`) — mirror the discriminated-union / explicit-field approach
the threat-model doc prescribes. `workflowId`, `dataSourceId` and `tableId` must not be
updatable.

Use `workflowQueriesRepository` instead of reaching for `db` directly, so this service
follows the repo's 3-tier pattern like its neighbours.

If, having read it, you conclude `QueryService` is simply dead code that should be
deleted rather than hardened — **stop and raise that** with the evidence. It is a
plausible reading (zero callers), but deleting a service is the repo owner's call, and
`QueryService.getListOptions` may become the natural home for DV-3's server-side
resolver.

### Ties

- **Related to DV-2**, which fixes the tenant hole in `QueryRunner` — the same query
  path, a different file. DV-2 should land first so `executeQuery`'s signature is
  settled.
- Independent file → dispatch in parallel with DV-10 and DV-11.
- Load **`add-api-endpoint`** (the error-string contract and tenancy checks are the
  whole ticket) and **`run-tests`**. Read
  `docs/architecture/SECURITY_THREAT_MODEL.md`.
- File footprint: `server/services/QueryService.ts` only, plus a new test file.

### Acceptance criteria

1. `getQuery`, `listQueriesForWorkflow`, `updateQuery` and `deleteQuery` all take and
   enforce a tenant, and no method retains an unused `_tenantId`-style parameter.
2. A query id belonging to another tenant is **not** returned by `getQuery` and
   **cannot** be updated or deleted — the attempt throws an error that
   `classifyRouteError` maps to 403 or 404 (state which).
3. `createQuery` rejects a `workflowId` outside the caller's tenant.
4. `updateQuery` **cannot** change `workflowId`, `dataSourceId`, or `tableId`;
   supplying them is ignored or rejected (state which) and asserted.
5. `updateQuery` still updates `name`, `filters`, `sort`, and `limit`.
6. The service goes through `workflowQueriesRepository`, not `db` directly.
7. A new test file (e.g. `tests/unit/services/QueryService.test.ts`) asserts 1–6.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## DV-13 — DataVault mutations leave no audit trail 🔲

**Priority: P2** · Size: M · File: `server/routes/datavault/*`, `server/services/Datavault*.ts`

### Finding

No DataVault route or service writes an audit log entry. Grepping
`server/routes/datavault/` and `server/services/Datavault*.ts` for
`auditLog|auditService|createAuditLog` returns nothing, while `auth.routes.ts`,
`portability.routes.ts` and `secrets.routes.ts` all do audit their mutations — so the
mechanism exists and this is a gap, not an absent capability.

Unaudited today: row create/update/delete, bulk archive/unarchive/delete, column
add/change/delete (each of which can destroy values —
`deleteValuesByColumnId` hard-deletes every value in a column), table
create/rename/delete/move, ownership transfer, permission grant/revoke, and API-token
create/delete. Row-level `created_by`/`updated_by` stamps are the only trace, and they
are overwritten by the next edit; deletes leave nothing at all.

For a system positioned as the customer's system of record, "who deleted these 400
rows, and when" is currently unanswerable. This is the one finding in this initiative
that is a *missing control* rather than a defect, hence P2 — but it is squarely part of
"enterprise ready".

### Preferred fix

Add audit logging at the **service** layer, not the routes, so block-runner and
writeback callers are covered too — and so it cannot be bypassed by a future route.
Copy the existing pattern: read `secrets.routes.ts` / its service for how an entry is
shaped and which fields are recorded, and reuse that helper rather than inventing an
event format.

Cover, at minimum: row create/update/delete, all four bulk row operations, column
create/update/delete, table create/update/delete/move, ownership transfer, and
permission grant/revoke.

Record the actor, tenant, table (and row/column where applicable), the action, and a
**bounded** summary of what changed. Do **not** log full row values — that is customer
PII and unbounded in size (see DV-7's logging defect for the same mistake). Log
column ids and a count, not contents.

Bulk operations get **one** entry with a count and the affected ids (capped — if the
id list exceeds the cap, record the count and omit the list), not N entries.

Audit writes must not fail the mutation: if the audit insert throws, log and continue,
matching how the existing audited routes behave. Confirm that behaviour in the donor
before copying it.

### Ties

- **Must run after DV-8**, which restructures `rows.routes.ts` and the row query path.
  Last ticket of the initiative.
- Load **`add-api-endpoint`** and **`run-tests`**. Check whether `audit_logs` needs an
  index for the new query patterns; if it does, that is a schema change → load
  **`db-schema-change`** and say so.
- Note: `audit_logs` has a history of a `workspaceId=''` bug — check the donor
  carefully for how tenant/workspace fields are populated.
- Existing coverage: `tests/integration/datavault.routes.test.ts`,
  `tests/integration/datavault.permissions.test.ts`.

### Acceptance criteria

1. Row create, update, and delete each write exactly one audit entry naming the actor,
   tenant, table id, row id, and action.
2. Each bulk operation (archive, unarchive, delete) writes **one** entry with the
   affected count — not one per row.
3. Column create/update/delete and table create/update/delete/move are audited.
4. Ownership transfer and permission grant/revoke are audited.
5. A write performed by the **Send-Data-To-Table block** (not an HTTP route) is also
   audited, proving the instrumentation is at the service layer.
6. No audit payload contains a full row's values; a payload's serialized size is
   bounded (assert against a row with a large text value).
7. A failing audit insert does **not** fail the underlying mutation — asserted by
   forcing the audit call to throw.
8. New tests in `tests/integration/datavault.routes.test.ts` assert 1–3 and 6–7, and
   `tests/integration/datavault.permissions.test.ts` asserts 4.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥2313
   passing.

---

## Phase 4 Gate

- [ ] DV-10, DV-11, DV-12, DV-13 ✅ with dated verification notes
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥2313 passing (adjusted for tests deliberately removed in
      DV-10 — the number and reason recorded at that ticket)
- [ ] `npm run test:unit:db` and `npm run test:integration` → no new failures
- [ ] `npm run db:migrate` applies cleanly on a fresh database (DV-10's drop)
- [ ] Reviewer has committed each passed ticket + this gate
- [ ] Initiative retired per ticket-flow Stage 7: remaining entries triaged into
      `tickets/backlog/DATAVAULT.md` + `tickets/BACKLOG.md`, this file `git rm`'d

---

# Backlog / observations (not phase-gated, not sized)

Parked deliberately. Each needs re-verification before promotion — these were written
against the tree at audit time.

- **DV-B1 — build the external DataVault API** · `needs-initiative`. The token
  lifecycle already exists (`DatavaultApiTokensService`, hashed storage, scopes,
  expiry) and is inert; DV-11 hides it. A real external API means a token-auth
  middleware enforcing `scopes`, plus read/write row endpoints under it, plus rate
  limiting and a new public attack surface. Own initiative, own threat review. Blocked
  on product demand, not on code.
- **DV-B2 — per-column unique constraint at the database level** · `enhancement`.
  DV-4 enforces uniqueness in the service, which is correct and sufficient for the
  app's own paths but is TOCTOU-racy under true concurrency. A DB guarantee on an EAV
  table needs either a partial unique index per unique column (created/dropped as the
  flag toggles — DDL at runtime, which is a real decision) or an expression index over
  `(column_id, value)` filtered on a uniqueness marker. Needs `db-schema-change` and a
  design call. Promote if duplicate keys are observed in practice after DV-4.
- **DV-B3 — `collections` / `collection_fields` / `records` look like a parallel
  unused data model** · `informational`. A second, jsonb-blob-shaped data store lives
  in `shared/schema/datavault.ts` (commented "Legacy / Stage 19 Collections
  (Alternative to DataVaultTables?)") with its own `CollectionBlockRunner`. The
  `data`-column confusion behind DV-1 and DV-3 strongly suggests code was written
  against *this* model and pointed at DataVault. **Not investigated in this audit** —
  recorded so the next reader knows the question is open, not answered. Worth a
  scoped "is Collections live, and if not, delete it" pass; do not assume it is dead.
- **DV-B5 — the choice-options fetch bypasses `apiRequest`'s 401 refresh** ·
  `enhancement`. DV-3 deliberately used raw `fetch` with `getAuthHeaders()` so
  run-token precedence stayed scoped to that one request (the alternative was a
  global change to `apiRequest` — see DV-3's review pass 1). The cost is no
  automatic token refresh: an expired JWT makes a DataVault-backed dropdown render
  its error state rather than retrying. Fix shape: let `apiRequest` accept
  per-request headers, then move this call back onto it. Small and contained;
  promote if authors report dropdowns emptying on long builder sessions.
- **DV-B4 — `getRowsWithValues` fetches every value for every row** ·
  `enhancement`. Column selection is applied *after* the query
  (`outputColumns.filter`), so a 60-column table costs 60 values per row over the wire
  even when the grid shows 5. Fine at current scale; the fix (push the column filter
  into the `datavault_values` query) is small and localized. Promote when a customer
  table gets wide.
