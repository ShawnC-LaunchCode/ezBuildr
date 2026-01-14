import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { datavaultTables, datavaultTablePermissions } from '@shared/schema';

import { db } from '../../server/db';
import { setupIntegrationTest, createTestUser, type IntegrationTestContext } from '../helpers/integrationTestHelper';



describe('DataVault Table Permissions API (v4 Micro-Phase 6)', () => {
  let ctx: IntegrationTestContext;
  let owner: { userId: string; token: string };
  let writer: { userId: string; token: string };
  let reader: { userId: string; token: string };
  let nonMember: { userId: string; token: string };
  let tableId: string;

  beforeAll(async () => {
    // 1. Setup Environment (App, Server, DB, Tenant, Admin User)
    ctx = await setupIntegrationTest({
      tenantName: 'Permissions Test Tenant',
    });

    // 2. Create Real Users with Roles & Logins
    // Note: The 'owner' returned by setupIntegrationTest is a tenant owner. 
    // We'll create specific users for this test suite to be explicit.

    // Table Owner (also a Builder/Owner in tenant)
    owner = await createTestUser(ctx, 'owner');

    // Writer (Builder)
    writer = await createTestUser(ctx, 'builder');

    // Reader (Viewer)
    reader = await createTestUser(ctx, 'viewer');

    // Non-Member (User in a different tenant, or just no permissions on table)
    // Let's make them part of the tenant but with no table permissions first
    // Actually, to test "Access denied", being in the tenant is not enough if RLS is table-based.
    // If we want a separate tenant user, we can do that too. 
    // For now, let's just make them a viewer in the same tenant who hasn't been granted table access.
    nonMember = await createTestUser(ctx, 'viewer');

    // 3. Create Test Table (Owned by 'owner')
    const [table] = await db
      .insert(datavaultTables)
      .values({
        tenantId: ctx.tenantId,
        ownerUserId: owner.userId,
        name: 'Permissions Test Table',
        slug: 'permissions-test-table',
      })
      .returning();
    tableId = table.id;

    // 4. Grant Permissions
    await db.insert(datavaultTablePermissions).values([
      { tableId, userId: writer.userId, role: 'write' },
      { tableId, userId: reader.userId, role: 'read' },
    ]);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('GET /api/datavault/tables/:tableId', () => {
    it('should allow owner to read table', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should allow writer to read table', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should allow reader to read table', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${reader.token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should deny non-member from reading table', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${nonMember.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('PATCH /api/datavault/tables/:tableId', () => {
    it('should allow owner to update table', async () => {
      const res = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ description: 'Updated by owner' });

      expect(res.status).toBe(200);
    });

    it('should deny writer from updating table', async () => {
      const res = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`)
        .send({ description: 'Attempt by writer' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from updating table', async () => {
      const res = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${reader.token}`)
        .send({ description: 'Attempt by reader' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('DELETE /api/datavault/tables/:tableId', () => {
    it('should deny writer from deleting table', async () => {
      const res = await request(ctx.baseURL)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from deleting table', async () => {
      const res = await request(ctx.baseURL)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${reader.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny non-member from deleting table', async () => {
      const res = await request(ctx.baseURL)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${nonMember.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('GET /api/datavault/tables/:tableId/permissions', () => {
    it('should allow owner to view permissions', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Expectations might need adjustment based on how permissions are returned (e.g. if owner is included)
      // The setup added 2 permissions (writer, reader).
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should deny writer from viewing permissions', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${writer.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from viewing permissions', async () => {
      const res = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${reader.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('POST /api/datavault/tables/:tableId/permissions', () => {
    it('should allow owner to grant permissions', async () => {
      const res = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: nonMember.userId, role: 'read' });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(nonMember.userId);
      expect(res.body.role).toBe('read');

      // Cleanup: Remove the permission
      await db
        .delete(datavaultTablePermissions)
        .where(
          eq(datavaultTablePermissions.userId, nonMember.userId)
        );
    });

    it('should allow owner to update existing permission (upsert)', async () => {
      const res = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: reader.userId, role: 'write' }); // Upgrade reader to writer

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('write');

      // Revert back to read
      await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: reader.userId, role: 'read' });
    });

    it('should deny writer from granting permissions', async () => {
      const res = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${writer.token}`)
        .send({ userId: nonMember.userId, role: 'read' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should prevent modifying table owner permissions', async () => {
      const res = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: owner.userId, role: 'read' });

      expect(res.status).toBe(500); // Or 400, depending on implementation
      expect(res.body.message).toContain('Cannot modify permissions for table owner');
    });
  });

  describe('DELETE /api/datavault/permissions/:permissionId', () => {
    it('should allow owner to revoke permissions', async () => {
      // Get writer's permission ID
      const perms = await db
        .select()
        .from(datavaultTablePermissions)
        .where(eq(datavaultTablePermissions.userId, writer.userId));

      expect(perms.length).toBe(1);
      const permissionId = perms[0].id;

      const res = await request(ctx.baseURL)
        .delete(`/api/datavault/permissions/${permissionId}?tableId=${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Re-grant the permission
      await db.insert(datavaultTablePermissions).values({
        tableId,
        userId: writer.userId,
        role: 'write',
      });
    });

    it('should deny writer from revoking permissions', async () => {
      const perms = await db
        .select()
        .from(datavaultTablePermissions)
        .where(eq(datavaultTablePermissions.userId, reader.userId));

      const permissionId = perms[0].id;

      const res = await request(ctx.baseURL)
        .delete(`/api/datavault/permissions/${permissionId}?tableId=${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('Permission hierarchy', () => {
    it('should enforce owner includes write and read', async () => {
      // Owner can read
      const readRes = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(readRes.status).toBe(200);

      // Owner can update table
      const updateRes = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ description: 'Owner test' });
      expect(updateRes.status).toBe(200);
    });

    it('should enforce write includes read but not owner', async () => {
      // Writer can read
      const readRes = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`);
      expect(readRes.status).toBe(200);

      // Writer cannot update table schema
      const updateRes = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${writer.token}`)
        .send({ description: 'Writer test' });
      expect(updateRes.status).toBe(403);
    });

    it('should enforce read is read-only', async () => {
      // Reader can read
      const readRes = await request(ctx.baseURL)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${reader.token}`);
      expect(readRes.status).toBe(200);

      // Reader cannot update
      const updateRes = await request(ctx.baseURL)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Authorization', `Bearer ${reader.token}`)
        .send({ description: 'Reader test' });
      expect(updateRes.status).toBe(403);
    });
  });
});
