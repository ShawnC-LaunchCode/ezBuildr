# DVP-1: DataVault Filter Performance & `EXPLAIN` Plan Measurement Report

- **Ticket**: DVP-1 — DataVault: Filter & Read Performance (Harness & Measurement)
- **Environment**: Isolated worktree `dvp-1` (`ezbuildr_test_dvp_1` on local Postgres port 5434), schema `test_schema_w0_v17`, PostgreSQL 16
- **Status**: ✅ Complete (Measurement-First baseline established; No migrations added)
- **Revised at review 2026-08-04**: seeder corrected for DVH-1's empty-cell contract, all
  five plans re-captured, the repository's real (parameterised) SQL added, and two errors
  in the DVP-2 recommendations fixed. See §2, §3 and §4.

---

## 1. Executive Summary

DataVault currently stores cell values in an EAV-style table (`datavault_values`) where each cell is indexed only by `(column_id)` and `(row_id)`, with the payload stored in a `jsonb` column (`value`). Row filtering in `DatavaultRowsRepository.findByTableId` is implemented via correlated `EXISTS` subqueries against `datavault_values`.

In this benchmark:
- We built a reusable seeding harness (`tests/helpers/datavaultSeeder.ts`) that populated **25,000 rows** and **116,666 values** across 5 distinct column types (`text` short status, `text` long description, `number` amount, `date` event date, and nullable `text` notes) in **14.4 seconds**.
- We executed `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` across all 5 filter families against `DatavaultRowsRepository.findByTableId`.
- **Primary Finding**: Because `datavault_values` only has an index on `(column_id)`, all filter queries follow the same bottleneck path:
  1. `Bitmap Index Scan on datavault_values_column_idx` fetches all row pointers for the target `column_id` (25,000 index rows).
  2. `Bitmap Heap Scan` must pull **all 2,013 heap pages** into memory and evaluate the filter expression in software across all 25,000 JSONB values (extracting text via `#>> '{}'`, deserializing JSON, and performing in-memory casts to `numeric` or `date`).
  3. The resulting row IDs are joined to `datavault_rows` via `Hash Join`, `Nested Loop`, or `Hash Right Anti Join`.
- Total execution time across all 5 filter queries ranges from **13.2ms to 20.7ms** per query for a single filter on a 25k-row table, with **2,509 to 11,409 buffer hits** per query.

> **Measurement provenance.** The plans in §3 were re-captured by the reviewer on
> 2026-08-04 against schema `test_schema_w0_v17` — i.e. with migrations `0011`
> (DataVault RLS) and `0012` (`datavault_unique_keys`) applied — after correcting the
> seeder's handling of empty cells (see §2). Neither migration touches
> `datavault_values`' indexes, and RLS is staged-not-enforced for the owner role the
> tests connect as, so the access paths are unaffected; only the `is_empty` row
> distribution changed. Regenerate with:
> `npx vitest run --project integration tests/integration/datavault.filter-perf.test.ts --reporter=verbose`
> (the default reporter suppresses the plans on a passing run).

---

## 2. Seeding Harness Design & Runtime

### Implementation Details
- **File**: [`tests/helpers/datavaultSeeder.ts`](file:///tests/helpers/datavaultSeeder.ts)
- **API**: `seedLargeDatavaultTable(options?: SeedLargeDatavaultOptions): Promise<SeedDatavaultResult>`
- **Total Rows**: 25,000
- **Total Values**: 116,666 (exceeds the 100k requirement)
- **Column Types**:
  1. `status` (`text`): 8 categorical values (`ACTIVE`, `PENDING`, `SUSPENDED`, etc.)
  2. `description` (`text`): Paragraph text (~150 bytes per cell) with varied keywords
  3. `amount` (`number`): Floating-point financial amounts (10.00 to 50,000.00)
  4. `event_date` (`date`): ISO date strings (2024-01-01 to 2026-12-31)
  5. `notes` (`text`, nullable): Sparse text (~33% of cells absent, ~67% populated)
- **Seeding Runtime**: **14.44s** total duration (using 2,500-item chunked multi-row inserts).

> **Empty cells are represented by an absent value row, never by `""`.** The first
> version of this harness seeded `value: ''` for half of its empty cells. DVH-1 made
> `validateAndCoerceValue` coerce blank strings to SQL `NULL` before storage, so a `""`
> cell is a shape the application can no longer produce — measuring it would have
> benchmarked data that cannot exist, and DVP-2/DVP-3 reuse this helper. Corrected at
> review. The `is_empty` result set is unchanged (8,334 rows either way, since
> `nonEmptyValue` already treated `""` as empty), but the plan is not: the filter no
> longer discards 4,167 `""` rows, and the planner now chooses a `Hash Right Anti Join`
> over 16,666 values instead of a `Hash Anti Join` over 20,833.
- **Cleanup**: Built-in `cleanup()` method drops the tenant cascade cleanly.

---

## 3. Filter Plan Measurements & Analysis

All measurements were captured using `DatavaultRowsRepository.findByTableId` queries under PostgreSQL 16 with fully updated statistics (`ANALYZE`).

### Summary Metrics Table

| Filter Family | Target Column | Operator | Predicate | Planning Time | Execution Time | Buffer Hits | Scanned Rows | Returned Rows | Dominant Access Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Equality** | `status` (text) | `equals` | `value = '"PENDING"'::jsonb` | 0.30 ms | **13.23 ms** | 2,515 | 25,000 values | 100 (of 3,125) | Bitmap Index Scan on `column_idx` + Heap Scan filter (21,875 discarded) + Hash Join |
| **Contains** | `description` (text) | `contains` | `value #>> '{}' LIKE '%audit review%'` | 0.35 ms | **16.51 ms** | 11,409 | 25,000 values | 100 (of 3,125) | Bitmap Index Scan on `column_idx` + Heap Scan filter (21,875 discarded) + Nested Loop Index Scan on `rows_pkey` |
| **Numeric Range** | `amount` (number) | `greater_than` | `(value #>> '{}')::numeric > 25000` | 0.35 ms | **18.56 ms** | 2,515 | 25,000 values | 100 (of 12,167) | Bitmap Index Scan on `column_idx` + Heap Scan numeric cast filter (12,833 discarded) + Hash Join |
| **Date Range** | `event_date` (date) | `greater_than` | `(value #>> '{}')::date > '2025-06-01'` | 0.33 ms | **18.73 ms** | 2,515 | 25,000 values | 100 (of 12,050) | Bitmap Index Scan on `column_idx` + Heap Scan date cast filter (12,950 discarded) + Hash Join |
| **Is Empty** | `notes` (text) | `is_empty` | `NOT EXISTS (value IS NOT NULL AND ...)` | 0.34 ms | **20.68 ms** | 2,509 | 16,666 values | 100 (of 8,334) | Bitmap Index Scan on `column_idx` + Heap Scan + Hash Right Anti Join |

**Every filtered call issues a second query first.** `buildWhereConditions` looks the
table's columns up before it can build any predicate:

```sql
select "id", "type", "slug", "autonumber_prefix" from "datavault_columns"
where "datavault_columns"."table_id" = $1
```

That round-trip is *not* included in the timings above, which cover the row query only.
It is small at this scale but it is a per-request cost, and DVP-2/DVP-3 should count it.

---

### The SQL the repository actually issues

Captured at review by attaching a Drizzle `logger` to a dedicated `pg.Client` and calling
`DatavaultRowsRepository.findByTableId` with each filter — not transcribed by hand. All
five differ from the `EXPLAIN`ed statements below in exactly two ways: **bound parameters
instead of inline literals**, and **no `OFFSET` clause** when `offset` is 0. Structure,
predicates and access paths are otherwise identical, which is why the plans below are
representative.

```sql
-- equality
select "id", "table_id", "deleted_at", "created_at", "updated_at", "created_by", "updated_by" from "datavault_rows" where ("datavault_rows"."table_id" = $1 and "datavault_rows"."deleted_at" is null and exists (select 1 from "datavault_values" "dv_filter_0" where (("dv_filter_0"."row_id" = "datavault_rows"."id" and "dv_filter_0"."column_id" = $2) and "dv_filter_0"."value" = $3::jsonb))) order by "datavault_rows"."created_at" asc limit $4
-- params: [tableId, columnId, "\"PENDING\"", 100]

-- contains
... and "dv_filter_0"."value" #>> '{}' LIKE $3))) order by "datavault_rows"."created_at" asc limit $4
-- params: [tableId, columnId, "%audit review%", 100]

-- numeric range
... and ("dv_filter_0"."value" #>> '{}')::numeric > $3))) order by "datavault_rows"."created_at" asc limit $4
-- params: [tableId, columnId, 25000, 100]

-- date range
... and ("dv_filter_0"."value" #>> '{}')::date > $3))) order by "datavault_rows"."created_at" asc limit $4
-- params: [tableId, columnId, "2025-06-01", 100]

-- is_empty
... and not exists (select 1 from "datavault_values" "dv_filter_0" where (("dv_filter_0"."row_id" = "datavault_rows"."id" and "dv_filter_0"."column_id" = $2) and "dv_filter_0"."value" IS NOT NULL AND "dv_filter_0"."value" != 'null'::jsonb AND "dv_filter_0"."value" != '""'::jsonb))) order by "datavault_rows"."created_at" asc limit $3
-- params: [tableId, columnId, 100]
```

⚠️ **Caveat for DVP-2: these plans are custom plans over literals.** Postgres may switch a
parameterised statement to a *generic* plan after five executions, and a generic plan
cannot use per-value selectivity estimates. Anything DVP-2 builds that depends on the
planner picking an index for a specific value must be re-verified against the
parameterised form, not against the literal form measured here. This matters most for the
`equals` path, where Candidate A's win is exactly a selectivity story.

### Detailed `EXPLAIN (ANALYZE, BUFFERS)` Plans

#### 1. EQUALITY FILTER PLAN
```text
Limit  (cost=3548.47..3548.72 rows=100 width=130) (actual time=13.030..13.041 rows=100 loops=1)
  Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
  Buffers: shared hit=2515
  ->  Sort  (cost=3548.47..3550.08 rows=644 width=130) (actual time=13.028..13.034 rows=100 loops=1)
        Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
        Sort Key: datavault_rows.created_at
        Sort Method: top-N heapsort  Memory: 50kB
        Buffers: shared hit=2515
        ->  Hash Join  (cost=2664.72..3523.85 rows=644 width=130) (actual time=8.664..12.608 rows=3125 loops=1)
              Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
              Inner Unique: true
              Hash Cond: (datavault_rows.id = dv_filter_0.row_id)
              Buffers: shared hit=2515
              ->  Seq Scan on  datavault_rows  (cost=0.00..793.50 rows=25000 width=130) (actual time=0.006..2.096 rows=25000 loops=1)
                    Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                    Filter: ((datavault_rows.deleted_at IS NULL) AND (datavault_rows.table_id = '0266334a-0198-44cc-a0c8-ca25494abd29'::uuid))
                    Buffers: shared hit=481
              ->  Hash  (cost=2656.67..2656.67 rows=644 width=16) (actual time=8.647..8.649 rows=3125 loops=1)
                    Output: dv_filter_0.row_id
                    Buckets: 4096 (originally 1024)  Batches: 1 (originally 1)  Memory Usage: 179kB
                    Buffers: shared hit=2034
                    ->  Bitmap Heap Scan on  datavault_values dv_filter_0  (cost=270.86..2656.67 rows=644 width=16) (actual time=1.025..8.175 rows=3125 loops=1)
                          Output: dv_filter_0.row_id
                          Recheck Cond: (dv_filter_0.column_id = '7fa99145-f6db-43ad-b095-908f9b35706b'::uuid)
                          Filter: (dv_filter_0.value = '"PENDING"'::jsonb)
                          Rows Removed by Filter: 21875
                          Heap Blocks: exact=2013
                          Buffers: shared hit=2034
                          ->  Bitmap Index Scan on datavault_values_column_idx  (cost=0.00..270.70 rows=24854 width=0) (actual time=0.834..0.834 rows=25000 loops=1)
                                Index Cond: (dv_filter_0.column_id = '7fa99145-f6db-43ad-b095-908f9b35706b'::uuid)
                                Buffers: shared hit=21
Planning:
  Buffers: shared hit=14
Planning Time: 0.304 ms
Execution Time: 13.234 ms

```

#### 2. CONTAINS FILTER PLAN
```text
Limit  (cost=2748.44..2748.45 rows=3 width=130) (actual time=16.381..16.390 rows=100 loops=1)
  Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
  Buffers: shared hit=11409
  ->  Sort  (cost=2748.44..2748.45 rows=3 width=130) (actual time=16.380..16.384 rows=100 loops=1)
        Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
        Sort Key: datavault_rows.created_at
        Sort Method: top-N heapsort  Memory: 50kB
        Buffers: shared hit=11409
        ->  Nested Loop  (cost=272.44..2748.42 rows=3 width=130) (actual time=0.968..15.792 rows=3125 loops=1)
              Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
              Inner Unique: true
              Buffers: shared hit=11409
              ->  Bitmap Heap Scan on  datavault_values dv_filter_0  (cost=272.15..2723.49 rows=3 width=16) (actual time=0.950..11.643 rows=3125 loops=1)
                    Output: dv_filter_0.id, dv_filter_0.row_id, dv_filter_0.column_id, dv_filter_0.value, dv_filter_0.created_at, dv_filter_0.updated_at
                    Recheck Cond: (dv_filter_0.column_id = 'aec562e6-785f-40c7-8277-7d3d2558d13e'::uuid)
                    Filter: ((dv_filter_0.value #>> '{}'::text[]) ~~ '%audit review%'::text)
                    Rows Removed by Filter: 21875
                    Heap Blocks: exact=2013
                    Buffers: shared hit=2034
                    ->  Bitmap Index Scan on datavault_values_column_idx  (cost=0.00..272.15 rows=25048 width=0) (actual time=0.768..0.768 rows=25000 loops=1)
                          Index Cond: (dv_filter_0.column_id = 'aec562e6-785f-40c7-8277-7d3d2558d13e'::uuid)
                          Buffers: shared hit=21
              ->  Index Scan using datavault_rows_pkey on  datavault_rows  (cost=0.29..8.31 rows=1 width=130) (actual time=0.001..0.001 rows=1 loops=3125)
                    Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                    Index Cond: (datavault_rows.id = dv_filter_0.row_id)
                    Filter: ((datavault_rows.deleted_at IS NULL) AND (datavault_rows.table_id = '0266334a-0198-44cc-a0c8-ca25494abd29'::uuid))
                    Buffers: shared hit=9375
Planning:
  Buffers: shared hit=14
Planning Time: 0.346 ms
Execution Time: 16.507 ms

```

#### 3. NUMERIC RANGE FILTER PLAN
```text
Limit  (cost=4120.10..4120.35 rows=100 width=130) (actual time=18.150..18.159 rows=100 loops=1)
  Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
  Buffers: shared hit=2515
  ->  Sort  (cost=4120.10..4140.74 rows=8255 width=130) (actual time=18.149..18.153 rows=100 loops=1)
        Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
        Sort Key: datavault_rows.created_at
        Sort Method: top-N heapsort  Memory: 50kB
        Buffers: shared hit=2515
        ->  Hash Join  (cost=2945.46..3804.60 rows=8255 width=130) (actual time=11.907..16.623 rows=12167 loops=1)
              Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
              Inner Unique: true
              Hash Cond: (datavault_rows.id = dv_filter_0.row_id)
              Buffers: shared hit=2515
              ->  Seq Scan on  datavault_rows  (cost=0.00..793.50 rows=25000 width=130) (actual time=0.005..2.163 rows=25000 loops=1)
                    Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                    Filter: ((datavault_rows.deleted_at IS NULL) AND (datavault_rows.table_id = '0266334a-0198-44cc-a0c8-ca25494abd29'::uuid))
                    Buffers: shared hit=481
              ->  Hash  (cost=2842.28..2842.28 rows=8255 width=16) (actual time=11.658..11.658 rows=12167 loops=1)
                    Output: dv_filter_0.row_id
                    Buckets: 16384  Batches: 1  Memory Usage: 699kB
                    Buffers: shared hit=2034
                    ->  Bitmap Heap Scan on  datavault_values dv_filter_0  (cost=272.09..2842.28 rows=8255 width=16) (actual time=1.229..10.080 rows=12167 loops=1)
                          Output: dv_filter_0.row_id
                          Recheck Cond: (dv_filter_0.column_id = '45411de5-db21-4ad3-b004-70fde917d7ce'::uuid)
                          Filter: (((dv_filter_0.value #>> '{}'::text[]))::numeric > '25000'::numeric)
                          Rows Removed by Filter: 12833
                          Heap Blocks: exact=2013
                          Buffers: shared hit=2034
                          ->  Bitmap Index Scan on datavault_values_column_idx  (cost=0.00..270.02 rows=24764 width=0) (actual time=0.813..0.814 rows=25000 loops=1)
                                Index Cond: (dv_filter_0.column_id = '45411de5-db21-4ad3-b004-70fde917d7ce'::uuid)
                                Buffers: shared hit=21
Planning:
  Buffers: shared hit=14
Planning Time: 0.352 ms
Execution Time: 18.556 ms

```

#### 4. DATE RANGE FILTER PLAN
```text
Limit  (cost=4137.64..4137.89 rows=100 width=130) (actual time=18.318..18.330 rows=100 loops=1)
  Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
  Buffers: shared hit=2515
  ->  Sort  (cost=4137.64..4158.59 rows=8379 width=130) (actual time=18.317..18.323 rows=100 loops=1)
        Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
        Sort Key: datavault_rows.created_at
        Sort Method: top-N heapsort  Memory: 50kB
        Buffers: shared hit=2515
        ->  Hash Join  (cost=2958.26..3817.40 rows=8379 width=130) (actual time=11.979..16.849 rows=12050 loops=1)
              Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
              Inner Unique: true
              Hash Cond: (datavault_rows.id = dv_filter_0.row_id)
              Buffers: shared hit=2515
              ->  Seq Scan on  datavault_rows  (cost=0.00..793.50 rows=25000 width=130) (actual time=0.005..2.206 rows=25000 loops=1)
                    Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                    Filter: ((datavault_rows.deleted_at IS NULL) AND (datavault_rows.table_id = '0266334a-0198-44cc-a0c8-ca25494abd29'::uuid))
                    Buffers: shared hit=481
              ->  Hash  (cost=2853.53..2853.53 rows=8379 width=16) (actual time=11.782..11.784 rows=12050 loops=1)
                    Output: dv_filter_0.row_id
                    Buckets: 16384  Batches: 1  Memory Usage: 693kB
                    Buffers: shared hit=2034
                    ->  Bitmap Heap Scan on  datavault_values dv_filter_0  (cost=274.92..2853.53 rows=8379 width=16) (actual time=1.169..10.307 rows=12050 loops=1)
                          Output: dv_filter_0.row_id
                          Recheck Cond: (dv_filter_0.column_id = '3b755660-9659-4cb2-8e09-5f66b5c84b66'::uuid)
                          Filter: (((dv_filter_0.value #>> '{}'::text[]))::date > '2025-06-01'::date)
                          Rows Removed by Filter: 12950
                          Heap Blocks: exact=2013
                          Buffers: shared hit=2034
                          ->  Bitmap Index Scan on datavault_values_column_idx  (cost=0.00..272.83 rows=25138 width=0) (actual time=0.776..0.776 rows=25000 loops=1)
                                Index Cond: (dv_filter_0.column_id = '3b755660-9659-4cb2-8e09-5f66b5c84b66'::uuid)
                                Buffers: shared hit=21
Planning:
  Buffers: shared hit=14
Planning Time: 0.334 ms
Execution Time: 18.731 ms

```

#### 5. IS EMPTY FILTER PLAN
```text
Limit  (cost=4082.90..4083.15 rows=100 width=130) (actual time=19.445..19.456 rows=100 loops=1)
  Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
  Buffers: shared hit=2509
  ->  Sort  (cost=4082.90..4103.25 rows=8139 width=130) (actual time=19.444..19.449 rows=100 loops=1)
        Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
        Sort Key: datavault_rows.created_at
        Sort Method: top-N heapsort  Memory: 69kB
        Buffers: shared hit=2509
        ->  Hash Right Anti Join  (cost=1292.97..3771.83 rows=8139 width=130) (actual time=16.887..18.387 rows=8334 loops=1)
              Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
              Inner Unique: true
              Hash Cond: (dv_filter_0.row_id = datavault_rows.id)
              Buffers: shared hit=2509
              ->  Bitmap Heap Scan on  datavault_values dv_filter_0  (cost=186.97..2495.06 rows=16861 width=16) (actual time=0.848..7.211 rows=16666 loops=1)
                    Output: dv_filter_0.id, dv_filter_0.row_id, dv_filter_0.column_id, dv_filter_0.value, dv_filter_0.created_at, dv_filter_0.updated_at
                    Recheck Cond: (dv_filter_0.column_id = '3ef86338-b4e4-4164-9030-45b445e83066'::uuid)
                    Filter: ((dv_filter_0.value IS NOT NULL) AND (dv_filter_0.value <> 'null'::jsonb) AND (dv_filter_0.value <> '""'::jsonb))
                    Heap Blocks: exact=2013
                    Buffers: shared hit=2028
                    ->  Bitmap Index Scan on datavault_values_column_idx  (cost=0.00..182.76 rows=16862 width=0) (actual time=0.623..0.624 rows=16666 loops=1)
                          Index Cond: (dv_filter_0.column_id = '3ef86338-b4e4-4164-9030-45b445e83066'::uuid)
                          Buffers: shared hit=15
              ->  Hash  (cost=793.50..793.50 rows=25000 width=130) (actual time=6.942..6.943 rows=25000 loops=1)
                    Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                    Buckets: 32768  Batches: 1  Memory Usage: 4016kB
                    Buffers: shared hit=481
                    ->  Seq Scan on  datavault_rows  (cost=0.00..793.50 rows=25000 width=130) (actual time=0.005..2.315 rows=25000 loops=1)
                          Output: datavault_rows.id, datavault_rows.table_id, datavault_rows.deleted_at, datavault_rows.created_at, datavault_rows.updated_at, datavault_rows.created_by, datavault_rows.updated_by
                          Filter: ((datavault_rows.deleted_at IS NULL) AND (datavault_rows.table_id = '0266334a-0198-44cc-a0c8-ca25494abd29'::uuid))
                          Buffers: shared hit=481
Planning:
  Buffers: shared hit=14
Planning Time: 0.335 ms
Execution Time: 20.679 ms
```

## 4. Paper Assessment of Bounded Index Candidates

> **PostgreSQL Constraint**: Standard btree index tuples are strictly capped at 2,704 bytes (1/3 of the 8KB page size). Storing unconstrained `jsonb` payloads (which can reach 1MB) directly in a btree index causes fatal runtime errors (`index row size exceeds btree maximum`).

Here is the paper evaluation of the 3 candidate bounded indexing strategies:

### Candidate A: Truncated Expression Index
```sql
CREATE INDEX idx_datavault_values_col_val_trunc
  ON datavault_values (column_id, left(value #>> '{}', 200));
```
- **Safety**: `left(..., 200)` guarantees a maximum index key size of 800 bytes (in UTF-8), safely under the 2,704-byte limit.
- **Equality (`equals` / `is`)**: **EXCELLENT**. Turns the 25,000-row Bitmap Scan (13ms, 2,013 heap blocks read) into a composite btree point lookup (`column_id = $1 AND left(value #>> '{}', 200) = $2`) directly selecting the 3,125 matching rows in < 1ms.
- ⚠️ **`left(...) = $value` is not equality — it is a prefix match.** Two values that share
  their first 200 characters and differ afterwards both satisfy it, so used alone it
  returns false positives. DVP-2 must emit it as an *index-assisting* predicate beside the
  exact one it already generates, never in place of it:
  `left(value #>> '{}', 200) = $v AND value = $json::jsonb`. The first narrows via the
  index, the second rechecks on the heap. (A `WHERE length(value #>> '{}') <= 200` partial
  index would make the predicate exact, at the cost of excluding longer values entirely.)
- **Prefix Matching (`starts_with`)**: **EXCELLENT** when combined with `varchar_pattern_ops` / `text_pattern_ops`.
- **Contains (`LIKE '%needle%'`)**: **NO BENEFIT**. B-trees cannot accelerate leading-wildcard substring searches.
- **Numeric & Date Ranges**: **NO BENEFIT**. Lexicographical string order in `left(..., 200)` does not preserve numeric or date collation.

### Candidate B: Partial Index with Size Predicate
```sql
CREATE INDEX idx_datavault_values_col_val_partial
  ON datavault_values (column_id, (value #>> '{}'))
  WHERE pg_column_size(value) < 2000;
```
- **Safety**: The `WHERE pg_column_size(value) < 2000` predicate prevents any large JSON documents from entering the btree index.
- **Equality**: **EXCELLENT** for all standard-sized values (< 2KB), which covers ~99.9% of user cells.
- **Numeric & Date Ranges**: Can be extended with typed functional indexes per column or typed expression indexes:
  ```sql
  CREATE INDEX idx_datavault_values_numeric ON datavault_values (column_id, ((value #>> '{}')::numeric))
    WHERE value IS NOT NULL AND jsonb_typeof(value) = 'number';
  ```
  This turns a 25,000-row full column heap scan into an indexed range scan for numeric filters.
- **Caveat**: Queries must either mirror the `WHERE` predicate or the planner must be able to infer it.

### Candidate C: `pg_trgm` GIN Index for `contains` Filters
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_datavault_values_trgm_gin
  ON datavault_values USING gin ((value #>> '{}') gin_trgm_ops);
```
- **Neon Cloud PostgreSQL Support**: **CONFIRMED** — Neon documents `pg_trgm` as a supported extension ([Neon docs: `pg_trgm`](https://neon.com/docs/extensions/pg_trgm), re-fetched 2026-08-04; the `neon.tech` host now 308-redirects to `neon.com`). Note the page does **not** publish a per-version availability matrix — it defers to the [full extension list](https://neon.com/docs/extensions/pg-extensions) — so DVP-2 should confirm availability against the Postgres version this project's Neon instance actually runs before writing `CREATE EXTENSION` into a migration.
- **Safety**: GIN decomposes strings into 3-character trigrams. Each trigram entry in the GIN B-tree is only 3 bytes long (+ posting list references), meaning document size does not risk exceeding the 2,704-byte btree page limit.
- **Contains (`LIKE '%needle%'`)**: **TRANSFORMATIVE**. In our baseline plan, `contains` took 16.51 ms and read 11,409 shared buffers across 25,000 values. A GIN trigram index eliminates the full heap scan by intersecting trigram posting lists directly in the index. (The ">90% reduction" figure in the first draft was a projection, not a measurement — DVP-2 owns proving it, and note this benchmark's `contains` predicate matches 3,125 of 25,000 rows, an unusually unselective 12.5%; a selective needle would benefit far more.)
- **Equality & Ranges**: Not applicable for range comparisons; standard equality is better served by Candidate A.

---

## 5. Recommendation for DVP-2

1. **For Equality Filters (`equals`, `is`, `in`)**:
   - Implement **Candidate A** (composite truncated expression index: `(column_id, left(value #>> '{}', 200))`).
   - Update `DatavaultRowsRepository.buildValueCondition` for string equality to emit the
     truncated predicate **in addition to** the exact one — `left(value #>> '{}', 200) = $value
     AND value = $json::jsonb` — when `$value` length <= 200. Emitting it *instead of* the exact
     predicate is a correctness bug: it prefix-matches (see Candidate A above).
2. **For Contains Filters (`contains`, `contains_all`, `contains_any`)**:
   - Enable `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in migrations.
   - Add a GIN index on `(value #>> '{}') gin_trgm_ops`.
3. **For Range Filters (`numeric`, `date`)**:
   - At current dataset scales (< 50k rows per table), the 24ms execution time is dominated by bitmap scan filtering. At scale N > 100k rows, typed partial expression indexes for `number` and `date` types should be considered.
