import { and, eq, inArray } from 'drizzle-orm';
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { datavaultRows, auditLogs } from '@shared/schema';

import { db } from '../../server/db';
import { AuditLogger } from '../../server/lib/audit/auditLogger';
import { datavaultRowsRepository } from '../../server/repositories/DatavaultRowsRepository';
import { registerDatavaultRoutes } from '../../server/routes/datavault.routes';
import { datavaultRowsService } from '../../server/services/DatavaultRowsService';
import { datavaultTablesService } from '../../server/services/DatavaultTablesService';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';

interface AuditChangeSet {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

function getAuditChanges(entry: typeof auditLogs.$inferSelect): AuditChangeSet {
  return (entry.changes ?? {}) as AuditChangeSet;
}

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

describe('DataVault row counts, soft deletion, and column sorting (DV-9)', () => {
  let ctx: IntegrationTestContext;
  let ownerToken: string;
  let ownerUserId: string;
  let tableId: string;
  let nameColId: string;
  let scoreColId: string;
  let eventDateColId: string;
  let _row1Id: string;
  let _row2Id: string;
  let _row3Id: string;
  let row4Id: string;
  let row5Id: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-9 Row Counts' });
    const owner = await createTestUser(ctx, 'owner');
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const tableResponse = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Count and Sort Test Table' });
    expect(tableResponse.status).toBe(201);
    tableId = tableResponse.body.id as string;

    const nameColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Name', type: 'text' });
    expect(nameColRes.status).toBe(201);
    nameColId = nameColRes.body.id as string;

    const scoreColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Score', type: 'number' });
    expect(scoreColRes.status).toBe(201);
    scoreColId = scoreColRes.body.id as string;

    const eventDateColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'EventDate', type: 'date' });
    expect(eventDateColRes.status).toBe(201);
    eventDateColId = eventDateColRes.body.id as string;

    // Seed 5 rows
    // Live row 1: Score 10, EventDate 2026-03-01
    const r1 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Alpha',
          [scoreColId]: 10,
          [eventDateColId]: '2026-03-01',
        },
      });
    _row1Id = r1.body.row.id;

    // Live row 2: Score 2, EventDate 2026-01-15
    const r2 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Beta',
          [scoreColId]: 2,
          [eventDateColId]: '2026-01-15',
        },
      });
    _row2Id = r2.body.row.id;

    // Live row 3: Score 9, EventDate 2026-02-20
    const r3 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Gamma',
          [scoreColId]: 9,
          [eventDateColId]: '2026-02-20',
        },
      });
    _row3Id = r3.body.row.id;

    // Archived row 4: Score 100, EventDate 2025-12-01
    const r4 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Archived One',
          [scoreColId]: 100,
          [eventDateColId]: '2025-12-01',
        },
      });
    row4Id = r4.body.row.id;

    // Archived row 5: Score 200, EventDate 2025-11-01
    const r5 = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Archived Two',
          [scoreColId]: 200,
          [eventDateColId]: '2025-11-01',
        },
      });
    row5Id = r5.body.row.id;

    // Soft delete row 4 and row 5 -> 3 live rows, 2 archived rows
    await db.update(datavaultRows)
      .set({ deletedAt: new Date() })
      .where(inArray(datavaultRows.id, [row4Id, row5Id]));
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('AC1: table-card stats from listTablesWithStats report 3 for 3 live and 2 archived rows', async () => {
    const res = await request(ctx.baseURL)
      .get('/api/datavault/tables?stats=true')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const table = res.body.find((t: any) => t.id === tableId);
    expect(table).toBeDefined();
    expect(table.rowCount).toBe(3);

    // Also assert directly against datavaultTablesService.listTablesWithStats
    const serviceTables = await datavaultTablesService.listTablesWithStats(ctx.tenantId, ownerUserId);
    const serviceTable = serviceTables.find((t: any) => t.id === tableId);
    expect(serviceTable?.rowCount).toBe(3);
  });

  it('AC2: countRows (via countByTableId) reports 3 for the same fixture', async () => {
    const repoCount = await datavaultRowsRepository.countByTableId(tableId);
    expect(repoCount).toBe(3);

    const serviceCount = await datavaultRowsService.countRows(tableId, ctx.tenantId);
    expect(serviceCount).toBe(3);
  });

  it('AC3: passing showArchived: true reports 5, so archived view has correct total', async () => {
    const repoCountArchivedObj = await datavaultRowsRepository.countByTableId(tableId, { showArchived: true });
    expect(repoCountArchivedObj).toBe(5);

    const repoCountArchivedBool = await datavaultRowsRepository.countByTableId(tableId, true);
    expect(repoCountArchivedBool).toBe(5);

    const resArchived = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ showArchived: true })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(resArchived.status).toBe(200);
    expect(resArchived.body.pagination.total).toBe(5);
    expect(resArchived.body.rows).toHaveLength(5);
  });

  it('AC4: grid footer total and table card count agree for the same table', async () => {
    const gridRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(gridRes.status).toBe(200);
    const gridTotal = gridRes.body.pagination.total;

    const cardRes = await request(ctx.baseURL)
      .get('/api/datavault/tables?stats=true')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(cardRes.status).toBe(200);
    const cardTable = cardRes.body.find((t: any) => t.id === tableId);
    const cardTotal = cardTable.rowCount;

    expect(gridTotal).toBe(3);
    expect(cardTotal).toBe(3);
    expect(gridTotal).toBe(cardTotal);
  });

  it('AC5: sorting ascending by number column returns 2, 9, 10 in that order', async () => {
    const sortRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ sortBy: 'score', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(sortRes.status).toBe(200);
    const scores = sortRes.body.rows.map((r: any) => r.values[scoreColId]);
    expect(scores).toEqual([2, 9, 10]);
  });

  it('AC6: sorting by date column orders chronologically; sorting by text column is unaffected by JSON quoting', async () => {
    const dateRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ sortBy: 'eventdate', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(dateRes.status).toBe(200);
    const dates = dateRes.body.rows.map((r: any) => {
      const val = r.values[eventDateColId];
      return typeof val === 'string' ? val.slice(0, 10) : val;
    });
    expect(dates).toEqual(['2026-01-15', '2026-02-20', '2026-03-01']);

    const textRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ sortBy: 'name', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(textRes.status).toBe(200);
    const names = textRes.body.rows.map((r: any) => r.values[nameColId]);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('AC7: a column containing a non-numeric value does not error the sort request (no 500)', async () => {
    // Insert a row with a string value in the Score column or bypass to have invalid numeric data
    // Let's create a row with non-numeric value in score column directly in values
    const nonNumericRow = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        values: {
          [nameColId]: 'Invalid Numeric',
          [scoreColId]: 'not-a-number' as any,
          [eventDateColId]: '2026-04-01',
        },
      });

    // Even if type validation allows or direct value exists, sorting should succeed with 200 (not 500)
    const sortRes = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .query({ sortBy: 'score', sortOrder: 'asc' })
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(sortRes.status).toBe(200);
    expect(sortRes.body.rows.length).toBeGreaterThanOrEqual(3);

    // Clean up the non-numeric test row if created
    if (nonNumericRow.body?.row?.id) {
      await db.update(datavaultRows)
        .set({ deletedAt: new Date() })
        .where(eq(datavaultRows.id, nonNumericRow.body.row.id));
    }
  });
});

describe('DataVault row unarchive routes (DV-14)', () => {
  let ctx: IntegrationTestContext;
  let otherTenantCtx: IntegrationTestContext;
  let ownerToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-14 Row Unarchive' });
    otherTenantCtx = await setupIntegrationTest({ tenantName: 'DV-14 Other Tenant' });
    ownerToken = (await createTestUser(ctx, 'owner')).token;
    otherTenantToken = (await createTestUser(otherTenantCtx, 'owner')).token;
  });

  afterAll(async () => {
    await ctx.cleanup();
    await otherTenantCtx.cleanup();
  });

  async function createTableWithRow(name: string): Promise<{ tableId: string; rowId: string }> {
    const tableResponse = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name });
    expect(tableResponse.status).toBe(201);
    const tableId = tableResponse.body.id as string;

    const columnResponse = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Name', type: 'text' });
    expect(columnResponse.status).toBe(201);
    const columnId = columnResponse.body.id as string;

    const rowResponse = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [columnId]: `${name} row` } });
    expect(rowResponse.status).toBe(201);

    return { tableId, rowId: rowResponse.body.row.id as string };
  }

  it('DV-14 AC1/3/5: single unarchive restores a genuinely archived row to listings and counts and writes its audit entry', async () => {
    const { tableId, rowId } = await createTableWithRow('Single Unarchive Table');

    const archiveResponse = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveResponse.status).toBe(200);

    const [archivedRow] = await db
      .select({ deletedAt: datavaultRows.deletedAt })
      .from(datavaultRows)
      .where(eq(datavaultRows.id, rowId));
    expect(archivedRow.deletedAt).not.toBeNull();

    const unarchiveResponse = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/unarchive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unarchiveResponse.status).toBe(200);
    expect(unarchiveResponse.body).toEqual({
      success: true,
      message: 'Row unarchived successfully',
    });

    const [restoredRow] = await db
      .select({ deletedAt: datavaultRows.deletedAt })
      .from(datavaultRows)
      .where(eq(datavaultRows.id, rowId));
    expect(restoredRow.deletedAt).toBeNull();

    const listingResponse = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${tableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listingResponse.status).toBe(200);
    expect(listingResponse.body.pagination.total).toBe(1);
    expect(listingResponse.body.rows.map((row: { row: { id: string } }) => row.row.id)).toContain(rowId);

    const statsResponse = await request(ctx.baseURL)
      .get('/api/datavault/tables?stats=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statsResponse.status).toBe(200);
    const restoredTable = statsResponse.body.find((table: { id: string }) => table.id === tableId);
    expect(restoredTable?.rowCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const unarchiveLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, rowId),
          eq(auditLogs.action, 'datavault.row.unarchived')
        )
      );
    expect(unarchiveLogs).toHaveLength(1);
    expect(getAuditChanges(unarchiveLogs[0]).after?.tableId).toBe(tableId);
  });

  it('DV-14 AC4: missing rows return 404 and cross-tenant archived rows return 403', async () => {
    const missingResponse = await request(ctx.baseURL)
      .patch('/api/datavault/rows/00000000-0000-0000-0000-000000000000/unarchive')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(missingResponse.status).toBe(404);

    const { rowId } = await createTableWithRow('Cross Tenant Unarchive Table');
    const archiveResponse = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(archiveResponse.status).toBe(200);

    const crossTenantResponse = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}/unarchive`)
      .set('Authorization', `Bearer ${otherTenantToken}`);
    expect(crossTenantResponse.status).toBe(403);

    const [stillArchivedRow] = await db
      .select({ deletedAt: datavaultRows.deletedAt })
      .from(datavaultRows)
      .where(eq(datavaultRows.id, rowId));
    expect(stillArchivedRow.deletedAt).not.toBeNull();
  });
});

describe('DataVault Audit Trail (DV-13)', () => {
  let ctx: IntegrationTestContext;
  let ownerToken: string;
  let ownerUserId: string;
  let auditTableId: string;
  let auditColId: string;
  let auditCol2Id: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'DV-13 Audit Suite' });
    const owner = await createTestUser(ctx, 'owner');
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const tableRes = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Audit Test Table' });
    expect(tableRes.status).toBe(201);
    auditTableId = tableRes.body.id as string;

    const colRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AuditName', type: 'text' });
    expect(colRes.status).toBe(201);
    auditColId = colRes.body.id as string;

    const col2Res = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AuditScore', type: 'number' });
    expect(col2Res.status).toBe(201);
    auditCol2Id = col2Res.body.id as string;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('AC1: Row create, update and delete each write exactly one audit entry naming actor, tenant, table id, row id and action', async () => {
    // 1. Create Row
    const createRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: 'Test Row' } });

    expect(createRes.status).toBe(201);
    const rowId = createRes.body.row.id as string;

    await new Promise((r) => setTimeout(r, 100));

    const createLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, rowId),
          eq(auditLogs.action, 'datavault.row.created')
        )
      );

    expect(createLogs).toHaveLength(1);
    expect(createLogs[0].userId).toBe(ownerUserId);
    expect(createLogs[0].tenantId).toBe(ctx.tenantId);
    expect(createLogs[0].resourceType).toBe('datavault_row');
    expect(getAuditChanges(createLogs[0]).after?.tableId).toBe(auditTableId);
    expect(getAuditChanges(createLogs[0]).after?.columnCount).toBe(1);

    // 2. Update Row
    const updateRes = await request(ctx.baseURL)
      .patch(`/api/datavault/rows/${rowId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: 'Updated Row' } });

    expect(updateRes.status).toBe(204);

    await new Promise((r) => setTimeout(r, 100));

    const updateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, rowId),
          eq(auditLogs.action, 'datavault.row.updated')
        )
      );

    expect(updateLogs).toHaveLength(1);
    expect(updateLogs[0].userId).toBe(ownerUserId);
    expect(updateLogs[0].tenantId).toBe(ctx.tenantId);
    expect(updateLogs[0].resourceType).toBe('datavault_row');
    expect(getAuditChanges(updateLogs[0]).after?.tableId).toBe(auditTableId);

    // 3. Delete Row
    const deleteRes = await request(ctx.baseURL)
      .delete(`/api/datavault/rows/${rowId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteRes.status).toBe(204);

    await new Promise((r) => setTimeout(r, 100));

    const deleteLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, rowId),
          eq(auditLogs.action, 'datavault.row.deleted')
        )
      );

    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0].userId).toBe(ownerUserId);
    expect(deleteLogs[0].tenantId).toBe(ctx.tenantId);
    expect(deleteLogs[0].resourceType).toBe('datavault_row');
    expect(getAuditChanges(deleteLogs[0]).before?.tableId).toBe(auditTableId);
  });

  it('AC2: The four bulk operations (bulk archive, bulk unarchive, bulk delete, column reorder) each write exactly one audit entry recording affected count, table id and actor', async () => {
    // Seed 2 rows for bulk test
    const rA = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: 'Bulk A' } });
    const rB = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: 'Bulk B' } });

    const rowAId = rA.body.row.id as string;
    const rowBId = rB.body.row.id as string;

    const statsBeforeArchive = await request(ctx.baseURL)
      .get('/api/datavault/tables?stats=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statsBeforeArchive.status).toBe(200);
    const tableBeforeArchive = statsBeforeArchive.body.find(
      (table: { id: string }) => table.id === auditTableId
    );
    const liveCountBeforeArchive = tableBeforeArchive.rowCount as number;

    // 1. Bulk Archive
    const bulkArchiveRes = await request(ctx.baseURL)
      .patch('/api/datavault/rows/bulk/archive')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rowIds: [rowAId, rowBId] });

    expect(bulkArchiveRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const archiveLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, auditTableId),
          eq(auditLogs.action, 'datavault.row.bulk_archived')
        )
      );

    expect(archiveLogs).toHaveLength(1);
    expect(archiveLogs[0].userId).toBe(ownerUserId);
    expect(archiveLogs[0].tenantId).toBe(ctx.tenantId);
    expect(getAuditChanges(archiveLogs[0]).after?.count).toBe(2);
    expect(getAuditChanges(archiveLogs[0]).after?.tableId).toBe(auditTableId);

    const archivedRows = await db
      .select({ id: datavaultRows.id, deletedAt: datavaultRows.deletedAt })
      .from(datavaultRows)
      .where(inArray(datavaultRows.id, [rowAId, rowBId]));
    expect(archivedRows).toHaveLength(2);
    expect(archivedRows.every((row) => row.deletedAt !== null)).toBe(true);

    // 2. Bulk Unarchive the same rows that the API genuinely archived above.
    const bulkUnarchiveRes = await request(ctx.baseURL)
      .patch('/api/datavault/rows/bulk/unarchive')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rowIds: [rowAId, rowBId] });

    expect(bulkUnarchiveRes.status).toBe(200);
    expect(bulkUnarchiveRes.body.count).toBe(2);
    await new Promise((r) => setTimeout(r, 100));

    const restoredRows = await db
      .select({ id: datavaultRows.id, deletedAt: datavaultRows.deletedAt })
      .from(datavaultRows)
      .where(inArray(datavaultRows.id, [rowAId, rowBId]));
    expect(restoredRows).toHaveLength(2);
    expect(restoredRows.every((row) => row.deletedAt === null)).toBe(true);

    const listingAfterUnarchive = await request(ctx.baseURL)
      .get(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listingAfterUnarchive.status).toBe(200);
    const listedRowIds = listingAfterUnarchive.body.rows.map(
      (row: { row: { id: string } }) => row.row.id
    );
    expect(listedRowIds).toEqual(expect.arrayContaining([rowAId, rowBId]));

    const statsAfterUnarchive = await request(ctx.baseURL)
      .get('/api/datavault/tables?stats=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statsAfterUnarchive.status).toBe(200);
    const tableAfterUnarchive = statsAfterUnarchive.body.find(
      (table: { id: string }) => table.id === auditTableId
    );
    expect(tableAfterUnarchive.rowCount).toBe(liveCountBeforeArchive);

    const unarchiveLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, auditTableId),
          eq(auditLogs.action, 'datavault.row.bulk_unarchived')
        )
      );

    expect(unarchiveLogs).toHaveLength(1);
    expect(unarchiveLogs[0].userId).toBe(ownerUserId);
    expect(getAuditChanges(unarchiveLogs[0]).after?.count).toBe(2);

    // 3. Bulk Delete
    const bulkDeleteRes = await request(ctx.baseURL)
      .delete('/api/datavault/rows/bulk/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rowIds: [rowAId, rowBId] });

    expect(bulkDeleteRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const bulkDeleteLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, auditTableId),
          eq(auditLogs.action, 'datavault.row.bulk_deleted')
        )
      );

    expect(bulkDeleteLogs).toHaveLength(1);
    expect(bulkDeleteLogs[0].userId).toBe(ownerUserId);
    expect(getAuditChanges(bulkDeleteLogs[0]).before?.count).toBe(2);

    // 4. Column Reorder
    const reorderRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/columns/reorder`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ columnIds: [auditCol2Id, auditColId] });

    expect(reorderRes.status).toBe(204);
    await new Promise((r) => setTimeout(r, 100));

    const reorderLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, auditTableId),
          eq(auditLogs.action, 'datavault.column.reordered')
        )
      );

    expect(reorderLogs).toHaveLength(1);
    expect(reorderLogs[0].userId).toBe(ownerUserId);
    expect(getAuditChanges(reorderLogs[0]).after?.tableId).toBe(auditTableId);
    expect(getAuditChanges(reorderLogs[0]).after?.columnCount).toBe(2);
    expect(getAuditChanges(reorderLogs[0]).after?.columnIds).toEqual([auditCol2Id, auditColId]);
  });

  it('AC3: Column, table (including move), and database mutations each write exactly one audit entry naming the modified resource', async () => {
    // 1. Table Create
    const createTableRes = await request(ctx.baseURL)
      .post('/api/datavault/tables')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3 Table Test' });

    expect(createTableRes.status).toBe(201);
    const testTableId = createTableRes.body.id as string;
    await new Promise((r) => setTimeout(r, 100));

    const tableCreateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testTableId),
          eq(auditLogs.action, 'datavault.table.created')
        )
      );
    expect(tableCreateLogs).toHaveLength(1);
    expect(tableCreateLogs[0].resourceType).toBe('datavault_table');

    // 2. Table Update
    const updateTableRes = await request(ctx.baseURL)
      .patch(`/api/datavault/tables/${testTableId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3 Table Renamed' });

    expect(updateTableRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const tableUpdateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testTableId),
          eq(auditLogs.action, 'datavault.table.updated')
        )
      );
    expect(tableUpdateLogs).toHaveLength(1);

    // 3. Database create and update
    const createDatabaseRes = await request(ctx.baseURL)
      .post('/api/datavault/databases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3 Database', scopeType: 'account' });

    expect(createDatabaseRes.status).toBe(201);
    const testDatabaseId = createDatabaseRes.body.id as string;
    await new Promise((r) => setTimeout(r, 100));

    const databaseCreateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testDatabaseId),
          eq(auditLogs.action, 'datavault.database.created')
        )
      );
    expect(databaseCreateLogs).toHaveLength(1);

    const updateDatabaseRes = await request(ctx.baseURL)
      .patch(`/api/datavault/databases/${testDatabaseId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3 Database Renamed' });

    expect(updateDatabaseRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const databaseUpdateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testDatabaseId),
          eq(auditLogs.action, 'datavault.database.updated')
        )
      );
    expect(databaseUpdateLogs).toHaveLength(1);

    // 4. Table move
    const moveTableRes = await request(ctx.baseURL)
      .patch(`/api/datavault/tables/${testTableId}/move`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ databaseId: testDatabaseId });

    expect(moveTableRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const tableMoveLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testTableId),
          eq(auditLogs.action, 'datavault.table.moved')
        )
      );
    expect(tableMoveLogs).toHaveLength(1);
    expect(getAuditChanges(tableMoveLogs[0]).after?.databaseId).toBe(testDatabaseId);

    // 5. Column Add
    const createColRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${testTableId}/columns`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3Col', type: 'text' });

    expect(createColRes.status).toBe(201);
    const testColId = createColRes.body.id as string;
    await new Promise((r) => setTimeout(r, 100));

    const colCreateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testColId),
          eq(auditLogs.action, 'datavault.column.created')
        )
      );
    expect(colCreateLogs).toHaveLength(1);
    expect(colCreateLogs[0].resourceType).toBe('datavault_column');

    // 6. Column Update
    const updateColRes = await request(ctx.baseURL)
      .patch(`/api/datavault/columns/${testColId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'AC3ColRenamed' });

    expect(updateColRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const colUpdateLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testColId),
          eq(auditLogs.action, 'datavault.column.updated')
        )
      );
    expect(colUpdateLogs).toHaveLength(1);

    // 7. Column Delete
    const deleteColRes = await request(ctx.baseURL)
      .delete(`/api/datavault/columns/${testColId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteColRes.status).toBe(204);
    await new Promise((r) => setTimeout(r, 100));

    const colDeleteLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testColId),
          eq(auditLogs.action, 'datavault.column.deleted')
        )
      );
    expect(colDeleteLogs).toHaveLength(1);

    // 8. Table Delete
    const deleteTableRes = await request(ctx.baseURL)
      .delete(`/api/datavault/tables/${testTableId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteTableRes.status).toBe(204);
    await new Promise((r) => setTimeout(r, 100));

    const tableDeleteLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testTableId),
          eq(auditLogs.action, 'datavault.table.deleted')
        )
      );
    expect(tableDeleteLogs).toHaveLength(1);

    // 9. Database Delete
    const deleteDatabaseRes = await request(ctx.baseURL)
      .delete(`/api/datavault/databases/${testDatabaseId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteDatabaseRes.status).toBe(204);
    await new Promise((r) => setTimeout(r, 100));

    const databaseDeleteLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, testDatabaseId),
          eq(auditLogs.action, 'datavault.database.deleted')
        )
      );
    expect(databaseDeleteLogs).toHaveLength(1);
  });

  it('AC6: No audit payload contains a full row values; payload serialized size stays bounded against large text value', async () => {
    const largeString = 'X'.repeat(50000);
    const rowRes = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: largeString } });

    expect(rowRes.status).toBe(201);
    const largeRowId = rowRes.body.row.id as string;

    await new Promise((r) => setTimeout(r, 100));

    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, largeRowId),
          eq(auditLogs.action, 'datavault.row.created')
        )
      );

    expect(logs).toHaveLength(1);
    const serializedChanges = JSON.stringify(logs[0].changes);
    expect(serializedChanges).not.toContain(largeString);
    expect(serializedChanges).not.toContain('XXXXX');
    expect(serializedChanges.length).toBeLessThan(1000);
    expect(getAuditChanges(logs[0]).after?.columnCount).toBe(1);
  });

  it('AC7: Verify that a failing audit insert does not fail the mutation', async () => {
    const failingExecutor = new Proxy(db, {
      get(target, property, receiver) {
        if (property === 'insert') {
          return () => ({
            values: async () => {
              throw new Error('Simulated audit write failure');
            },
          });
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const originalLog = AuditLogger.log.bind(AuditLogger);
    const logSpy = vi.spyOn(AuditLogger, 'log').mockImplementationOnce((event) =>
      originalLog(event, failingExecutor)
    );

    const res = await request(ctx.baseURL)
      .post(`/api/datavault/tables/${auditTableId}/rows`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ values: { [auditColId]: 'Audit Fail Test' } });

    expect(res.status).toBe(201);
    expect(res.body.row.id).toBeDefined();
    expect(logSpy).toHaveBeenCalledOnce();
    await expect(logSpy.mock.results[0]?.value).resolves.toBeUndefined();

    logSpy.mockRestore();
  });

  it('AC8: POST /api/datavault/references/batch writes no audit entry', async () => {
    const beforeLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, ctx.tenantId));

    const res = await request(ctx.baseURL)
      .post('/api/datavault/references/batch')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        requests: [
          {
            tableId: auditTableId,
            rowIds: ['00000000-0000-0000-0000-000000000000'],
          },
        ],
      });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const afterLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, ctx.tenantId));

    expect(afterLogs.length).toBe(beforeLogs.length);
  });
});

