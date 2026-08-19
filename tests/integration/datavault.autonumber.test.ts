/**
 * Integration coverage for DataVault `auto_number` columns (DV-6).
 *
 * Verifies prefix/padding formatting, numeric backwards compatibility,
 * transactional concurrency, partial-update stability, the missing-counter
 * self-heal path, and retirement of the old `autonumber` API type.
 */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { datavaultNumberSequences } from '@shared/schema';

import { db } from '../../server/db';
import { datavaultColumnsService } from '../../server/services/DatavaultColumnsService';
import { datavaultRowsService } from '../../server/services/DatavaultRowsService';
import { datavaultTablesService } from '../../server/services/DatavaultTablesService';
import { enterTenantContextForTests } from '../../server/utils/rlsContext';
import {
  createAuthenticatedAgent,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';

describe('DataVault auto_number Integration Tests', () => {
  let ctx: IntegrationTestContext;
  let tableId: string;
  let idColumnId: string;
  let invoiceColumnId: string;
  let tenthColumnId: string;
  let hundredthColumnId: string;
  let startingAtFiveHundredColumnId: string;
  let statusColumnId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-6 Autonumber' });
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: this suite calls converted services directly (no HTTP), so bind the tenant context the middleware would have set.

    const table = await datavaultTablesService.createTable({
      tenantId: ctx.tenantId,
      slug: 'dv_6_autonumber',
      name: 'DV-6 Autonumber',
      description: null,
      ownerUserId: ctx.userId,
    });
    tableId = table.id;

    const columns = await datavaultColumnsService.listColumns(tableId, ctx.tenantId);
    const idColumn = columns.find((column) => column.slug === 'id');
    expect(idColumn).toBeDefined();
    idColumnId = idColumn!.id;

    const invoiceColumn = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Invoice Number',
      slug: 'invoice_number',
      type: 'auto_number',
      required: true,
      autoNumberStart: 1,
      autonumberPrefix: 'INV-',
      autonumberPadding: 4,
    }, ctx.tenantId);
    invoiceColumnId = invoiceColumn.id;

    const tenthColumn = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Tenth Value',
      slug: 'tenth_value',
      type: 'auto_number',
      autoNumberStart: 9,
      autonumberPrefix: 'INV-',
      autonumberPadding: 4,
    }, ctx.tenantId);
    tenthColumnId = tenthColumn.id;

    const hundredthColumn = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Hundredth Value',
      slug: 'hundredth_value',
      type: 'auto_number',
      autoNumberStart: 99,
      autonumberPrefix: 'INV-',
      autonumberPadding: 4,
    }, ctx.tenantId);
    hundredthColumnId = hundredthColumn.id;

    const startingAtFiveHundredColumn = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Starting At Five Hundred',
      slug: 'starting_at_five_hundred',
      type: 'auto_number',
      autoNumberStart: 500,
      autonumberPrefix: 'INV-',
      autonumberPadding: 4,
    }, ctx.tenantId);
    startingAtFiveHundredColumnId = startingAtFiveHundredColumn.id;

    const statusColumn = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Status',
      slug: 'status',
      type: 'text',
      required: false,
    }, ctx.tenantId);
    statusColumnId = statusColumn.id;
  });

  afterAll(async () => {
    await ctx?.cleanup();
  });

  it('seeds prefix, padding, and the configured start value into the counter row', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const [sequence] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, invoiceColumnId));

    expect(sequence).toMatchObject({
      nextValue: 1,
      prefix: 'INV-',
      padding: 4,
    });
  });

  it('formats successive, width-boundary, and custom-start values while preserving bare integers', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const row1 = await datavaultRowsService.createRow(tableId, ctx.tenantId, {});
    const row2 = await datavaultRowsService.createRow(tableId, ctx.tenantId, {});

    expect(row1.values[invoiceColumnId]).toBe('INV-0001');
    expect(row2.values[invoiceColumnId]).toBe('INV-0002');
    expect(row1.values[tenthColumnId]).toBe('INV-0009');
    expect(row2.values[tenthColumnId]).toBe('INV-0010');
    expect(row1.values[hundredthColumnId]).toBe('INV-0099');
    expect(row2.values[hundredthColumnId]).toBe('INV-0100');
    expect(row1.values[startingAtFiveHundredColumnId]).toBe('INV-0500');
    expect(row1.values[idColumnId]).toBe(1);
    expect(typeof row1.values[idColumnId]).toBe('number');
  });

  it('rejects a prefix with zero padding at the service layer', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    await expect(datavaultColumnsService.createColumn({
      tableId,
      name: 'Invalid Prefix',
      slug: 'invalid_prefix',
      type: 'auto_number',
      autonumberPrefix: 'BAD-',
      autonumberPadding: 0,
    }, ctx.tenantId)).rejects.toThrow('Auto-number padding must be at least 1');
  });

  it('preserves a prefixed value and its counter across partial updates', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const created = await datavaultRowsService.createRow(tableId, ctx.tenantId, {
      [statusColumnId]: 'new',
    });
    const valueBefore = created.values[invoiceColumnId];
    const [sequenceBefore] = await db
      .select({ nextValue: datavaultNumberSequences.nextValue })
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, invoiceColumnId));

    await datavaultRowsService.updateRow(created.row.id, ctx.tenantId, {
      [statusColumnId]: 'complete',
    });

    const updated = await datavaultRowsService.getRow(created.row.id, ctx.tenantId);
    const [sequenceAfter] = await db
      .select({ nextValue: datavaultNumberSequences.nextValue })
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, invoiceColumnId));

    expect(updated?.values[invoiceColumnId]).toBe(valueBefore);
    expect(sequenceAfter).toEqual(sequenceBefore);
  });

  it('generates distinct prefixed values under concurrent inserts', { timeout: 30000 }, async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const rows = await Promise.all(
      Array.from({ length: 10 }, () => datavaultRowsService.createRow(tableId, ctx.tenantId, {}))
    );
    const values = rows.map((row) => row.values[invoiceColumnId]);

    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toEqual(expect.stringMatching(/^INV-\d{4}$/));
    }
  });

  it('self-heals a missing counter with the column prefix and padding', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    await db.delete(datavaultNumberSequences).where(and(
      eq(datavaultNumberSequences.tenantId, ctx.tenantId),
      eq(datavaultNumberSequences.tableId, tableId),
      eq(datavaultNumberSequences.columnId, invoiceColumnId)
    ));

    const row = await datavaultRowsService.createRow(tableId, ctx.tenantId, {});
    expect(row.values[invoiceColumnId]).toBe('INV-0001');

    const [sequence] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, invoiceColumnId));
    expect(sequence).toMatchObject({ nextValue: 2, prefix: 'INV-', padding: 4 });
  });

  it("rejects the retired 'autonumber' type at the create-column API", async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const response = await agent.post(`/api/datavault/tables/${tableId}/columns`).send({
      name: 'Retired Type',
      type: 'autonumber',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: "Column type 'autonumber' is deprecated; use 'auto_number' instead",
    });
  });

  it('removes the formatted counter row via CASCADE when its column is deleted', async () => {
    enterTenantContextForTests(ctx.tenantId); // RLS-2b: bind per test — enterWith covers only the current async execution.
    const column = await datavaultColumnsService.createColumn({
      tableId,
      name: 'Temporary Auto Number',
      slug: 'temporary_auto_number',
      type: 'auto_number',
      autonumberPrefix: 'TMP-',
      autonumberPadding: 3,
    }, ctx.tenantId);

    const [sequenceBefore] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, column.id));
    expect(sequenceBefore).toMatchObject({ prefix: 'TMP-', padding: 3 });

    await datavaultColumnsService.deleteColumn(column.id, ctx.tenantId);

    const [sequenceAfter] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, column.id));
    expect(sequenceAfter).toBeUndefined();
  });
});
