import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { datavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
import { seedLargeDatavaultTable, type SeedDatavaultResult } from '../helpers/datavaultSeeder';
import * as schema from '@shared/schema';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { withTenant } from '../../server/utils/rlsContext';

describe('DataVault Filter Performance Benchmark (DVP-2)', () => {
  let cleanSeedData: SeedDatavaultResult | undefined;
  let scaledSeedData: SeedDatavaultResult | undefined;

  afterAll(async () => {
    if (cleanSeedData) {
      await cleanSeedData.cleanup();
    }
    if (scaledSeedData) {
      await scaledSeedData.cleanup();
    }
  });

  it('measures baseline vs indexed filter slope, write throughput on post-DVH-2 main, storage, and correctness', async () => {
    // Owner handle: this suite does DDL (DROP/CREATE INDEX, SET) and seeds
    // fixtures, none of which the restricted app role may do.
    const db = getOwnerDb();
    expect(db).toBeDefined();

    console.log('\n===============================================================');
    console.log('   DVP-2: RIGOROUS BENCHMARK HARNESS & WRITE-PATH MEASUREMENT   ');
    console.log('===============================================================\n');

    // Ensure predictable single-worker execution to prevent Docker/WSL /dev/shm exhaustion
    await db.execute(sql`SET max_parallel_workers_per_gather = 0;`);

    // Helper to drop candidate indexes
    const dropCandidateIndexes = async () => {
      await db.execute(sql`DROP INDEX IF EXISTS "datavault_values_col_val_trunc_idx";`);
      await db.execute(sql`DROP INDEX IF EXISTS "datavault_values_val_trgm_gin_idx";`);
    };

    // Helper to create candidate indexes
    const createCandidateIndexes = async () => {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;`);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "datavault_values_col_val_trunc_idx"
          ON "datavault_values" ("column_id", (left("value" #>> '{}', 200)) text_pattern_ops);
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS "datavault_values_val_trgm_gin_idx"
          ON "datavault_values" USING gin (("value" #>> '{}') gin_trgm_ops);
      `);
    };

    // Helper to run query with EXPLAIN (ANALYZE, BUFFERS) and extract execution time
    const runExplain = async (querySql: string) => {
      const explainSql = sql.raw(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS) ${querySql}`);
      const res = await db.execute(explainSql);
      const lines = (res.rows as Array<{ 'QUERY PLAN': string }>).map((r) => r['QUERY PLAN']);
      const planText = lines.join('\n');
      const timeMatch = planText.match(/Execution Time:\s+([0-9.]+)\s+ms/);
      const execTime = timeMatch ? parseFloat(timeMatch[1]) : 0;
      return { planText, execTime };
    };

    // Helper to measure best-of-3 query execution time
    const measureBestOf3 = async (querySql: string) => {
      const times: number[] = [];
      let lastPlan = '';
      for (let i = 0; i < 3; i++) {
        const { planText, execTime } = await runExplain(querySql);
        times.push(execTime);
        lastPlan = planText;
      }
      const minTime = Math.min(...times);
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      return { minTime, avgTime, times, planText: lastPlan };
    };

    // -------------------------------------------------------------------------
    // 1. Write Throughput Measurement on Clean Tables (Unindexed vs Indexed)
    // -------------------------------------------------------------------------
    console.log('--- 1. WRITE THROUGHPUT MEASUREMENT (Clean Tables, post-DVH-2 main) ---');

    // 1a. Clean Unindexed Seed (25k rows / 116.6k values)
    await dropCandidateIndexes();
    const unindexedStart = Date.now();
    const unindexedSeed = await seedLargeDatavaultTable({ rowCount: 25000, batchSize: 2500 });
    const unindexedDurationMs = Date.now() - unindexedStart;
    const unindexedRowsPerSec = (unindexedSeed.rowCount / (unindexedDurationMs / 1000)).toFixed(0);
    const unindexedValuesPerSec = (unindexedSeed.valueCount / (unindexedDurationMs / 1000)).toFixed(0);

    console.log(`  [Unindexed Clean Seed]`);
    console.log(`    Rows: ${unindexedSeed.rowCount}, Values: ${unindexedSeed.valueCount}`);
    console.log(`    Duration: ${(unindexedDurationMs / 1000).toFixed(3)}s`);
    console.log(`    Throughput: ${unindexedRowsPerSec} rows/sec, ${unindexedValuesPerSec} values/sec`);

    // Clean up unindexed table
    await unindexedSeed.cleanup();

    // 1b. Clean Indexed Seed (25k rows / 116.6k values)
    await createCandidateIndexes();
    const indexedStart = Date.now();
    cleanSeedData = await seedLargeDatavaultTable({ rowCount: 25000, batchSize: 2500 });
    const indexedDurationMs = Date.now() - indexedStart;
    const indexedRowsPerSec = (cleanSeedData.rowCount / (indexedDurationMs / 1000)).toFixed(0);
    const indexedValuesPerSec = (cleanSeedData.valueCount / (indexedDurationMs / 1000)).toFixed(0);

    console.log(`  [Indexed Clean Seed (with B-Tree & GIN)]`);
    console.log(`    Rows: ${cleanSeedData.rowCount}, Values: ${cleanSeedData.valueCount}`);
    console.log(`    Duration: ${(indexedDurationMs / 1000).toFixed(3)}s`);
    console.log(`    Throughput: ${indexedRowsPerSec} rows/sec, ${indexedValuesPerSec} values/sec`);

    const writeOverheadPct = (((indexedDurationMs - unindexedDurationMs) / unindexedDurationMs) * 100).toFixed(1);
    console.log(`  [Write Cost Delta] ${unindexedDurationMs}ms -> ${indexedDurationMs}ms (+${writeOverheadPct}%)\n`);

    // -------------------------------------------------------------------------
    // 2. Measure Storage Footprint (AC4 / Review Item 4)
    // -------------------------------------------------------------------------
    console.log('--- 2. STORAGE FOOTPRINT MEASUREMENT ---');
    const storageRes = await db.execute(sql`
      SELECT
        pg_relation_size('datavault_values') AS heap_bytes,
        pg_relation_size('datavault_values_col_val_trunc_idx') AS trunc_btree_bytes,
        pg_relation_size('datavault_values_val_trgm_gin_idx') AS trgm_gin_bytes,
        pg_size_pretty(pg_relation_size('datavault_values')) AS heap_pretty,
        pg_size_pretty(pg_relation_size('datavault_values_col_val_trunc_idx')) AS trunc_btree_pretty,
        pg_size_pretty(pg_relation_size('datavault_values_val_trgm_gin_idx')) AS trgm_gin_pretty
    `);
    const storageRow = (storageRes.rows as any[])[0];
    console.log(`  Heap Size (datavault_values):            ${storageRow.heap_pretty} (${storageRow.heap_bytes} bytes)`);
    console.log(`  Truncated B-Tree Index (col_val_trunc):  ${storageRow.trunc_btree_pretty} (${storageRow.trunc_btree_bytes} bytes)`);
    console.log(`  Trigram GIN Index (val_trgm_gin):       ${storageRow.trgm_gin_pretty} (${storageRow.trgm_gin_bytes} bytes)\n`);

    // -------------------------------------------------------------------------
    // 3. Filter Plan & Timing Measurements on 25k Rows (Status Quo vs DVP-2)
    // -------------------------------------------------------------------------
    console.log('--- 3. FILTER COMPARISON AT 25k ROWS (Status Quo vs DVP-2, Best-of-3) ---');

    const equalitySqlStatusQuo = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${cleanSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${cleanSeedData.columns.status.id}'
      AND "dv_filter_0"."value" = '"PENDING"'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const containsSqlStatusQuo = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${cleanSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${cleanSeedData.columns.description.id}'
      AND "dv_filter_0"."value" #>> '{}' LIKE '%audit review%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const startsWithSqlStatusQuo = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${cleanSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${cleanSeedData.columns.description.id}'
      AND "dv_filter_0"."value" #>> '{}' LIKE 'Standard customer%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const equalitySqlIndexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${cleanSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${cleanSeedData.columns.status.id}'
      AND left("dv_filter_0"."value" #>> '{}', 200) = 'PENDING'
      AND "dv_filter_0"."value" = '"PENDING"'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const startsWithSqlIndexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${cleanSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${cleanSeedData.columns.description.id}'
      AND left("dv_filter_0"."value" #>> '{}', 200) LIKE 'Standard customer%'
      AND "dv_filter_0"."value" #>> '{}' LIKE 'Standard customer%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    // 3a. Measure Unindexed (Status Quo)
    await dropCandidateIndexes();
    await db.execute(sql`ANALYZE datavault_rows;`);
    await db.execute(sql`ANALYZE datavault_values;`);

    const unindexedEq25k = await measureBestOf3(equalitySqlStatusQuo);
    const unindexedCont25k = await measureBestOf3(containsSqlStatusQuo);
    const unindexedSw25k = await measureBestOf3(startsWithSqlStatusQuo);

    console.log(`  Status Quo (Unindexed, 25k rows / 116.6k values):`);
    console.log(`    Equality:    best ${unindexedEq25k.minTime.toFixed(2)} ms (runs: ${unindexedEq25k.times.map(t => t.toFixed(2)).join(', ')})`);
    console.log(`    Contains:    best ${unindexedCont25k.minTime.toFixed(2)} ms (runs: ${unindexedCont25k.times.map(t => t.toFixed(2)).join(', ')})`);
    console.log(`    StartsWith:  best ${unindexedSw25k.minTime.toFixed(2)} ms (runs: ${unindexedSw25k.times.map(t => t.toFixed(2)).join(', ')})`);

    // 3b. Measure Indexed (DVP-2)
    await createCandidateIndexes();
    await db.execute(sql`ANALYZE datavault_values;`);

    const indexedEq25k = await measureBestOf3(equalitySqlIndexed);
    const indexedCont25k = await measureBestOf3(containsSqlStatusQuo); // contains uses gin automatically
    const indexedSw25k = await measureBestOf3(startsWithSqlIndexed);

    console.log(`  DVP-2 (Indexed, 25k rows / 116.6k values):`);
    console.log(`    Equality:    best ${indexedEq25k.minTime.toFixed(2)} ms (speedup: ${(unindexedEq25k.minTime / indexedEq25k.minTime).toFixed(2)}x)`);
    console.log(`    Contains:    best ${indexedCont25k.minTime.toFixed(2)} ms (speedup: ${(unindexedCont25k.minTime / indexedCont25k.minTime).toFixed(2)}x)`);
    console.log(`    StartsWith:  best ${indexedSw25k.minTime.toFixed(2)} ms (speedup: ${(unindexedSw25k.minTime / indexedSw25k.minTime).toFixed(2)}x)\n`);

    // -------------------------------------------------------------------------
    // 4. Correctness Tests: starts_with > 200 chars (Review Item 1) & 1MB B-Tree
    // -------------------------------------------------------------------------
    console.log('--- 4. CORRECTNESS & SAFETY TESTS ---');
    const longString250 = `PrefixSpecial${'X'.repeat(240)}`; // 253 chars
    const [longRow] = await getOwnerDb().insert(schema.datavaultRows).values({
      tableId: cleanSeedData.tableId,
    }).returning();
    await getOwnerDb().insert(schema.datavaultValues).values({
      rowId: longRow.id,
      columnId: cleanSeedData.columns.description.id,
      value: longString250,
    });

    // Query with 220-char prefix (> 200 chars)
    // Hoisted: TS narrowing of `cleanSeedData` does not carry into the
    // `withTenant` callback below.
    const seeded = cleanSeedData;
    const longPrefixSearch = longString250.slice(0, 220);
    const foundRowsLong = await withTenant(seeded.tenantId, (tx) => datavaultRowsRepository.findByTableId(seeded.tableId, {
      filters: [{
        columnId: seeded.columns.description.id,
        operator: 'starts_with',
        value: longPrefixSearch,
      }],
    }, tx));
    expect(foundRowsLong.some(r => r.id === longRow.id)).toBe(true);
    console.log(`  [ok] Verified starts_with > 200 chars successfully matches long row without false negatives!`);

    // Query with short prefix (<= 200 chars)
    const shortPrefixSearch = 'PrefixSpecial';
    const foundRowsShort = await withTenant(seeded.tenantId, (tx) => datavaultRowsRepository.findByTableId(seeded.tableId, {
      filters: [{
        columnId: seeded.columns.description.id,
        operator: 'starts_with',
        value: shortPrefixSearch,
      }],
    }, tx));
    expect(foundRowsShort.some(r => r.id === longRow.id)).toBe(true);
    console.log(`  [ok] Verified starts_with <= 200 chars successfully matches long row!`);

    // Cleanup long test row
    await getOwnerDb().delete(schema.datavaultRows).where(sql`id = ${longRow.id}`);

    // Hard Safety Test: B-Tree Entry Limit with 1MB Payload (AC3)
    const largePayloadSize = 1024 * 1024; // 1 MB payload
    const largeStringValue = 'B'.repeat(largePayloadSize);

    const [testRow] = await getOwnerDb().insert(schema.datavaultRows).values({
      tableId: cleanSeedData.tableId,
    }).returning();

    const insertPromise = getOwnerDb().insert(schema.datavaultValues).values({
      rowId: testRow.id,
      columnId: seeded.columns.description.id,
      value: largeStringValue,
    }).returning();

    await expect(insertPromise).resolves.toBeDefined();
    console.log(`  [ok] Successfully inserted ${largePayloadSize} bytes (1MB) value into indexed column without exceeding btree limits!\n`);

    // Cleanup large test row
    await getOwnerDb().delete(schema.datavaultRows).where(sql`id = ${testRow.id}`);

    // -------------------------------------------------------------------------
    // 5. Slope Demonstration at Scale (75,000 Rows / 350,000 Values)
    // -------------------------------------------------------------------------
    console.log('--- 5. SLOPE MEASUREMENT AT SCALE (75k Rows / 350k Values) ---');
    // Clean up 25k seed data first to keep database clean and isolated
    await cleanSeedData.cleanup();
    cleanSeedData = undefined;

    scaledSeedData = await seedLargeDatavaultTable({ rowCount: 75000, batchSize: 3000 });
    console.log(`  [ok] Seeded scale dataset: ${scaledSeedData.rowCount} rows, ${scaledSeedData.valueCount} values`);

    const equalitySqlScaleUnindexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${scaledSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${scaledSeedData.columns.status.id}'
      AND "dv_filter_0"."value" = '"PENDING"'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const containsSqlScaleUnindexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${scaledSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${scaledSeedData.columns.description.id}'
      AND "dv_filter_0"."value" #>> '{}' LIKE '%audit review%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const startsWithSqlScaleUnindexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${scaledSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${scaledSeedData.columns.description.id}'
      AND "dv_filter_0"."value" #>> '{}' LIKE 'Standard customer%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const equalitySqlScaleIndexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${scaledSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${scaledSeedData.columns.status.id}'
      AND left("dv_filter_0"."value" #>> '{}', 200) = 'PENDING'
      AND "dv_filter_0"."value" = '"PENDING"'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    const startsWithSqlScaleIndexed = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${scaledSeedData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${scaledSeedData.columns.description.id}'
      AND left("dv_filter_0"."value" #>> '{}', 200) LIKE 'Standard customer%'
      AND "dv_filter_0"."value" #>> '{}' LIKE 'Standard customer%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();

    // 5a. Scale Unindexed
    await dropCandidateIndexes();
    await db.execute(sql`ANALYZE datavault_rows;`);
    await db.execute(sql`ANALYZE datavault_values;`);

    const unindexedEqScale = await measureBestOf3(equalitySqlScaleUnindexed);
    const unindexedContScale = await measureBestOf3(containsSqlScaleUnindexed);
    const unindexedSwScale = await measureBestOf3(startsWithSqlScaleUnindexed);

    console.log(`  Status Quo (Unindexed, 75k rows / 350k values):`);
    console.log(`    Equality:    best ${unindexedEqScale.minTime.toFixed(2)} ms (runs: ${unindexedEqScale.times.map(t => t.toFixed(2)).join(', ')})`);
    console.log(`    Contains:    best ${unindexedContScale.minTime.toFixed(2)} ms (runs: ${unindexedContScale.times.map(t => t.toFixed(2)).join(', ')})`);
    console.log(`    StartsWith:  best ${unindexedSwScale.minTime.toFixed(2)} ms (runs: ${unindexedSwScale.times.map(t => t.toFixed(2)).join(', ')})`);

    // 5b. Scale Indexed
    await createCandidateIndexes();
    await db.execute(sql`ANALYZE datavault_values;`);

    const indexedEqScale = await measureBestOf3(equalitySqlScaleIndexed);
    const indexedContScale = await measureBestOf3(containsSqlScaleUnindexed);
    const indexedSwScale = await measureBestOf3(startsWithSqlScaleIndexed);

    console.log(`  DVP-2 (Indexed, 75k rows / 350k values):`);
    console.log(`    Equality:    best ${indexedEqScale.minTime.toFixed(2)} ms (speedup: ${(unindexedEqScale.minTime / indexedEqScale.minTime).toFixed(2)}x)`);
    console.log(`    Contains:    best ${indexedContScale.minTime.toFixed(2)} ms (speedup: ${(unindexedContScale.minTime / indexedContScale.minTime).toFixed(2)}x)`);
    console.log(`    StartsWith:  best ${indexedSwScale.minTime.toFixed(2)} ms (speedup: ${(unindexedSwScale.minTime / indexedSwScale.minTime).toFixed(2)}x)\n`);

    console.log('--- SLOPE SUMMARY TABLE ---');
    console.log('| Filter | 25k Unindexed | 25k Indexed | 75k Unindexed | 75k Indexed | Slope Unindexed | Slope Indexed | Speedup @ 75k |');
    console.log(`| Equality | ${unindexedEq25k.minTime.toFixed(2)} ms | ${indexedEq25k.minTime.toFixed(2)} ms | ${unindexedEqScale.minTime.toFixed(2)} ms | ${indexedEqScale.minTime.toFixed(2)} ms | ${(unindexedEqScale.minTime / unindexedEq25k.minTime).toFixed(2)}x | ${(indexedEqScale.minTime / indexedEq25k.minTime).toFixed(2)}x | ${(unindexedEqScale.minTime / indexedEqScale.minTime).toFixed(2)}x |`);
    console.log(`| Contains | ${unindexedCont25k.minTime.toFixed(2)} ms | ${indexedCont25k.minTime.toFixed(2)} ms | ${unindexedContScale.minTime.toFixed(2)} ms | ${indexedContScale.minTime.toFixed(2)} ms | ${(unindexedContScale.minTime / unindexedCont25k.minTime).toFixed(2)}x | ${(indexedContScale.minTime / indexedCont25k.minTime).toFixed(2)}x | ${(unindexedContScale.minTime / indexedContScale.minTime).toFixed(2)}x |`);
    console.log(`| StartsWith | ${unindexedSw25k.minTime.toFixed(2)} ms | ${indexedSw25k.minTime.toFixed(2)} ms | ${unindexedSwScale.minTime.toFixed(2)} ms | ${indexedSwScale.minTime.toFixed(2)} ms | ${(unindexedSwScale.minTime / unindexedSw25k.minTime).toFixed(2)}x | ${(indexedSwScale.minTime / indexedSw25k.minTime).toFixed(2)}x | ${(unindexedSwScale.minTime / indexedSwScale.minTime).toFixed(2)}x |\n`);
  }, 300000);
});
