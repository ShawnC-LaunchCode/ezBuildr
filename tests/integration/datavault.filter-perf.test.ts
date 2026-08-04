import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '../../server/db';
import { datavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
import { seedLargeDatavaultTable, type SeedDatavaultResult } from '../helpers/datavaultSeeder';

describe('DataVault Filter Performance Harness (DVP-1)', () => {
  let seededData: SeedDatavaultResult;

  afterAll(async () => {
    if (seededData) {
      await seededData.cleanup();
    }
  });

  it('seeds >= 100k values across at least 4 column types and measures filter performance', async () => {
    const db = getDb();
    expect(db).toBeDefined();

    console.log('\n===============================================================');
    console.log('   DVP-1: SEEDING & FILTER PERFORMANCE BENCHMARK HARNESS      ');
    console.log('===============================================================\n');

    // 1. Seed 25,000 rows (producing >= 100k values across 5 column types)
    const startTime = Date.now();
    seededData = await seedLargeDatavaultTable({ rowCount: 25000, batchSize: 2500 });
    const seedDurationMs = Date.now() - startTime;

    console.log(`  [ok] Created tenant: ${seededData.tenantId}`);
    console.log(`  [ok] Created table: ${seededData.tableId}`);
    console.log(`  [ok] Total rows inserted: ${seededData.rowCount}`);
    console.log(`  [ok] Total values inserted: ${seededData.valueCount}`);
    console.log(`  [ok] Seeding duration: ${(seedDurationMs / 1000).toFixed(2)}s`);

    // Criterion 1: Must produce a DataVault table with >= 100k values across >= 4 column types
    expect(seededData.rowCount).toBe(25000);
    expect(seededData.valueCount).toBeGreaterThanOrEqual(100000);
    expect(Object.keys(seededData.columns).length).toBeGreaterThanOrEqual(4);

    // Refresh planner statistics
    await db.execute(sql`ANALYZE datavault_rows;`);
    await db.execute(sql`ANALYZE datavault_values;`);
    await db.execute(sql`ANALYZE datavault_columns;`);

    // Helper to run EXPLAIN (ANALYZE, BUFFERS)
    const runExplain = async (querySql: string) => {
      const explainSql = sql.raw(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS) ${querySql}`);
      const res = await db.execute(explainSql);
      const lines = (res.rows as Array<{ 'QUERY PLAN': string }>).map((r) => r['QUERY PLAN']);
      return lines.join('\n');
    };

    // 2. Measure Equality Filter (status = 'PENDING')
    const equalityFilter = [{ columnId: seededData.columns.status.id, operator: 'equals' as const, value: 'PENDING' }];
    const equalityRows = await datavaultRowsRepository.findByTableId(seededData.tableId, {
      filters: equalityFilter,
      limit: 100,
      offset: 0,
    });
    expect(equalityRows.length).toBe(100);

    const equalitySql = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${seededData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${seededData.columns.status.id}'
      AND "dv_filter_0"."value" = '"PENDING"'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();
    const equalityPlan = await runExplain(equalitySql);

    console.log('\n---------------------------------------------------------------');
    console.log('1. EQUALITY FILTER PLAN:');
    console.log(equalityPlan);

    // 3. Measure Contains Filter (description contains 'audit review')
    const containsFilter = [{ columnId: seededData.columns.description.id, operator: 'contains' as const, value: 'audit review' }];
    const containsRows = await datavaultRowsRepository.findByTableId(seededData.tableId, {
      filters: containsFilter,
      limit: 100,
      offset: 0,
    });
    expect(containsRows.length).toBe(100);

    const containsSql = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${seededData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${seededData.columns.description.id}'
      AND "dv_filter_0"."value" #>> '{}' LIKE '%audit review%'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();
    const containsPlan = await runExplain(containsSql);

    console.log('\n---------------------------------------------------------------');
    console.log('2. CONTAINS FILTER PLAN:');
    console.log(containsPlan);

    // 4. Measure Numeric Range Filter (amount > 25000)
    const numericFilter = [{ columnId: seededData.columns.amount.id, operator: 'greater_than' as const, value: 25000 }];
    const numericRows = await datavaultRowsRepository.findByTableId(seededData.tableId, {
      filters: numericFilter,
      limit: 100,
      offset: 0,
    });
    expect(numericRows.length).toBe(100);

    const numericSql = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${seededData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${seededData.columns.amount.id}'
      AND ("dv_filter_0"."value" #>> '{}')::numeric > 25000
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();
    const numericPlan = await runExplain(numericSql);

    console.log('\n---------------------------------------------------------------');
    console.log('3. NUMERIC RANGE FILTER PLAN:');
    console.log(numericPlan);

    // 5. Measure Date Range Filter (event_date > '2025-06-01')
    const dateFilter = [{ columnId: seededData.columns.eventDate.id, operator: 'greater_than' as const, value: '2025-06-01' }];
    const dateRows = await datavaultRowsRepository.findByTableId(seededData.tableId, {
      filters: dateFilter,
      limit: 100,
      offset: 0,
    });
    expect(dateRows.length).toBe(100);

    const dateSql = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${seededData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${seededData.columns.eventDate.id}'
      AND ("dv_filter_0"."value" #>> '{}')::date > '2025-06-01'
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();
    const datePlan = await runExplain(dateSql);

    console.log('\n---------------------------------------------------------------');
    console.log('4. DATE RANGE FILTER PLAN:');
    console.log(datePlan);

    // 6. Measure Is Empty Filter (notes is_empty)
    const emptyFilter = [{ columnId: seededData.columns.notes.id, operator: 'is_empty' as const }];
    const emptyRows = await datavaultRowsRepository.findByTableId(seededData.tableId, {
      filters: emptyFilter,
      limit: 100,
      offset: 0,
    });
    expect(emptyRows.length).toBe(100);

    const emptySql = `
SELECT "datavault_rows"."id", "datavault_rows"."table_id", "datavault_rows"."deleted_at", "datavault_rows"."created_at", "datavault_rows"."updated_at", "datavault_rows"."created_by", "datavault_rows"."updated_by"
FROM "datavault_rows"
WHERE (
  "datavault_rows"."table_id" = '${seededData.tableId}'
  AND "datavault_rows"."deleted_at" IS NULL
  AND NOT exists (
    SELECT 1 FROM "datavault_values" "dv_filter_0"
    WHERE (
      "dv_filter_0"."row_id" = "datavault_rows"."id"
      AND "dv_filter_0"."column_id" = '${seededData.columns.notes.id}'
      AND "dv_filter_0"."value" IS NOT NULL
      AND "dv_filter_0"."value" != 'null'::jsonb
      AND "dv_filter_0"."value" != '""'::jsonb
    )
  )
)
ORDER BY "datavault_rows"."created_at" asc
LIMIT 100 OFFSET 0;
    `.trim();
    const emptyPlan = await runExplain(emptySql);

    console.log('\n---------------------------------------------------------------');
    console.log('5. IS EMPTY FILTER PLAN:');
    console.log(emptyPlan);
    console.log('\n===============================================================\n');
  }, 120000);
});
