import { describe, it, expect, afterAll } from 'vitest';
import { datavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
import { datavaultRowsService } from '../../server/services/DatavaultRowsService';
import { enterTenantContextForTests } from '../../server/utils/rlsContext';
import { seedWideDatavaultTable, type SeedWideDatavaultResult } from '../helpers/datavaultSeeder';

describe('DataVault Wide Table Column Narrowing Benchmark (DVP-3)', () => {
  let seededData: SeedWideDatavaultResult;

  afterAll(async () => {
    if (seededData) {
      await seededData.cleanup();
    }
  });

  it('measures payload size and query time on a 50-column table (full vs narrowed fetch)', async () => {
    // RLS-2b: calls the converted service directly (no HTTP), so bind the tenant
    // context the rlsContext middleware would otherwise have set.
    console.log('\n===============================================================');
    console.log('   DVP-3: WIDE TABLE (50 COLUMNS) COLUMN NARROWING BENCHMARK   ');
    console.log('===============================================================\n');

    // 1. Seed 50 columns x 1000 rows = 50,000 values
    const seedStart = Date.now();
    seededData = await seedWideDatavaultTable({ columnCount: 50, rowCount: 1000, batchSize: 500 });
    enterTenantContextForTests(seededData.tenantId);
    const seedDurationMs = Date.now() - seedStart;

    console.log(`  [ok] Table ID: ${seededData.tableId}`);
    console.log(`  [ok] Total Columns: ${seededData.columns.length}`);
    console.log(`  [ok] Total Rows: ${seededData.rowCount}`);
    console.log(`  [ok] Total Values: ${seededData.valueCount}`);
    console.log(`  [ok] Seeding Duration: ${(seedDurationMs / 1000).toFixed(2)}s\n`);

    expect(seededData.columns.length).toBeGreaterThanOrEqual(50);
    expect(seededData.rowCount).toBe(1000);
    expect(seededData.valueCount).toBe(50000);

    const targetCols = [seededData.columns[0], seededData.columns[1]];
    const targetColIds = targetCols.map((c) => c.id);

    // Warm-up queries
    await datavaultRowsRepository.getRowsWithValues(seededData.tableId, { limit: 100, offset: 0 });
    await datavaultRowsRepository.getRowsWithValues(seededData.tableId, { limit: 100, offset: 0, columnIds: targetColIds });

    const iterations = 5;

    // 2. Full fetch (all 50 columns, 100 rows)
    let fullDurationTotal = 0;
    let fullPayloadBytes = 0;
    let fullRows: Array<{ row: unknown; values: Record<string, unknown> }> = [];

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      fullRows = await datavaultRowsRepository.getRowsWithValues(seededData.tableId, { limit: 100, offset: 0 });
      const t1 = performance.now();
      fullDurationTotal += t1 - t0;
      if (i === 0) {
        fullPayloadBytes = Buffer.byteLength(JSON.stringify(fullRows), 'utf8');
      }
    }
    const fullAvgMs = fullDurationTotal / iterations;

    // Verify all 50 columns are present in each row
    expect(fullRows.length).toBe(100);
    for (const item of fullRows) {
      expect(Object.keys(item.values).length).toBe(50);
      for (const col of seededData.columns) {
        expect(item.values).toHaveProperty(col.id);
      }
    }

    // 3. Narrowed fetch (only 2 columns requested at DB level, 100 rows)
    let narrowedDurationTotal = 0;
    let narrowedPayloadBytes = 0;
    let narrowedRows: Array<{ row: unknown; values: Record<string, unknown> }> = [];

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      narrowedRows = await datavaultRowsRepository.getRowsWithValues(seededData.tableId, {
        limit: 100,
        offset: 0,
        columnIds: targetColIds,
      });
      const t1 = performance.now();
      narrowedDurationTotal += t1 - t0;
      if (i === 0) {
        narrowedPayloadBytes = Buffer.byteLength(JSON.stringify(narrowedRows), 'utf8');
      }
    }
    const narrowedAvgMs = narrowedDurationTotal / iterations;

    // Criterion: Narrowed fetch must return only requested columns in values
    expect(narrowedRows.length).toBe(100);
    for (const item of narrowedRows) {
      const returnedKeys = Object.keys(item.values);
      expect(returnedKeys.length).toBe(2);
      expect(item.values).toHaveProperty(targetColIds[0]);
      expect(item.values).toHaveProperty(targetColIds[1]);
      // Ensure other 48 columns are NOT present
      for (let c = 2; c < seededData.columns.length; c++) {
        expect(item.values).not.toHaveProperty(seededData.columns[c].id);
      }
    }

    // 4. Test Service Layer propagation
    const serviceResult = await datavaultRowsService.getRowsWithOptions(
      seededData.tenantId,
      seededData.tableId,
      { limit: 50, offset: 0, columnIds: [targetColIds[0]] }
    );
    expect(serviceResult.rows.length).toBe(50);
    for (const item of serviceResult.rows) {
      expect(Object.keys(item.values)).toEqual([targetColIds[0]]);
    }

    const payloadReduction = ((1 - narrowedPayloadBytes / fullPayloadBytes) * 100).toFixed(1);
    const speedup = (fullAvgMs / narrowedAvgMs).toFixed(2);

    console.log('---------------------------------------------------------------');
    console.log('BENCHMARK RESULTS (100 rows fetched from 50-column table):');
    console.log('---------------------------------------------------------------');
    console.log(`  Full Fetch (50 cols):     ${fullAvgMs.toFixed(2)} ms | ${(fullPayloadBytes / 1024).toFixed(2)} KB | 5,000 DB values transferred`);
    console.log(`  Narrowed Fetch (2 cols):  ${narrowedAvgMs.toFixed(2)} ms | ${(narrowedPayloadBytes / 1024).toFixed(2)} KB | 200 DB values transferred`);
    console.log(`  Payload Reduction:        ${payloadReduction}%`);
    console.log(`  Query Speedup:            ${speedup}x`);
    console.log('===============================================================\n');

    expect(narrowedPayloadBytes).toBeLessThan(fullPayloadBytes);
    expect(narrowedRows.length).toBe(100);
  }, 120000);
});
