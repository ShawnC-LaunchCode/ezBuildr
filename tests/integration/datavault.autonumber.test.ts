/**
 * Integration tests for DataVault `auto_number` columns (DVA-1)
 *
 * Verifies the server-generated, transactional counter mechanism backed by
 * `datavault_number_sequences`: distinct/increasing integer values seeded from
 * `column.autoNumberStart`, the missing-counter-row self-heal path, and the
 * CASCADE delete of the counter row when its column is deleted.
 *
 * Supersedes the old version of this file, which tested the now-deleted `v4`
 * `autonumber` type (prefix/padding/yearly reset) — that generation path was
 * unreachable from the client UI and has been removed per DVA-1.
 */
import { eq, and } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { tenants, datavaultNumberSequences } from '@shared/schema';

import { db } from '../../server/db';
import { datavaultColumnsService } from '../../server/services/DatavaultColumnsService';
import { datavaultRowsService } from '../../server/services/DatavaultRowsService';
import { datavaultTablesService } from '../../server/services/DatavaultTablesService';

describe('DataVault auto_number Integration Tests', () => {
  let tenantId: string;
  let tableId: string;
  let idColumnId: string; // auto-created primary key column (bypasses the service create-path)
  let ticketColumnId: string; // explicitly created via DatavaultColumnsService (normal create-path)
  let statusColumnId: string;

  beforeAll(async () => {
    const [tenant] = await db.insert(tenants).values({
      name: 'Autonumber Test Tenant',
    }).returning();
    tenantId = tenant.id;

    const table = await datavaultTablesService.createTable({
      tenantId,
      slug: 'autonumber_test_table',
      name: 'Autonumber Test Table',
      description: null,
      ownerUserId: null,
    });
    tableId = table.id;

    const columns = await datavaultColumnsService.listColumns(tableId, tenantId);
    const idColumn = columns.find((c) => c.slug === 'id');
    expect(idColumn).toBeDefined();
    idColumnId = idColumn!.id;

    const ticketColumn = await datavaultColumnsService.createColumn(
      {
        tableId,
        name: 'Ticket Number',
        slug: 'ticket_number',
        type: 'auto_number',
        required: true,
        autoNumberStart: 100,
      },
      tenantId
    );
    ticketColumnId = ticketColumn.id;

    const statusColumn = await datavaultColumnsService.createColumn(
      {
        tableId,
        name: 'Status',
        slug: 'status',
        type: 'text',
        required: false,
      },
      tenantId
    );
    statusColumnId = statusColumn.id;
  });

  afterAll(async () => {
    if (tableId) {
      await datavaultTablesService.deleteTable(tableId, tenantId);
    }
    if (tenantId) {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it('creates a counter row seeded from autoNumberStart when the column is created', async () => {
    const [sequence] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, ticketColumnId));

    expect(sequence).toBeDefined();
    expect(sequence?.nextValue).toBe(100);
  });

  it('generates distinct, increasing integer values via the server', async () => {
    const row1 = await datavaultRowsService.createRow(tableId, tenantId, {}, undefined);
    const row2 = await datavaultRowsService.createRow(tableId, tenantId, {}, undefined);

    // `id` column: auto-created by createTable() (bypasses the column-create
    // service path entirely), so this also exercises the self-heal path on
    // first use.
    expect(row1.values[idColumnId]).toBe(1);
    expect(row2.values[idColumnId]).toBe(2);

    // `ticket_number` column: created via the normal service create-path,
    // seeded from autoNumberStart: 100.
    expect(row1.values[ticketColumnId]).toBe(100);
    expect(row2.values[ticketColumnId]).toBe(101);
  });

  it('preserves auto-numbers and sequence counters across consecutive partial updates', async () => {
    const created = await datavaultRowsService.createRow(tableId, tenantId, {
      [statusColumnId]: 'new',
    });
    const autoNumbersBefore = {
      [idColumnId]: created.values[idColumnId],
      [ticketColumnId]: created.values[ticketColumnId],
    };
    const sequencesBefore = await db
      .select({
        columnId: datavaultNumberSequences.columnId,
        nextValue: datavaultNumberSequences.nextValue,
      })
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.tableId, tableId))
      .orderBy(datavaultNumberSequences.columnId);

    await datavaultRowsService.updateRow(created.row.id, tenantId, {
      [statusColumnId]: 'in progress',
    });
    await datavaultRowsService.updateRow(created.row.id, tenantId, {
      [statusColumnId]: 'complete',
    });

    const updated = await datavaultRowsService.getRow(created.row.id, tenantId);
    const sequencesAfter = await db
      .select({
        columnId: datavaultNumberSequences.columnId,
        nextValue: datavaultNumberSequences.nextValue,
      })
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.tableId, tableId))
      .orderBy(datavaultNumberSequences.columnId);

    expect(updated?.values[idColumnId]).toBe(autoNumbersBefore[idColumnId]);
    expect(updated?.values[ticketColumnId]).toBe(autoNumbersBefore[ticketColumnId]);
    expect(sequencesAfter).toEqual(sequencesBefore);
  });

  it('is atomic and prevents duplicate values under concurrent inserts', { timeout: 30000 }, async () => {
    const promises = Array(10)
      .fill(null)
      .map(() => datavaultRowsService.createRow(tableId, tenantId, {}, undefined));

    const rows = await Promise.all(promises);
    const numbers = rows.map((r) => r.values[idColumnId]);

    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(numbers.length);
  });

  it('self-heals when the counter row is missing', async () => {
    // Simulate a column whose counter row never got created (predates this
    // feature, or created via a path that skips it) by deleting it directly.
    await db.delete(datavaultNumberSequences).where(
      and(
        eq(datavaultNumberSequences.tenantId, tenantId),
        eq(datavaultNumberSequences.tableId, tableId),
        eq(datavaultNumberSequences.columnId, ticketColumnId)
      )
    );

    const [sequenceBefore] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, ticketColumnId));
    expect(sequenceBefore).toBeUndefined();

    // Generation must recreate the counter row seeded from autoNumberStart
    // (100) rather than throwing or colliding with previously-issued values.
    const row = await datavaultRowsService.createRow(tableId, tenantId, {}, undefined);
    expect(row.values[ticketColumnId]).toBe(100);

    const [sequenceAfter] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, ticketColumnId));
    expect(sequenceAfter).toBeDefined();
    expect(sequenceAfter?.nextValue).toBe(101);
  });

  it('removes the counter row via CASCADE when the auto_number column is deleted', async () => {
    const column = await datavaultColumnsService.createColumn(
      {
        tableId,
        name: 'Temp Auto Number',
        slug: 'temp_auto_number',
        type: 'auto_number',
        required: false,
        autoNumberStart: 1,
      },
      tenantId
    );

    const [sequenceBefore] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, column.id));
    expect(sequenceBefore).toBeDefined();

    await datavaultColumnsService.deleteColumn(column.id, tenantId);

    const [sequenceAfter] = await db
      .select()
      .from(datavaultNumberSequences)
      .where(eq(datavaultNumberSequences.columnId, column.id));
    expect(sequenceAfter).toBeUndefined();
  });
});
