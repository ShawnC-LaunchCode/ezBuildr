import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { DatavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
// RLS-5: fixture writes and verification reads are the OBSERVER, not the
// application under test — see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';

describe('DataVault Unique Keys & Concurrency (DVH-2)', () => {
  let ctx: IntegrationTestContext;
  let ownerToken: string;
  let userId: string;
  let tableId: string;
  let uniqueColumnId: string;
  let uniqueColumnName: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DVH-2 Unique Keys' });
    const owner = await createTestUser(ctx, 'owner');
    ownerToken = owner.token;
    userId = ctx.userId;

    // Create a table for uniqueness testing
    const tableResponse = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'DVH-2 Uniqueness Table' });
    expect(tableResponse.status).toBe(201);
    tableId = tableResponse.body.id as string;

    // Create unique column
    uniqueColumnName = 'Employee ID';
    const uniqueColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: uniqueColumnName, type: 'text', isUnique: true });
    expect(uniqueColRes.status).toBe(201);
    uniqueColumnId = uniqueColRes.body.id as string;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('Criterion 1: The part-1 sequence is rejected (archive unique row, create duplicate row, unarchive first -> 409 with DV-4 message and row stays archived)', async () => {
    // 1. Create first row with unique value 'EMP-001'
    const row1Res = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-001' } });
    expect(row1Res.status).toBe(201);
    const row1Id = row1Res.body.row.id as string;

    // 2. Archive row 1
    const archiveRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row1Id}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveRes.status).toBe(200);

    // 3. Create second row with same unique value 'EMP-001' (allowed because row 1 is archived)
    const row2Res = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-001' } });
    expect(row2Res.status).toBe(201);

    // 4. Try to unarchive row 1 -> MUST be rejected with 409 and DV-4 readable message
    const unarchiveRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row1Id}/unarchive`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(unarchiveRes.status).toBe(409);
    expect(unarchiveRes.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);

    // Verify row 1 remains archived in the database
    const [row1InDb] = await getOwnerDb()
      .select({ deletedAt: schema.datavaultRows.deletedAt })
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.id, row1Id));
    expect(row1InDb?.deletedAt).not.toBeNull();
  });

  it('Criterion 2: Bulk unarchive containing a conflicting row does not silently restore it and leaves no duplicate live', async () => {
    const valA = 'EMP-BULK-A';
    const valB = 'EMP-BULK-B';

    // Create and archive row A
    const rowARes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: valA } });
    const rowAId = rowARes.body.row.id as string;
    await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowAId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Create and archive row B
    const rowBRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: valB } });
    const rowBId = rowBRes.body.row.id as string;
    await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowBId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Create a live row occupying valA
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: valA } });

    // Bulk unarchive [rowAId, rowBId] -> must fail with 409 because rowA collides
    const bulkUnarchiveRes = await request(ctx.baseURL)
      .patch('/api/datavault/rows/bulk/unarchive')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rowIds: [rowAId, rowBId] });
    expect(bulkUnarchiveRes.status).toBe(409);
    expect(bulkUnarchiveRes.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);

    // Verify row A is not restored live
    const [rowAInDb] = await getOwnerDb()
      .select({ deletedAt: schema.datavaultRows.deletedAt })
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.id, rowAId));
    expect(rowAInDb?.deletedAt).not.toBeNull();

    // Verify row B is ALSO not restored live (whole-batch all-or-nothing rollback)
    const [rowBInDb] = await getOwnerDb()
      .select({ deletedAt: schema.datavaultRows.deletedAt })
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.id, rowBId));
    expect(rowBInDb?.deletedAt).not.toBeNull();

    // Verify no keys were added for rowB
    const keysB = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE row_id = ${rowBId}::uuid
    `);
    expect(keysB.rows.length).toBe(0);
  });

  it('Criterion 3: Unarchiving a row whose unique value is still free succeeds and restores its unique keys', async () => {
    const val = 'EMP-CLEAN-001';
    const rowRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });
    expect(rowRes.status).toBe(201);
    const rowId = rowRes.body.row.id as string;

    // Archive row -> 200, keys removed
    const archiveRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveRes.status).toBe(200);

    const keysArchived = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE row_id = ${rowId}::uuid
    `);
    expect(keysArchived.rows.length).toBe(0);

    // Unarchive row -> 200, row active again
    const unarchiveRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/unarchive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unarchiveRes.status).toBe(200);

    const [rowInDb] = await getOwnerDb()
      .select({ deletedAt: schema.datavaultRows.deletedAt })
      .from(schema.datavaultRows)
      .where(eq(schema.datavaultRows.id, rowId));
    expect(rowInDb?.deletedAt).toBeNull();

    // Verify key in datavault_unique_keys is restored
    const keysRestored = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE row_id = ${rowId}::uuid AND column_id = ${uniqueColumnId}::uuid
    `);
    expect(keysRestored.rows.length).toBe(1);
  });

  it('Criterion 4: Two concurrent row creates with the same unique value produce exactly one row; loser gets 409, not 500', async () => {
    const raceVal = 'EMP-RACE-HTTP-001';

    // Concurrently fire two row creation requests through the app
    const [res1, res2] = await Promise.all([
      request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/rows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ values: { [uniqueColumnId]: raceVal } }),
      request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/rows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ values: { [uniqueColumnId]: raceVal } }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must be 201 (winner) and one must be 409 (loser, NOT 500)
    expect(statuses).toEqual([201, 409]);

    const loser = res1.status === 409 ? res1 : res2;
    expect(loser.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);

    // Verify exactly one active row exists in the database
    const matchingRows = await getOwnerDb()
      .select({ id: schema.datavaultValues.rowId })
      .from(schema.datavaultValues)
      .innerJoin(schema.datavaultRows, eq(schema.datavaultValues.rowId, schema.datavaultRows.id))
      .where(
        and(
          eq(schema.datavaultValues.columnId, uniqueColumnId),
          eq(schema.datavaultValues.value, raceVal),
          isNull(schema.datavaultRows.deletedAt)
        )
      );
    expect(matchingRows.length).toBe(1);
  });

  it('Criterion 11: Real concurrency proof via separate pg.Client instances and distinct backend PIDs', async () => {
    const currentSchemaResult = await db.execute(sql`SELECT current_schema() AS schema_name`);
    const schemaName = (currentSchemaResult.rows[0] as { schema_name: string }).schema_name;

    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeDefined();

    // Connect Client 1
    const client1 = new Client({ connectionString: databaseUrl });
    await client1.connect();
    await client1.query(`SET search_path TO ${schemaName}, public`);
    const pid1Result = await client1.query('SELECT pg_backend_pid() AS pid');
    const pid1 = pid1Result.rows[0].pid;

    // Connect Client 2
    const client2 = new Client({ connectionString: databaseUrl });
    await client2.connect();
    await client2.query(`SET search_path TO ${schemaName}, public`);
    const pid2Result = await client2.query('SELECT pg_backend_pid() AS pid');
    const pid2 = pid2Result.rows[0].pid;

    // Assert genuine physical concurrency: two distinct PostgreSQL server backends
    expect(pid1).toBeDefined();
    expect(pid2).toBeDefined();
    expect(pid1).not.toBe(pid2);

    try {
      const db1 = drizzle(client1, { schema });
      const db2 = drizzle(client2, { schema });

      const repo1 = new DatavaultRowsRepository(db1 as unknown as typeof db);
      const repo2 = new DatavaultRowsRepository(db2 as unknown as typeof db);

      const raceUniqueVal = 'EMP-RACE-CLIENTS-001';

      // Race both inserts concurrently
      // These are raw clients, so nothing has opened a tenant-scoped
      // transaction for them the way `withCurrentTenant` does for the app.
      // Under a non-owner role both inserts would fail the WITH CHECK on
      // `datavault_rows`/`datavault_values`/`datavault_unique_keys` and the
      // race would prove nothing — zero winners rather than one. Pin the GUC
      // transaction-locally, exactly as the application does, so the only
      // thing deciding this race is still the unique constraint.
      const pinTenant = (tx: { execute: (q: SQL) => Promise<unknown> }) =>
        tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`);

      const racePromises = [
        db1.transaction(async (tx1) => {
          await pinTenant(tx1);
          return repo1.createRowWithValues(
            { tableId, createdBy: userId, updatedBy: userId },
            [{ columnId: uniqueColumnId, value: raceUniqueVal }],
            tx1
          );
        }),
        db2.transaction(async (tx2) => {
          await pinTenant(tx2);
          return repo2.createRowWithValues(
            { tableId, createdBy: userId, updatedBy: userId },
            [{ columnId: uniqueColumnId, value: raceUniqueVal }],
            tx2
          );
        }),
      ];

      const results = await Promise.allSettled(racePromises);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly one transaction must succeed and exactly one must fail with 23505
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedError = rejected[0].reason;
      const errorStr = JSON.stringify(rejectedError) + (rejectedError instanceof Error ? rejectedError.message : '');

      expect(
        errorStr.includes('23505') ||
        errorStr.includes('datavault_unique_keys_column_value_unique') ||
        ((rejectedError as { cause?: { code?: string } })?.cause?.code === '23505')
      ).toBe(true);
    } finally {
      await client1.end();
      await client2.end();
    }
  });

  it('Criterion 5: No raw Postgres constraint text reaches the client on any path (response body assertion)', async () => {
    const val = 'EMP-CRIT5-001';

    // 1. Initial create
    const create1 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });
    expect(create1.status).toBe(201);
    const row1Id = create1.body.row.id as string;

    // 2. Duplicate create via POST
    const createDup = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });

    expect(createDup.status).toBe(409);
    expect(createDup.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);
    // Assert response body contains zero Postgres internal details
    const createBodyStr = JSON.stringify(createDup.body);
    expect(createBodyStr).not.toContain('23505');
    expect(createBodyStr).not.toContain('datavault_unique_keys');
    expect(createBodyStr).not.toContain('violates unique constraint');
    expect(createBodyStr).not.toContain('duplicate key value');

    // 3. Duplicate update via PATCH
    const targetRow = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-CRIT5-002' } });
    expect(targetRow.status).toBe(201);
    const row2Id = targetRow.body.row.id as string;

    const patchDup = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });

    expect(patchDup.status).toBe(409);
    expect(patchDup.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);
    const patchBodyStr = JSON.stringify(patchDup.body);
    expect(patchBodyStr).not.toContain('23505');
    expect(patchBodyStr).not.toContain('datavault_unique_keys');
    expect(patchBodyStr).not.toContain('violates unique constraint');
    expect(patchBodyStr).not.toContain('duplicate key value');

    // 4. Duplicate via unarchive
    await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row1Id}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Create new row with row1's val
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });

    const unarchiveDup = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row1Id}/unarchive`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(unarchiveDup.status).toBe(409);
    expect(unarchiveDup.body.message).toContain(`A row with this column '${uniqueColumnName}' already exists`);
    const unarchiveBodyStr = JSON.stringify(unarchiveDup.body);
    expect(unarchiveBodyStr).not.toContain('23505');
    expect(unarchiveBodyStr).not.toContain('datavault_unique_keys');
    expect(unarchiveBodyStr).not.toContain('violates unique constraint');
    expect(unarchiveBodyStr).not.toContain('duplicate key value');
  });

  it('Criterion 6: Archived rows still do not participate in uniqueness (DV-4 guarantee)', async () => {
    const val = 'EMP-CRIT6-001';
    const rowRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });
    expect(rowRes.status).toBe(201);
    const rowId = rowRes.body.row.id as string;

    // Archive the row
    const archiveRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveRes.status).toBe(200);

    // Value held only by archived row does NOT block a new row
    const newRowRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: val } });
    expect(newRowRes.status).toBe(201);
  });

  it('Criterion 7: Turning isUnique ON for a column with existing duplicates fails with readable error and leaves no partial keys behind', async () => {
    // 1. Create a non-unique column
    const colRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Duplicate Dept', type: 'text', isUnique: false });
    expect(colRes.status).toBe(201);
    const dupColId = colRes.body.id as string;

    // 2. Insert two rows with duplicate values for this column
    const row1 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-C7-1', [dupColId]: 'DEPT-SHARED' } });
    expect(row1.status).toBe(201);

    const row2 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-C7-2', [dupColId]: 'DEPT-SHARED' } });
    expect(row2.status).toBe(201);

    // 3. Attempt to turn isUnique ON -> must fail with readable 400 error
    const updateColRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${dupColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isUnique: true });

    expect(updateColRes.status).toBe(400);
    expect(updateColRes.body.message).toContain('duplicate values');

    // 4. Verify no partial keys were inserted into datavault_unique_keys
    const keysInDb = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${dupColId}::uuid
    `);
    expect(keysInDb.rows.length).toBe(0);
  });

  it('Criterion 8: Turning isUnique OFF allows duplicates; turning it back ON with duplicates present fails per Criterion 7', async () => {
    // 1. Create unique column
    const colRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Toggle Column', type: 'text', isUnique: true });
    expect(colRes.status).toBe(201);
    const toggleColId = colRes.body.id as string;

    // 2. Create row with value 'VAL-TOGGLE-1'
    const row1 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-C8-1', [toggleColId]: 'VAL-TOGGLE-1' } });
    expect(row1.status).toBe(201);

    // Duplicate create is rejected while isUnique is true
    const dupTry = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-C8-2', [toggleColId]: 'VAL-TOGGLE-1' } });
    expect(dupTry.status).toBe(409);

    // 3. Turn isUnique OFF
    const turnOffRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${toggleColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isUnique: false });
    expect(turnOffRes.status).toBe(200);

    // Keys for this column should be deleted
    const keysAfterOff = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${toggleColId}::uuid
    `);
    expect(keysAfterOff.rows.length).toBe(0);

    // 4. Create duplicate row now succeeds (duplicates allowed)
    const row2 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-C8-3', [toggleColId]: 'VAL-TOGGLE-1' } });
    expect(row2.status).toBe(201);

    // 5. Turning isUnique back ON with duplicates present fails
    const turnOnRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${toggleColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isUnique: true });
    expect(turnOnRes.status).toBe(400);
    expect(turnOnRes.body.message).toContain('duplicate values');
  });

  it('Criterion 9: Hard-deleting a row, and deleting a column, remove their keys (cascade verified)', async () => {
    // Part A: Hard-deleting a row removes its keys
    const rowRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-DEL-ROW-1' } });
    expect(rowRes.status).toBe(201);
    const rowId = rowRes.body.row.id as string;

    const keysBeforeRowDelete = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE row_id = ${rowId}::uuid
    `);
    expect(keysBeforeRowDelete.rows.length).toBeGreaterThan(0);

    // Hard-delete row
    const delRowRes = await request(ctx.baseURL)
      .delete(`/api/datavault/rows/${rowId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(delRowRes.status).toBe(204);

    const keysAfterRowDelete = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE row_id = ${rowId}::uuid
    `);
    expect(keysAfterRowDelete.rows.length).toBe(0);

    // Part B: Deleting a column removes all its keys
    const colRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Column To Delete', type: 'text', isUnique: true });
    expect(colRes.status).toBe(201);
    const colId = colRes.body.id as string;

    const rowForColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'EMP-DEL-COL-1', [colId]: 'COL-DEL-VAL' } });
    expect(rowForColRes.status).toBe(201);

    const keysBeforeColDelete = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${colId}::uuid
    `);
    expect(keysBeforeColDelete.rows.length).toBe(1);

    // Delete column
    const delColRes = await request(ctx.baseURL)
      .delete(`/api/datavault/columns/${colId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(delColRes.status).toBe(204);

    const keysAfterColDelete = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${colId}::uuid
    `);
    expect(keysAfterColDelete.rows.length).toBe(0);
  });

  it('Primary Key: turning isPrimaryKey ON validates duplicates and backfills keys; turning isUnique OFF on PK is rejected; demoting PK cleans up keys', async () => {
    // 1. Create a dedicated table for primary key testing
    const pkTableRes = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'DVH-2 PK Table' });
    expect(pkTableRes.status).toBe(201);
    const pkTableId = pkTableRes.body.id as string;

    // 2. Create a non-unique column first (so table has 2 columns)
    const colRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${pkTableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'PK Candidate', type: 'text', isUnique: false });
    expect(colRes.status).toBe(201);
    const pkColId = colRes.body.id as string;

    // Get default PK column and unset it so we can test designating PK candidate column as PK
    const colsRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${pkTableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(colsRes.status).toBe(200);
    const defaultPkCol = colsRes.body.find((c: { isPrimaryKey?: boolean }) => c.isPrimaryKey);
    if (defaultPkCol) {
      const unsetRes = await request(ctx.baseURL)
        .patch(`/api/datavault/columns/${defaultPkCol.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isPrimaryKey: false });
      expect(unsetRes.status).toBe(200);
    }

    // 3. Insert duplicate values
    const row1 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${pkTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [pkColId]: 'DUP-PK' } });
    expect(row1.status).toBe(201);

    const row2 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${pkTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [pkColId]: 'DUP-PK' } });
    expect(row2.status).toBe(201);
    const row2Id = row2.body.row.id as string;

    // 4. Turning isPrimaryKey ON with existing duplicates must fail with 400
    const setPkWithDupRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${pkColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isPrimaryKey: true });
    expect(setPkWithDupRes.status).toBe(400);
    expect(setPkWithDupRes.body.message).toContain('duplicate values');

    // Verify 0 keys were backfilled
    const keysAfterFailedPk = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${pkColId}::uuid
    `);
    expect(keysAfterFailedPk.rows.length).toBe(0);

    // 5. Fix the duplicate by changing row2's value
    const fixDupRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${row2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [pkColId]: 'CLEAN-PK-2' } });
    expect(fixDupRes.status).toBe(204);

    // 6. Turning isPrimaryKey ON on clean data succeeds and backfills keys
    const setPkCleanRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${pkColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isPrimaryKey: true });
    expect(setPkCleanRes.status).toBe(200);
    expect(setPkCleanRes.body.isPrimaryKey).toBe(true);
    expect(setPkCleanRes.body.isUnique).toBe(true);

    const keysAfterPkOn = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${pkColId}::uuid
    `);
    expect(keysAfterPkOn.rows.length).toBe(2);

    // 7. Creating a duplicate for this new PK column fails with 409
    const dupPkCreate = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${pkTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [pkColId]: 'DUP-PK' } });
    expect(dupPkCreate.status).toBe(409);

    // 8. Trying to turn isUnique: false on this PK column without demoting PK fails with 400
    const turnUniqueOffOnPkRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${pkColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isUnique: false });
    expect(turnUniqueOffOnPkRes.status).toBe(400);
    expect(turnUniqueOffOnPkRes.body.message).toContain('primary key column must be unique');

    // 9. Demoting PK with { isPrimaryKey: false, isUnique: false } removes keys and allows duplicates
    const demotePkRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${pkColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ isPrimaryKey: false, isUnique: false });
    expect(demotePkRes.status).toBe(200);
    expect(demotePkRes.body.isPrimaryKey).toBe(false);
    expect(demotePkRes.body.isUnique).toBe(false);

    const keysAfterDemote = await getOwnerDb().execute(sql`
      SELECT * FROM datavault_unique_keys WHERE column_id = ${pkColId}::uuid
    `);
    expect(keysAfterDemote.rows.length).toBe(0);

    // Now duplicate creation succeeds
    const dupAllowedRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${pkTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [pkColId]: 'DUP-PK' } });
    expect(dupAllowedRes.status).toBe(201);
  });
});
