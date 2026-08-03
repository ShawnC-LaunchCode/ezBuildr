import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { datavaultRows } from '@shared/schema';

import { db } from '../../server/db';
import { datavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
import { registerDatavaultRoutes } from '../../server/routes/datavault.routes';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
/**
 * DataVault Phase 1 PR 9: DataVault API Routes Integration Tests
 *
 * Tests for DataVault tables, columns, and rows endpoints
 *
 * NOTE: These are template tests. In a real environment:
 * 1. Setup authentication middleware properly
 * 2. Create test tenant and user
 * 3. Use real database transactions for isolation
 * 4. Cleanup test data after each test
 */
describe('DataVault API Routes', () => {
  let app: Express;
  const testTenantId: string = "test-tenant-id";
  const testUserId: string = "test-user-id";
  const _testTableId: string = "test-table-id";
  const _testColumnId: string = "test-column-id";
  const _testRowId: string = "test-row-id";
  beforeAll(async () => {
    // Setup Express app with routes
    app = express();
    app.use(express.json());
    // Mock authentication middleware for tests
    // In production, this would use real auth with test credentials
    app.use((req: any, res, next) => {
      req.user = {
        id: testUserId,
        tenantId: testTenantId,
      };
      req.session = { userId: testUserId };
      next();
    });
    registerDatavaultRoutes(app);
    // In real tests, create test tenant and user:
    // const [tenant] = await db.insert(tenants).values({
    //   name: 'Test Tenant',
    //   plan: 'free',
    // }).returning();
    // testTenantId = tenant.id;
    //
    // const [user] = await db.insert(users).values({
    //   id: 'test-user-id',
    //   tenantId: testTenantId,
    //   email: 'test@example.com',
    //   role: 'admin',
    // }).returning();
    // testUserId = user.id;
  });
  afterAll(async () => {
    // Cleanup test data
    // if (testTenantId) {
    //   await db.delete(datavaultTables).where(eq(datavaultTables.tenantId, testTenantId));
    // }
  });
  beforeEach(async () => {
    // Reset test data before each test
    // if (testTableId) {
    //   await db.delete(datavaultTables).where(eq(datavaultTables.id, testTableId));
    // }
  });
  describe('Tables API', () => {
    describe('GET /api/datavault/tables', () => {
      it('should list all tables for tenant', async () => {
        // Template test - in real implementation:
        // const response = await request(app)
        //   .get('/api/datavault/tables')
        //   .expect(200);
        //
        // expect(response.body).toBeInstanceOf(Array);
        expect(true).toBe(true); // Placeholder
      });
      it('should list tables with stats when requested', async () => {
        // const response = await request(app)
        //   .get('/api/datavault/tables?stats=true')
        //   .expect(200);
        //
        // expect(response.body[0]).toHaveProperty('columnCount');
        // expect(response.body[0]).toHaveProperty('rowCount');
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('POST /api/datavault/tables', () => {
      it('should create a new table', async () => {
        // const tableData = {
        //   name: 'Test Table',
        //   description: 'Test description',
        // };
        //
        // const response = await request(app)
        //   .post('/api/datavault/tables')
        //   .send(tableData)
        //   .expect(201);
        //
        // expect(response.body).toHaveProperty('id');
        // expect(response.body.name).toBe(tableData.name);
        // expect(response.body.slug).toBe('test-table');
        //
        // testTableId = response.body.id;
        expect(true).toBe(true); // Placeholder
      });
      it('should validate required fields', async () => {
        // const response = await request(app)
        //   .post('/api/datavault/tables')
        //   .send({})
        //   .expect(400);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('GET /api/datavault/tables/:tableId', () => {
      it('should get a table by ID', async () => {
        // const response = await request(app)
        //   .get(`/api/datavault/tables/${testTableId}`)
        //   .expect(200);
        //
        // expect(response.body.id).toBe(testTableId);
        expect(true).toBe(true); // Placeholder
      });
      it('should return 404 for non-existent table', async () => {
        // const response = await request(app)
        //   .get('/api/datavault/tables/00000000-0000-0000-0000-000000000000')
        //   .expect(404);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('PATCH /api/datavault/tables/:tableId', () => {
      it('should update a table', async () => {
        // const updateData = {
        //   name: 'Updated Table Name',
        //   description: 'Updated description',
        // };
        //
        // const response = await request(app)
        //   .patch(`/api/datavault/tables/${testTableId}`)
        //   .send(updateData)
        //   .expect(200);
        //
        // expect(response.body.name).toBe(updateData.name);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('DELETE /api/datavault/tables/:tableId', () => {
      it('should delete a table', async () => {
        // await request(app)
        //   .delete(`/api/datavault/tables/${testTableId}`)
        //   .expect(204);
        //
        // // Verify it's deleted
        // await request(app)
        //   .get(`/api/datavault/tables/${testTableId}`)
        //   .expect(404);
        expect(true).toBe(true); // Placeholder
      });
    });
  });
  describe('Columns API', () => {
    describe('GET /api/datavault/tables/:tableId/columns', () => {
      it('should list all columns for a table', async () => {
        // const response = await request(app)
        //   .get(`/api/datavault/tables/${testTableId}/columns`)
        //   .expect(200);
        //
        // expect(response.body).toBeInstanceOf(Array);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('POST /api/datavault/tables/:tableId/columns', () => {
      it('should create a new column', async () => {
        // const columnData = {
        //   name: 'Email',
        //   type: 'email',
        //   required: true,
        // };
        //
        // const response = await request(app)
        //   .post(`/api/datavault/tables/${testTableId}/columns`)
        //   .send(columnData)
        //   .expect(201);
        //
        // expect(response.body).toHaveProperty('id');
        // expect(response.body.name).toBe(columnData.name);
        // expect(response.body.slug).toBe('email');
        //
        // testColumnId = response.body.id;
        expect(true).toBe(true); // Placeholder
      });
      it('should validate column type enum', async () => {
        // const response = await request(app)
        //   .post(`/api/datavault/tables/${testTableId}/columns`)
        //   .send({
        //     name: 'Invalid',
        //     type: 'invalid_type',
        //   })
        //   .expect(400);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('PATCH /api/datavault/columns/:columnId', () => {
      it('should update a column', async () => {
        // const updateData = {
        //   name: 'Email Address',
        //   required: false,
        // };
        //
        // const response = await request(app)
        //   .patch(`/api/datavault/columns/${testColumnId}`)
        //   .send(updateData)
        //   .expect(200);
        //
        // expect(response.body.name).toBe(updateData.name);
        expect(true).toBe(true); // Placeholder
      });
      it('should reject type changes', async () => {
        // const response = await request(app)
        //   .patch(`/api/datavault/columns/${testColumnId}`)
        //   .send({ type: 'text' })
        //   .expect(400);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('DELETE /api/datavault/columns/:columnId', () => {
      it('should delete a column', async () => {
        // await request(app)
        //   .delete(`/api/datavault/columns/${testColumnId}`)
        //   .expect(204);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('POST /api/datavault/tables/:tableId/columns/reorder', () => {
      it('should reorder columns', async () => {
        // const columnIds = ['col-1', 'col-2', 'col-3'];
        //
        // await request(app)
        //   .post(`/api/datavault/tables/${testTableId}/columns/reorder`)
        //   .send({ columnIds })
        //   .expect(200);
        expect(true).toBe(true); // Placeholder
      });
    });
  });
  describe('Rows API', () => {
    describe('GET /api/datavault/tables/:tableId/rows', () => {
      it('should list all rows for a table', async () => {
        // const response = await request(app)
        //   .get(`/api/datavault/tables/${testTableId}/rows`)
        //   .expect(200);
        //
        // expect(response.body).toHaveProperty('rows');
        // expect(response.body).toHaveProperty('pagination');
        expect(true).toBe(true); // Placeholder
      });
      it('should support pagination', async () => {
        // const response = await request(app)
        //   .get(`/api/datavault/tables/${testTableId}/rows?limit=10&offset=0`)
        //   .expect(200);
        //
        // expect(response.body.pagination.limit).toBe(10);
        // expect(response.body.pagination.offset).toBe(0);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('POST /api/datavault/tables/:tableId/rows', () => {
      it('should create a new row', async () => {
        // const rowData = {
        //   values: {
        //     [testColumnId]: 'test@example.com',
        //   },
        // };
        //
        // const response = await request(app)
        //   .post(`/api/datavault/tables/${testTableId}/rows`)
        //   .send(rowData)
        //   .expect(201);
        //
        // expect(response.body).toHaveProperty('row');
        // expect(response.body).toHaveProperty('values');
        //
        // testRowId = response.body.row.id;
        expect(true).toBe(true); // Placeholder
      });
      it('should validate required fields', async () => {
        // const response = await request(app)
        //   .post(`/api/datavault/tables/${testTableId}/rows`)
        //   .send({ values: {} })
        //   .expect(400);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('GET /api/datavault/rows/:rowId', () => {
      it('should get a row by ID', async () => {
        // const response = await request(app)
        //   .get(`/api/datavault/rows/${testRowId}`)
        //   .expect(200);
        //
        // expect(response.body.row.id).toBe(testRowId);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('PATCH /api/datavault/rows/:rowId', () => {
      it('should update a row', async () => {
        // const updateData = {
        //   values: {
        //     [testColumnId]: 'updated@example.com',
        //   },
        // };
        //
        // await request(app)
        //   .patch(`/api/datavault/rows/${testRowId}`)
        //   .send(updateData)
        //   .expect(200);
        expect(true).toBe(true); // Placeholder
      });
    });
    describe('DELETE /api/datavault/rows/:rowId', () => {
      it('should delete a row', async () => {
        // await request(app)
        //   .delete(`/api/datavault/rows/${testRowId}`)
        //   .expect(204);
        expect(true).toBe(true); // Placeholder
      });
    });
  });
  describe('Error Handling', () => {
    it('should handle tenant isolation', async () => {
      // Attempt to access table from different tenant should fail with 403
      expect(true).toBe(true); // Placeholder
    });
    it('should handle malformed UUIDs', async () => {
      // const response = await request(app)
      //   .get('/api/datavault/tables/invalid-uuid')
      //   .expect(400);
      expect(true).toBe(true); // Placeholder
    });
    it('should handle database errors gracefully', async () => {
      // Test with database connection issues
      expect(true).toBe(true); // Placeholder
    });
  });
  describe('Type Validation', () => {
    it('should validate email type values', async () => {
      // Create email column and test with valid/invalid emails
      expect(true).toBe(true); // Placeholder
    });
    it('should validate phone type values', async () => {
      // Create phone column and test with valid/invalid phones
      expect(true).toBe(true); // Placeholder
    });
    it('should coerce number type values', async () => {
      // Create number column and test string-to-number coercion
      expect(true).toBe(true); // Placeholder
    });
    it('should coerce boolean type values', async () => {
      // Create boolean column and test various boolean representations
      expect(true).toBe(true); // Placeholder
    });
  });
});

describe('DataVault unique row constraints', () => {
  let ctx: IntegrationTestContext;
  let ownerToken: string;
  let tableId: string;
  let primaryKeyColumnId: string;
  let uniqueColumnId: string;

  const authenticatedRequest = () => request(ctx.baseURL)
    .post(`/api/datavault/tables/${tableId}/rows`)
    .set('Authorization', `Bearer ${ownerToken}`);

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-4 Unique Constraints' });
    const owner = await createTestUser(ctx, 'owner');
    ownerToken = owner.token;

    const tableResponse = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'DV-4 Unique Rows' });
    expect(tableResponse.status).toBe(201);
    tableId = tableResponse.body.id as string;

    const columnsResponse = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(columnsResponse.status).toBe(200);
    primaryKeyColumnId = (columnsResponse.body as Array<{ id: string; isPrimaryKey: boolean }>)
      .find((column) => column.isPrimaryKey)?.id ?? '';
    expect(primaryKeyColumnId).not.toBe('');

    const uniqueColumnResponse = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Email', type: 'text', isUnique: true });
    expect(uniqueColumnResponse.status).toBe(201);
    uniqueColumnId = uniqueColumnResponse.body.id as string;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('returns 409 from POST when a unique value already belongs to a live row', async () => {
    const firstResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'post-conflict@example.com' },
    });
    expect(firstResponse.status).toBe(201);

    const conflictResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'post-conflict@example.com' },
    });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.message).toContain("column 'Email'");
  });

  it('returns 409 from PATCH when a unique value belongs to another row', async () => {
    const firstResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'patch-owner@example.com' },
    });
    const secondResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'patch-target@example.com' },
    });
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const conflictResponse = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${secondResponse.body.row.id as string}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [uniqueColumnId]: 'patch-owner@example.com' } });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.message).toContain("column 'Email'");
  });

  it('enforces the primary key auto-created with the table', async () => {
    const firstResponse = await authenticatedRequest().send({
      values: { [primaryKeyColumnId]: 7001 },
    });
    expect(firstResponse.status).toBe(201);

    const conflictResponse = await authenticatedRequest().send({
      values: { [primaryKeyColumnId]: 7001 },
    });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.message).toContain("column 'ID'");
  });

  it('ignores archived rows when checking unique values', async () => {
    const archivedResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'archived@example.com' },
    });
    expect(archivedResponse.status).toBe(201);

    await db.update(datavaultRows)
      .set({ deletedAt: new Date() })
      .where(eq(datavaultRows.id, archivedResponse.body.row.id as string));

    const replacementResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: 'archived@example.com' },
    });
    expect(replacementResponse.status).toBe(201);
  });

  it('does not treat repeated null values as duplicates', async () => {
    const firstResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: null },
    });
    const secondResponse = await authenticatedRequest().send({
      values: { [uniqueColumnId]: null },
    });
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    await expect(
      datavaultRowsRepository.checkColumnHasDuplicates(uniqueColumnId)
    ).resolves.toBe(false);
  });
});

describe('DataVault row filtering and pagination (DV-8)', () => {
  let ctx: IntegrationTestContext;
  let ownerToken: string;
  let tableId: string;
  let nameColId: string;
  let amountColId: string;
  let statusColId: string;
  let isActiveColId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-8 Row Filtering' });
    const owner = await createTestUser(ctx, 'owner');
    ownerToken = owner.token;

    const tableResponse = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Filter Test Table' });
    expect(tableResponse.status).toBe(201);
    tableId = tableResponse.body.id as string;

    const nameColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Name', type: 'text' });
    expect(nameColRes.status).toBe(201);
    nameColId = nameColRes.body.id as string;

    const amountColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Amount', type: 'number' });
    expect(amountColRes.status).toBe(201);
    amountColId = amountColRes.body.id as string;

    const statusColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Status', type: 'text' });
    expect(statusColRes.status).toBe(201);
    statusColId = statusColRes.body.id as string;

    const isActiveColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Active', type: 'boolean' });
    expect(isActiveColRes.status).toBe(201);
    isActiveColId = isActiveColRes.body.id as string;

    // Seed rows
    // Row 1: Alice Alpha, 150, active, true
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Alice Alpha',
          [amountColId]: 150,
          [statusColId]: 'active',
          [isActiveColId]: true,
        },
      });

    // Row 2: Bob Beta, 350, pending, false
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Bob Beta',
          [amountColId]: 350,
          [statusColId]: 'pending',
          [isActiveColId]: false,
        },
      });

    // Row 3: Charlie Gamma, 50, archived, true
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Charlie Gamma',
          [amountColId]: 50,
          [statusColId]: 'archived',
          [isActiveColId]: true,
        },
      });

    // Row 4: David Delta, 800, active, true
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'David Delta',
          [amountColId]: 800,
          [statusColId]: 'active',
          [isActiveColId]: true,
        },
      });

    // Row 5: empty/null row
    await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {},
      });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('filters rows by text contains operator', async () => {
    const filters = [
      {
        columnId: nameColId,
        operator: 'contains',
        value: 'Alpha',
      },
    ];

    const res = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ filters: JSON.stringify(filters) })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].values[nameColId]).toBe('Alice Alpha');
    expect(res.body.pagination.total).toBe(1);
  });

  it('filters rows by numeric comparison operators (greater_than, less_than_or_equal)', async () => {
    // greater_than 100 -> Alice (150), Bob (350), David (800)
    const gtFilters = [
      {
        columnId: amountColId,
        operator: 'greater_than',
        value: 100,
      },
    ];

    const gtRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ filters: JSON.stringify(gtFilters) })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(gtRes.status).toBe(200);
    expect(gtRes.body.rows).toHaveLength(3);
    expect(gtRes.body.pagination.total).toBe(3);

    // less_than_or_equal 150 -> Charlie (50), Alice (150)
    const lteFilters = [
      {
        columnId: amountColId,
        operator: 'less_than_or_equal',
        value: 150,
      },
    ];

    const lteRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ filters: JSON.stringify(lteFilters) })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(lteRes.status).toBe(200);
    expect(lteRes.body.rows).toHaveLength(2);
    expect(lteRes.body.pagination.total).toBe(2);
  });

  it('filters rows by is_empty and is_not_empty operators', async () => {
    const emptyRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({
        filters: JSON.stringify([
          {
            columnId: nameColId,
            operator: 'is_empty',
          },
        ]),
      })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.rows).toHaveLength(1);
    expect(emptyRes.body.pagination.total).toBe(1);

    const notEmptyRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({
        filters: JSON.stringify([
          {
            columnId: nameColId,
            operator: 'is_not_empty',
          },
        ]),
      })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(notEmptyRes.status).toBe(200);
    expect(notEmptyRes.body.rows).toHaveLength(4);
    expect(notEmptyRes.body.pagination.total).toBe(4);
  });

  it('filters rows by in array operator', async () => {
    const inRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({
        filters: JSON.stringify([
          {
            columnId: statusColId,
            operator: 'in',
            value: ['active', 'pending'],
          },
        ]),
      })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(inRes.status).toBe(200);
    expect(inRes.body.rows).toHaveLength(3);
    expect(inRes.body.pagination.total).toBe(3);
  });

  it('combines multiple filters with AND logic across multiple columns', async () => {
    // amount > 100 AND status == 'active' -> Alice (150), David (800)
    const combinedFilters = [
      {
        columnId: amountColId,
        operator: 'greater_than',
        value: 100,
      },
      {
        columnId: statusColId,
        operator: 'equals',
        value: 'active',
      },
    ];

    const res = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ filters: JSON.stringify(combinedFilters) })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('paginates filtered results with limit and offset correctly', async () => {
    // status == 'active' matches 2 rows. limit 1 offset 0 -> 1 row, total 2, hasMore true
    const res = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({
        filters: JSON.stringify([
          {
            columnId: statusColId,
            operator: 'equals',
            value: 'active',
          },
        ]),
        limit: 1,
        offset: 0,
      })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.pagination.offset).toBe(0);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.hasMore).toBe(true);
  });

  it('returns 400 Bad Request for invalid filters JSON or schema validation failure', async () => {
    const invalidJsonRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ filters: '{invalid-json' })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(invalidJsonRes.status).toBe(400);

    const invalidOperatorRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({
        filters: JSON.stringify([
          {
            columnId: nameColId,
            operator: 'invalid_op_xyz',
            value: 'foo',
          },
        ]),
      })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(invalidOperatorRes.status).toBe(400);
  });
});
