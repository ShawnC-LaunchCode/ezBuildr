import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { datavaultTables, datavaultTablePermissions, auditLogs } from '@shared/schema';

import { db } from '../../server/db';
import { setupIntegrationTest, createTestUser, type IntegrationTestContext } from '../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

interface AuditChangeSet {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

function getAuditChanges(entry: typeof auditLogs.$inferSelect): AuditChangeSet {
  return (entry.changes ?? {}) as AuditChangeSet;
}



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
    await getOwnerDb().insert(datavaultTablePermissions).values([
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
      await getOwnerDb().insert(datavaultTablePermissions).values({
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

  describe('Audit logging for permissions (DV-13 AC4)', () => {
    it('should write audit log on grantPermission naming target user and role', async () => {
      const targetUser = await createTestUser(ctx, 'viewer');
      const res = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: targetUser.userId, role: 'read' });

      expect(res.status).toBe(201);
      const permissionId = res.body.id;

      // Allow async fire-and-forget audit log to complete
      await new Promise((r) => setTimeout(r, 100));

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, permissionId),
            eq(auditLogs.action, 'datavault.table_permission.granted')
          )
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe(owner.userId);
      expect(logs[0].tenantId).toBe(ctx.tenantId);
      expect(logs[0].resourceType).toBe('datavault_table_permission');
      expect(getAuditChanges(logs[0]).after?.tableId).toBe(tableId);
      expect(getAuditChanges(logs[0]).after?.targetUserId).toBe(targetUser.userId);
      expect(getAuditChanges(logs[0]).after?.role).toBe('read');
    });

    it('should write audit log on revokePermission naming resource and table id', async () => {
      const targetUser = await createTestUser(ctx, 'viewer');
      const grantRes = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ userId: targetUser.userId, role: 'read' });

      expect(grantRes.status).toBe(201);
      const permissionId = grantRes.body.id;

      const deleteRes = await request(ctx.baseURL)
        .delete(`/api/datavault/permissions/${permissionId}?tableId=${tableId}`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(deleteRes.status).toBe(200);

      // Allow async fire-and-forget audit log to complete
      await new Promise((r) => setTimeout(r, 100));

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, permissionId),
            eq(auditLogs.action, 'datavault.table_permission.revoked')
          )
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe(owner.userId);
      expect(logs[0].tenantId).toBe(ctx.tenantId);
      expect(logs[0].resourceType).toBe('datavault_table_permission');
      expect(getAuditChanges(logs[0]).before?.tableId).toBe(tableId);
    });

    it('audits table access grant/revoke and ownership transfer', async () => {
      const targetUser = await createTestUser(ctx, 'viewer');
      const accessEntry = {
        principalType: 'user',
        principalId: targetUser.userId,
        role: 'view',
      };

      const grantRes = await request(ctx.baseURL)
        .put(`/api/datavault/tables/${tableId}/access`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ entries: [accessEntry] });
      expect(grantRes.status).toBe(200);

      const revokeRes = await request(ctx.baseURL)
        .delete(`/api/datavault/tables/${tableId}/access`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ entries: [{ principalType: 'user', principalId: targetUser.userId }] });
      expect(revokeRes.status).toBe(200);

      const transferRes = await request(ctx.baseURL)
        .post(`/api/datavault/tables/${tableId}/transfer`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ targetOwnerType: 'user', targetOwnerUuid: owner.userId });
      expect(transferRes.status).toBe(200);

      await new Promise((r) => setTimeout(r, 100));

      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, tableId));
      const grantLog = logs.filter((log) => log.action === 'datavault.table.access_granted');
      const revokeLog = logs.filter((log) => log.action === 'datavault.table.access_revoked');
      const transferLog = logs.filter((log) => log.action === 'datavault.table.ownership_transferred');

      expect(grantLog).toHaveLength(1);
      expect(revokeLog).toHaveLength(1);
      expect(transferLog).toHaveLength(1);
      expect(grantLog[0].userId).toBe(owner.userId);
      expect(grantLog[0].tenantId).toBe(ctx.tenantId);
      expect(getAuditChanges(grantLog[0]).after?.entriesCount).toBe(1);
      expect(getAuditChanges(revokeLog[0]).before?.entriesCount).toBe(1);
      expect(getAuditChanges(transferLog[0]).after?.targetOwnerUuid).toBe(owner.userId);
    });

    it('audits database access grant/revoke and ownership transfer', async () => {
      const targetUser = await createTestUser(ctx, 'viewer');
      const createRes = await request(ctx.baseURL)
        .post('/api/datavault/databases')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'DV-13 Permission Audit Database', scopeType: 'account' });
      expect(createRes.status).toBe(201);
      const databaseId = createRes.body.id as string;

      const grantRes = await request(ctx.baseURL)
        .put(`/api/datavault/databases/${databaseId}/access`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          entries: [{ principalType: 'user', principalId: targetUser.userId, role: 'view' }],
        });
      expect(grantRes.status).toBe(200);

      const revokeRes = await request(ctx.baseURL)
        .delete(`/api/datavault/databases/${databaseId}/access`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ entries: [{ principalType: 'user', principalId: targetUser.userId }] });
      expect(revokeRes.status).toBe(200);

      const transferRes = await request(ctx.baseURL)
        .post(`/api/datavault/databases/${databaseId}/transfer`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ targetOwnerType: 'user', targetOwnerUuid: owner.userId });
      expect(transferRes.status).toBe(200);

      await new Promise((r) => setTimeout(r, 100));

      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, databaseId));
      const grantLog = logs.filter((log) => log.action === 'datavault.database.access_granted');
      const revokeLog = logs.filter((log) => log.action === 'datavault.database.access_revoked');
      const transferLog = logs.filter((log) => log.action === 'datavault.database.ownership_transferred');

      expect(grantLog).toHaveLength(1);
      expect(revokeLog).toHaveLength(1);
      expect(transferLog).toHaveLength(1);
      expect(grantLog[0].userId).toBe(owner.userId);
      expect(grantLog[0].tenantId).toBe(ctx.tenantId);
      expect(getAuditChanges(grantLog[0]).after?.entriesCount).toBe(1);
      expect(getAuditChanges(revokeLog[0]).before?.entriesCount).toBe(1);
      expect(getAuditChanges(transferLog[0]).after?.targetOwnerUuid).toBe(owner.userId);

      const deleteRes = await request(ctx.baseURL)
        .delete(`/api/datavault/databases/${databaseId}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(deleteRes.status).toBe(204);
    });
  });
});
