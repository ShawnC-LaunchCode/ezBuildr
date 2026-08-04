# DataVault — Filter & Read Performance (DVP-1..3)

Source: split out of `tickets/DATAVAULT_HARDENING_TICKETS.md` on 2026-08-03. DVP-1 was
that file's DVH-4. It was pulled out of the hardening round for three reasons, all of
which shape how it should be worked:

1. It is **P2 and speculative by its own admission** — a ceiling, not a defect. The
   hardening round was fixing things that are wrong today.
2. Its originally-proposed index carried the **same btree size-limit defect** that made
   DVH-2's fix unbuildable (see DVP-1's *The trap* below). Shipping it as written would
   have broken inserts on the hottest table in DataVault.
3. **The repo owner wants to measure before committing to an index.** That is the
   deliverable here, not a migration.

**This is a measurement-first initiative.** A ticket in this file may legitimately
close with *no migration and no index*, if the plans say so. "We looked, and here is
why we did nothing" is a passing outcome; guessing at an index is not.

Findings were verified against `595c10b0`/`1a32e241`. **Line numbers are advisory** —
the locator is the quoted code and the named symbol; grep for those.

**Baseline at file creation:** `test:fast` **2381**, `test:unit:db` 136,
`test:integration` **96 files / 1031 passed**, 0 failures. `tsc` 0 errors, lint clean.

---

## How to work this document

- Each ticket has: **Finding**, **Preferred fix**, **Ties**, **Acceptance criteria**
  (all must pass).
- Load the project skills named in each ticket's Ties **before** touching code —
  `db-schema-change`, `run-tests`.
- **`npm test` naively gives wrong results here** — three Vitest projects with
  different commands and DB requirements. Use the `run-tests` skill.
- **Sweep the eight DataVault integration suites, not just the ones your ticket
  names.** A previous initiative committed a red test twice by scoping the sweep to a
  ticket's stated files: `datavault.routes`, `datavault.autonumber`,
  `datavault-v4-regression`, `datavault.permissions`, `dataBlocks`,
  `datavault.row-notes`, `datavault.api-tokens`, `dynamic_options_workflow`.
- **Numbers, not intuition.** Every claim about performance in your report must be a
  pasted `EXPLAIN ANALYZE` plan or a timing you measured. "This should be faster" fails
  the ticket.
- Devs do not commit; the reviewer commits per passed ticket.
- Status legend: 🔲 Open · 🔄 In progress · ✅ Done (verified at review)

### Sequencing

| Ticket | Migration? | Dispatchable |
|---|---|---|
| DVP-1 — harness + measurement | **no** | **now**, in parallel with anything |
| DVP-2 — index decision | maybe | after **DVP-1** and after **DVH-2** lands |
| DVP-3 — narrow the value fetch | no | after **DVP-1** (reuses its harness) |

**DVP-1 is deliberately measurement-only and carries no migration**, so it can run
alongside the DVH round. It touches `tests/helpers/` and produces a report — no overlap
with `server/services/DatavaultRowsService.ts` (DVH-1, DVH-2) or `migrations/` (DVH-3).

**DVP-2 must wait for DVH-2**, which adds key-table writes to `datavault_values`'s hot
path. That changes the *write-cost* side of the index trade-off, and an index justified
against a pre-DVH-2 write path may not survive. DVP-1's *read* plans are unaffected by
DVH-2 and stay valid, which is exactly why the split works.

Whichever ticket ends up adding a migration takes the next free index in the chain —
DVH-3 is claiming `0011` and DVH-2 `0012`, so **check the chain, do not assume**.

---

## DVP-1 — Measure filter performance on `datavault_values`: harness + `EXPLAIN` plans ✅

**Priority: P2** · Size: M · Files: `tests/helpers/` + a written report (`docs/perf/DVP-1_REPORT.md`). **No migration.**

> **✅ Verified at review 2026-08-04.** Reviewer fast-forwarded the `dvp-1` worktree onto
> `main` first — its base predated all three DVH commits, so it had been measuring a
> `_v15` schema without migrations `0011`/`0012` — then re-ran every gate on the merged
> tree: `tsc --noEmit` exit 0, `npm run lint` clean, `test:fast` **2388 passed** / 14
> skipped, and the 10-suite DataVault sweep plus this ticket's harness **11 files / 194
> tests passed**. AC7 confirmed by `git status`: nothing under `migrations/`.
>
> **AC3 was not met as delivered, and the reviewer closed it.** The ticket required the
> measured queries be the ones the repository actually issues — "find it and log it rather
> than guessing at the SQL". The test instead `EXPLAIN`s five hand-written statements
> alongside a real `findByTableId` call. Rather than send it back, the reviewer captured
> the true SQL by attaching a Drizzle `logger` to a dedicated `pg.Client` and comparing:
> all five are structurally identical to the hand-written versions — same `EXISTS` shape,
> same predicates, same access paths — differing only in **bound parameters vs inline
> literals** and a dropped `OFFSET 0`. So the conclusions stand. The real SQL is now in the
> report, along with the caveat this exposed: the measured plans are *custom* plans over
> literals, and Postgres may switch the parameterised form to a *generic* plan, which
> cannot use per-value selectivity — precisely what Candidate A's win depends on. The
> capture also surfaced a second query the report had omitted entirely: every filtered call
> first issues `select id, type, slug, autonumber_prefix from datavault_columns where
> table_id = $1`, which is not in any of the quoted timings.
>
> **Reviewer fixes applied (all small, none changing the ticket's conclusions):**
> 1. **Seeder seeded `""` for half its empty cells** — the exact storage shape DVH-1
>    eliminated four commits earlier, and DVP-2/DVP-3 are told to reuse this helper. Empty
>    cells now omit the value row. The `is_empty` *result* is unchanged (8,334 rows either
>    way, since `nonEmptyValue` already treated `""` as empty) but the *plan* is not: it no
>    longer discards 4,167 phantom rows and the planner switches to a `Hash Right Anti
>    Join`. All five plans were re-captured after the fix and the report's numbers replaced
>    (13.2–20.7 ms, 116,666 values, 14.44 s seed) — the originals measured data the
>    application can no longer produce.
> 2. **`left(value #>> '{}', 200) = $value` is a prefix match, not equality.** The
>    recommendation told DVP-2 to *replace* the exact predicate with it, which would return
>    false positives for values sharing a 200-char prefix. Corrected to emit it beside the
>    exact predicate as an index-assisting narrowing term.
> 3. **Neon `pg_trgm` citation** — the claim is true and the reviewer re-fetched it, but
>    the cited host now 308-redirects (`neon.tech` → `neon.com`) and the page publishes no
>    per-version matrix, so "supported across all PostgreSQL versions" was softened to what
>    the doc actually says, with a note for DVP-2 to confirm against the running version.
> 4. The ">90% reduction" GIN figure was a projection stated as a measurement; relabelled,
>    with the note that this benchmark's `contains` needle matches an unusually unselective
>    12.5% of rows.
>
> **Process note:** the dev marked this ticket ✅ themselves. Devs do not close tickets —
> the reviewer does, at review. No harm here since review followed immediately, but the ✅
> was unearned at the time it was written.

*Was DVH-4, then the first half of the original DVP-1. Re-sized S → M: the acceptance
criteria require a 100k-value seeding harness that does not exist yet, which is most of
the work. Split from DVP-2 on 2026-08-03 so this half is dispatchable during the DVH
round.*

### Finding

`datavault_values` has exactly two indexes, plus the cell-uniqueness one:

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

Correct, and fine at current scale. It is filed because DV-8 made filtering a primary,
user-facing path, so the first wide customer table will find it.

### The trap — read this before proposing any index

**A btree index entry cannot exceed 2704 bytes.** `datavault_values.value` is `jsonb`
capped at **1MB** (`MAX_VALUE_BYTES` in `server/utils/valueSizeLimit.ts`). So the naive
`CREATE INDEX ON datavault_values (column_id, value)` — which the original ticket
proposed — would make **every insert of a value over ~2.7KB fail** with
`index row size ... exceeds btree version 4 maximum`, on all columns, not just filtered
ones. This is exactly what killed DVH-2's first design.

Any index you propose on `value` must therefore be bounded in size. Options, all of
which change what the planner can use:

- an expression index on a **truncated** text extraction, e.g.
  `(column_id, left(value #>> '{}', 200))` — bounded, but only helps predicates the
  planner can rewrite to match the expression;
- a **partial** index with a size predicate, e.g.
  `... WHERE pg_column_size(value) < 2000` — keeps large values out of the index
  entirely, so queries touching them fall back to a scan;
- a `pg_trgm` GIN index for `contains` — GIN has no such size limit, but it is an
  **extension**; confirm Neon supports it before proposing it, and do not add an
  extension speculatively.

### Preferred fix

**This ticket measures and reports. It adds no index and no migration** — deciding what
to index is DVP-2, deliberately separated so this half can run alongside the DVH round.
If you conclude an index is obviously needed, that conclusion *is* your deliverable;
write it into the report and stop.

1. Build a seeding helper that creates a DataVault table with ≥100k values across a
   realistic column mix (short text, long text, number, date). Put it where the other
   integration helpers live (`tests/helpers/`) so DVP-2 and DVP-3 reuse it — a
   throwaway script in your worktree is not an acceptable deliverable. Keep it fast
   enough to be usable: bulk-insert, do not loop single inserts.
2. Capture `EXPLAIN (ANALYZE, BUFFERS)` for a representative query per filter family:
   equality, `contains`, numeric range, date range, `is_empty`. Use the real query
   `DatavaultRowsRepository` issues, not a hand-written approximation of it — find it
   and log it rather than guessing at the SQL.
3. Write the report: for each filter family, the plan, the row counts, the timing, and
   which access path dominates.
4. Assess each of the three bounded index candidates in the trap above **on paper
   against your plans** — which would help which filter family, and which would not.
   Do not build them.

### Ties

- Load **`run-tests`**. You do **not** need `db-schema-change` — this ticket writes no
  migration. If you think you need one, that is a blocker to report.
- **Dispatchable immediately.** Footprint is `tests/helpers/` plus a report; no overlap
  with `server/services/DatavaultRowsService.ts` (DVH-1, DVH-2) or `migrations/`
  (DVH-3). Your worktree gets its own test database, so seeding 100k values disturbs
  nobody.
- Related: **DVP-2** (consumes your plans), **DVP-3** (reuses your harness).
- Read `migrations/APPLY_INDEXES.md` and `migrations/INDEX_MIGRATION_SUMMARY.md` —
  this repo has prior index work with conventions worth matching.

### Acceptance criteria

1. A reusable seeding helper exists in `tests/helpers/`, produces a DataVault table with
   ≥100k values across at least four column types, and is used by this ticket's own
   measurements. State how long it takes to run.
2. `EXPLAIN (ANALYZE, BUFFERS)` plans captured for equality, `contains`, numeric range,
   date range, and `is_empty` — pasted in the report.
3. The measured queries are the ones the repository actually issues; your report names
   the method they came from and shows the logged SQL.
4. For each filter family: which access path dominates, the row count scanned, and the
   timing. Numbers, not adjectives.
5. Each of the three bounded index candidates (truncated expression index, size-partial
   index, `pg_trgm` GIN) assessed against those plans, with a would-help / would-not
   verdict and reasoning. Confirm in writing whether Neon supports `pg_trgm` — cite
   where you checked.
6. A recommendation for DVP-2 to act on, including "no index is warranted, revisit at
   scale N" if that is what the plans say. That is a passing outcome.
7. **No migration and no index is added by this ticket.** `git status` shows nothing
   under `migrations/`.
8. Filter correctness unchanged — the 8-suite DataVault sweep green.
9. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥ 2381.

---

## DVP-2 — Act on DVP-1's plans: add bounded index support for filtered queries, or record why not 🔲

**Priority: P2** · Size: S · File: possibly a migration

*Split out of the original DVP-1 on 2026-08-03 so the measurement half could be
dispatched during the DVH round. This half cannot: it must be judged against a write
path that DVH-2 changes.*

### Finding

See DVP-1. This ticket exists to act on its report, and **must not be started until
DVP-1's report exists** — its whole input is that report.

### Preferred fix

Implement whatever DVP-1's report justifies, subject to two hard constraints:

- **Every index must be bounded in size.** Re-read DVP-1's *The trap*: a btree entry
  caps at 2704 bytes while a cell caps at 1MB, so a plain index on `value` breaks
  inserts. This is not negotiable and is not something to rediscover.
- **Re-measure the write side against post-DVH-2 `main`.** DVH-2 adds
  `datavault_unique_keys` writes to the same insert path. An index justified purely on
  read gains, measured before that landed, may not be worth it after.

Adding nothing is a valid outcome if the re-measured trade-off says so.

### Ties

- **After DVP-1** (needs its report) **and after DVH-2** (needs its write path).
- Load **`db-schema-change`** (mandatory) and **`run-tests`**.
- Reuse DVP-1's seeding harness. Do not write a second one.
- Take the next free migration index — DVH-3 has `0011`, DVH-2 has `0012`; check the
  chain rather than assuming.

### Acceptance criteria

1. Every index added is justified by a named plan from DVP-1's report plus a fresh
   after-plan showing it in use; the improvement is stated in numbers.
2. Write-path cost re-measured on post-DVH-2 `main` — insert throughput before and
   after the index, with numbers.
3. **No index entry can exceed the btree limit** — proven by inserting a value near
   `MAX_VALUE_BYTES` into an indexed column and showing the insert succeeds.
4. Every considered-and-rejected index named with its reason.
5. If nothing is added: the report says so explicitly, with the numbers that decided it
   and the scale at which to revisit. This passes.
6. Filter correctness unchanged — the 8-suite DataVault sweep green, especially DV-8's
   filter tests.
7. If a migration is added, `npm run db:migrate` applies cleanly on a fresh database.
8. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥ 2381.

---

## DVP-3 — `getRowsWithValues` fetches every value for every row regardless of selected columns ✅

**Priority: P2** · Size: S · File: `server/repositories/DatavaultRowsRepository.ts`

> **✅ Verified at review 2026-08-04.** Reviewer re-ran every gate in the `dvp-3`
> worktree: `tsc --noEmit` exit 0, `npm run lint` clean, `test:fast` **2391 passed** /
> 14 skipped (baseline 2388, +3), and the full DataVault sweep — the eight this round
> names, plus `rls-datavault`, `datavault.uniqueKeys`, DVP-1's harness and this ticket's
> — **12 files / 195 tests passed**.
>
> Checked the two things that could have broken silently, since both *reduce* what is
> fetched. `options.routes.ts` requests **both** the value column and the label column
> when they differ (`labelId === columnId ? [columnId] : [columnId, labelId]`) rather
> than narrowing to one — the subtle case, and it is right. `ReadTableBlockRunner`
> narrows only when `tableConfig.columns` is explicitly set and passes `undefined`
> otherwise, so the default stays a full fetch. `dataBlocks` and
> `dynamic_options_workflow` — the two suites that exercise those paths — are green.
>
> The repository guard is correct: `if (columnIds && columnIds.length > 0)`, so an empty
> array falls through to the unnarrowed query instead of generating `IN ()`. The route
> refactor that moved filter parsing into `parseRowFilters` preserves the old contract —
> malformed JSON still returns 400, and a new outer `z.ZodError` branch maps schema
> failures (filters *and* `columnIds`) to 400 with the `errors` array, as before.
>
> **Noted, not fixed:** (1) `parseColumnIds` has no length cap, unlike filters which use
> `DATAVAULT_CONFIG.MAX_FILTERS` — a caller can pass an unbounded UUID list into an `IN`
> clause. Low severity, but it is the same class of limit the filter path already
> enforces; filed as an observation. (2) The new repository unit test asserts
> `expect(mockDb.where).toHaveBeenCalled()`, which cannot fail — `where` is called on
> every path. The narrowing is genuinely proven by the integration benchmark (96% fewer
> value rows transferred), so coverage exists; the unit test just is not what is proving
> it.

*Promoted from `DV-B4` (parked during the DataVault audit) because it shares DVP-1's
trigger and its measurement harness. Not independently urgent.*

### Finding

`getRowsWithValues` loads all `datavault_values` rows for the page of rows it returns,
irrespective of which columns the caller actually asked for. On a wide table (many
columns, or a few very large `json`/long-text columns) the grid pays to transfer and
deserialise cells it will never render.

Same "wide table" trigger as DVP-1, different layer — which is why they share a file:
a fix to one changes the measured value of the other.

### Preferred fix

Establish the cost with DVP-1's harness first, then push column selection down into the
query if the numbers justify it. Confirm before building: check whether any caller
depends on receiving all values even when it requests a subset (grid, export, dynamic
options, data blocks, the DataVault API-token routes) — a narrower fetch that breaks
export is a regression, not an optimisation.

### Ties

- **After DVP-1** — reuse its seeding helper rather than writing a second one.
- Load **`add-api-endpoint`** and **`run-tests`**.
- Callers to audit before narrowing anything: the grid read path, CSV/export,
  `dynamic_options_workflow`, `dataBlocks`, and `datavault.api-tokens`.

### Acceptance criteria

1. Measured before/after payload size and query time on a wide table (≥50 columns)
   using DVP-1's harness — numbers in the report.
2. Every caller of `getRowsWithValues` is enumerated in the report with whether it
   needs all values or a subset.
3. If narrowed: all enumerated callers still get what they need, proven by the 8-suite
   sweep plus a test asserting a subset request returns only the requested columns.
4. If not narrowed: the report says why, with the numbers that made it not worth it.
5. `npx tsc --noEmit` 0 errors; `npm run lint` clean; `npm run test:fast` ≥ 2381;
   8-suite DataVault sweep green.

---

## Gate

- [ ] DVP-1..3 all ✅ with dated verification notes, **or** closed with a written
      "measured, no change warranted" outcome
- [ ] The seeding harness from DVP-1 is committed and reusable
- [ ] `npx tsc --noEmit` → 0 errors · `npm run lint` → clean
- [ ] `npm run test:fast` ≥ 2381 · 8-suite DataVault integration sweep green
- [ ] Any migration applies cleanly on a fresh database
- [ ] Reviewer has committed each passed ticket + this gate
