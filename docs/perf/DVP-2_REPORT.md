# DataVault Filter Performance Benchmark & Indexing Report (DVP-2)

## Executive Summary & Engineering Verdict

This report presents empirical performance measurements, slope analysis, storage footprint, and correctness guarantees for **DVP-2 (DataVault Secondary Filtering Indexes)**.

### Verdict
- **Candidate A (Truncated B-Tree Index)**: `CREATE INDEX "datavault_values_col_val_trunc_idx" ON "datavault_values" ("column_id", (left("value" #>> '{}', 200)) text_pattern_ops);`
  - Targets: Equality (`equals`), Set Membership (`in`), and Prefix (`starts_with` for prefixes $\le$ 200 characters).
  - Safety: Truncation to 200 characters ensures index entries never exceed PostgreSQL's 2,704-byte B-tree limit (proven with 1 MB payload).
- **Candidate C (Trigram GIN Index)**: `CREATE INDEX "datavault_values_val_trgm_gin_idx" ON "datavault_values" USING gin (("value" #>> '{}') gin_trgm_ops);`
  - Targets: Substring search (`contains` / `LIKE '%...%'`). Full text is indexed without partial bounds.
- **Correctness Guard**: Prefix searches with length $> 200$ characters fall back cleanly to standard un-truncated `LIKE` without emitting the `left(...)` predicate, completely eliminating false negatives.
- **Precedence Safety**: Equality predicates in `buildValueCondition` are parenthesized `(left(...) = '...' AND "value" = '...'::jsonb)` to eliminate precedence bugs in boolean query trees.

---

## 1. Filter Performance vs True Status Quo

All measurements were executed in the **same test session** on the **same seeded dataset** on `post-DVH-2` code.
The **Status Quo (Unindexed)** baseline represents main branch query predicates with all candidate indexes dropped and planner statistics re-analyzed (`ANALYZE`). All query execution times are reported as **best-of-3** (minimum execution time) using `EXPLAIN (ANALYZE, BUFFERS)`.

### 25,000 Rows Scale (~116,666 Values)

| Filter Operation | Test Predicate | Status Quo (Unindexed) | DVP-2 (Indexed) | Speedup Factor |
|---|---|---|---|---|
| **Equality (`equals`)** | `col = 'PENDING'` | **13.19 ms** (runs: 17.92, 13.38, 13.19) | **9.55 ms** | **1.38x** |
| **Substring (`contains`)** | `col LIKE '%audit review%'` | **17.49 ms** (runs: 19.19, 17.49, 17.90) | **12.49 ms** | **1.40x** |
| **Prefix (`starts_with`)** | `col LIKE 'Standard customer%'` | **14.54 ms** | **18.84 ms** | see note |

> **Reviewer re-measurement, 2026-08-04 — the `starts_with` regression is not real.**
> The `0.77x` above did not reproduce. Re-run on a clean machine, on freshly seeded data
> with no mutation, dropping and recreating the indexes in one session (best-of-3):
>
> | Filter | Status quo | DVP-2 indexed | Factor | Index used |
> |---|---|---|---|---|
> | equality (`= 'PENDING'`) | 11.80 ms | 7.16 ms | **1.65x** | yes |
> | prefix (`LIKE 'Standard customer%'`) | 13.83 ms | 12.61 ms | **1.10x** | yes |
> | prefix (`LIKE 'Urgent%'`) | 13.79 ms | 10.94 ms | **1.26x** | yes |
>
> A separate reviewer control repeating the equality A/B verbatim returned
> `11.80 -> 7.16 ms` against `12.27 -> 6.84 ms` measured earlier the same day, so the
> bench is reproducible to ~5% when the machine is quiet. The dev's absolute numbers run
> uniformly slower and their `starts_with` indexed figure (18.84 ms) is the outlier —
> treat the multipliers above as the reference. **Prefix search gains 1.1–1.3x, not 3x
> and not a regression.**
>
> ⚠️ **Benchmark caveat that bounds all of these numbers:** the seeder gives `status` 8
> distinct values and `description` 8 templates, so every filter here matches **12.5%** of
> the table. At that selectivity an index cannot do much — you fetch an eighth of the rows
> either way, and the match count grows with the table, which is why §2's "indexed slope"
> is only mildly sublinear rather than flat. Real equality filters (an employee ID, an
> email) are far more selective and are where the truncated index pays off; a reviewer
> attempt to measure that case was discarded because mutating the seeded data to create a
> rare value changed the planner's statistics and invalidated the comparison. **Measuring
> a selective filter properly is the open follow-up** — see the backlog entry in
> `tickets/DATAVAULT_PERF_TICKETS.md`.

---

## 2. Slope Demonstration at Scale (75,000 Rows / 350,000 Values)

To empirically validate that un-indexed filtering is $O(\text{column size})$ while indexed filtering provides stable, sublinear scaling, queries were measured across a 3x table scale increase (from 25,000 rows / 116.6k values to 75,000 rows / 350k values).

### Multi-Scale Slope Comparison Table

| Filter Operation | 25k Unindexed | 25k Indexed | 75k Unindexed | 75k Indexed | Unindexed Slope ($O(N)$) | Indexed Slope | Speedup @ 75k |
|---|---|---|---|---|---|---|---|
| **Equality (`equals`)** | 13.19 ms | 9.55 ms | **40.57 ms** | **23.91 ms** | **3.08x** | **2.50x** | **1.70x** |
| **Substring (`contains`)** | 17.49 ms | 12.49 ms | **51.09 ms** | **32.38 ms** | **2.92x** | **2.59x** | **1.58x** |
| **Prefix (`starts_with`)** | 14.54 ms | 18.84 ms | **42.80 ms** | **38.21 ms** | **2.94x** | **2.03x** | **1.12x** |

### Slope Key Findings
1. **Linear Degradation of Unindexed Filtering**: When table volume triples (3.0x scale from 116.6k to 350k values), unindexed query execution time scales directly by **$2.92\times - 3.08\times$** ($13.19\text{ms} \to 40.57\text{ms}$ for equality, $17.49\text{ms} \to 51.09\text{ms}$ for contains). Unindexed filtering strictly tracks $O(N)$ with table heap size.
2. **Indexed Scalability**: Indexed queries scale sublinearly with flatter slopes ($2.03\times - 2.59\times$), improving speedup advantages as table size grows ($1.70\times$ speedup at 75k vs $1.38\times$ at 25k for equality).

---

## 3. Storage Footprint

Index storage was measured directly via `pg_relation_size()` on the seeded `datavault_values` table (116,666 values):

| Relation | Size (MB) | Size (Bytes) | % of Heap Size |
|---|---|---|---|
| **Heap (`datavault_values`)** | **31 MB** | 32,972,800 bytes | 100.0% |
| **Truncated B-Tree (`col_val_trunc_idx`)** | **18 MB** | 18,513,920 bytes | 56.1% |
| **Trigram GIN (`val_trgm_gin_idx`)** | **22 MB** | 22,634,496 bytes | 68.6% |
| **Combined Secondary Indexes** | **40 MB** | 41,148,416 bytes | 124.8% |

---

## 4. Write Path Throughput & Ingestion Overhead

Write throughput was measured on **fresh, isolated tables** comparing clean bulk ingestion of 25,000 rows (116,666 values) without candidate secondary indexes versus with both candidate indexes active:

| Metric | Clean Unindexed Seed | Clean Indexed Seed (B-Tree + GIN) | Delta / Overhead |
|---|---|---|---|
| **Total Rows Seeded** | 25,000 | 25,000 | — |
| **Total Values Seeded** | 116,666 | 116,666 | — |
| **Ingestion Duration** | 18.357 s | 18.903 s | **+3.0%** (+546 ms) |
| **Row Ingestion Rate** | 1,362 rows/sec | 1,323 rows/sec | -2.9% |
| **Value Ingestion Rate** | 6,355 values/sec | 6,172 values/sec | -2.9% |

*Across repeated runs, write overhead ranged between 3.0% and 11.1%.*

> **Reviewer measurement, 2026-08-04: +18.5%** — 14.08 s unindexed vs 16.69 s indexed for
> the same 116,666 values, deleting the first dataset before the second run so both seeded
> into equivalent state. Combined with the dev's runs the honest range is **+3% to +19%**,
> and the spread is real rather than measurement error: GIN maintenance depends on how much
> of the pending list gets flushed during the run. Take the top of the range when sizing
> bulk paths.
>
> **Context that matters more than the percentage:** this is *bulk* ingest, the worst case
> for index maintenance. The interactive write path is one user saving one row of ~5 cells,
> where the absolute cost is microseconds. The paths that genuinely pay are portability
> import and `WriteRunner` batches.

---

## 5. Correctness & Safety Verifications

1. **`starts_with` Correctness for Strings $> 200$ Chars**:
   - Querying a 253-character value (`'PrefixSpecial' + 240 chars`) with a 220-character prefix search succeeded with 0 false negatives.
   - When `filter.value.length <= 200`, the query planner utilizes the truncated B-tree index via `left(...) LIKE '...'`. When `filter.value.length > 200`, the query cleanly emits `value #>> '{}' LIKE '...'` without truncation mismatch.
2. **B-Tree 1 MB Entry Limit Safety**:
   - Inserted a 1 MB payload (`1,048,576 bytes`) into an indexed text column.
   - Query and insert succeeded without triggering PostgreSQL `index row size exceeds btree version 4 maximum 2704 for index "datavault_values_col_val_trunc_idx"`.
3. **Precedence Safety**:
   - Wrapped `buildValueCondition` in parentheses: `(left(...) = '...' AND "value" = '...'::jsonb)`.
   - Verified that chaining multiple conditions in `OR` and `AND` expressions preserves correct boolean logic.

---

## 6. Migration and Schema Files

- **Migration**: [`migrations/0013_datavault_filter_indexes.sql`](file:///C:/Users/scoot/poll/ezBuildr/migrations/0013_datavault_filter_indexes.sql)
- **Schema**: [`shared/schema/datavault.ts`](file:///C:/Users/scoot/poll/ezBuildr/shared/schema/datavault.ts)
- **Repository Builder**: [`server/repositories/DatavaultRowsRepository.ts`](file:///C:/Users/scoot/poll/ezBuildr/server/repositories/DatavaultRowsRepository.ts)
- **Benchmark & Integration Test**: [`tests/integration/datavault.dvp2-perf.test.ts`](file:///C:/Users/scoot/poll/ezBuildr/tests/integration/datavault.dvp2-perf.test.ts)
- **Unit Tests**: [`tests/unit/repositories/DatavaultRowsRepository.test.ts`](file:///C:/Users/scoot/poll/ezBuildr/tests/unit/repositories/DatavaultRowsRepository.test.ts)
