import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { registerDatavaultRoutes } from '../../server/routes/datavault.routes';
import { db } from '../../server/db';
import { users, tenants, datavaultTables, datavaultTablePermissions } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('DataVault Table Permissions API (v4 Micro-Phase 6)', () => {
  let ownerCookie: string;
  let writerCookie: string;
  let readerCookie: string;
  let nonMemberCookie: string;
  let tenantId: string;
  let tableId: string;
  let ownerId: string;
  let writerId: string;
  let readerId: string;
  let nonMemberId: string;
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    // Mock cookie parser or session if needed, but registerDatavaultRoutes expects app
    // We might need to mock auth middleware if it's not bypassed

    // Add middleware to mock authentication based on cookies
    app.use((req, res, next) => {
      const cookie = req.headers.cookie;
      if (cookie) {
        if (cookie.includes('test-session-owner=')) {
          const userId = cookie.split('test-session-owner=')[1].split(';')[0];
          // @ts-ignore
          req.user = { claims: { sub: userId, email: 'owner@test.com' } };
          // @ts-ignore
          req.session = { user: { claims: { sub: userId, email: 'owner@test.com' } } };
        } else if (cookie.includes('test-session-writer=')) {
          const userId = cookie.split('test-session-writer=')[1].split(';')[0];
          // @ts-ignore
          req.user = { claims: { sub: userId, email: 'writer@test.com' } };
          // @ts-ignore
          req.session = { user: { claims: { sub: userId, email: 'writer@test.com' } } };
        } else if (cookie.includes('test-session-reader=')) {
          const userId = cookie.split('test-session-reader=')[1].split(';')[0];
          // @ts-ignore
          req.user = { claims: { sub: userId, email: 'reader@test.com' } };
          // @ts-ignore
          req.session = { user: { claims: { sub: userId, email: 'reader@test.com' } } };
        } else if (cookie.includes('test-session-nonmember=')) {
          const userId = cookie.split('test-session-nonmember=')[1].split(';')[0];
          // @ts-ignore
          req.user = { claims: { sub: userId, email: 'nonmember@test.com' } };
          // @ts-ignore
          req.session = { user: { claims: { sub: userId, email: 'nonmember@test.com' } } };
        }
      }
      next();
    });

    // For now, let's register routes
    registerDatavaultRoutes(app);

    // Create test tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Permissions Test Tenant',
        plan: 'pro',
      })
      .returning();
    tenantId = tenant.id;

    // Create test users
    const [owner] = await db
      .insert(users)
      .values({
        email: 'owner@test.com',
        fullName: 'Table Owner',
        tenantId,
      })
      .returning();
    ownerId = owner.id;

    const [writer] = await db
      .insert(users)
      .values({
        email: 'writer@test.com',
        fullName: 'Table Writer',
        tenantId,
      })
      .returning();
    writerId = writer.id;

    const [reader] = await db
      .insert(users)
      .values({
        email: 'reader@test.com',
        fullName: 'Table Reader',
        tenantId,
      })
      .returning();
    readerId = reader.id;

    const [nonMember] = await db
      .insert(users)
      .values({
        email: 'nonmember@test.com',
        fullName: 'Non Member',
        tenantId,
      })
      .returning();
    nonMemberId = nonMember.id;

    // Create test table owned by owner
    const [table] = await db
      .insert(datavaultTables)
      .values({
        tenantId,
        ownerUserId: ownerId,
        name: 'Permissions Test Table',
        slug: 'permissions-test-table',
      })
      .returning();
    tableId = table.id;

    // Grant permissions to writer and reader
    await db.insert(datavaultTablePermissions).values([
      { tableId, userId: writerId, role: 'write' },
      { tableId, userId: readerId, role: 'read' },
    ]);

    // Mock authentication cookies
    ownerCookie = `test-session-owner=${ownerId}`;
    writerCookie = `test-session-writer=${writerId}`;
    readerCookie = `test-session-reader=${readerId}`;
    nonMemberCookie = `test-session-nonmember=${nonMemberId}`;
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(datavaultTablePermissions).where(eq(datavaultTablePermissions.tableId, tableId));
    await db.delete(datavaultTables).where(eq(datavaultTables.id, tableId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  describe('GET /api/datavault/tables/:tableId', () => {
    it('should allow owner to read table', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should allow writer to read table', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', writerCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should allow reader to read table', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', readerCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(tableId);
    });

    it('should deny non-member from reading table', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', nonMemberCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('PATCH /api/datavault/tables/:tableId', () => {
    it('should allow owner to update table', async () => {
      const res = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', ownerCookie)
        .send({ description: 'Updated by owner' });

      expect(res.status).toBe(200);
    });

    it('should deny writer from updating table', async () => {
      const res = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', writerCookie)
        .send({ description: 'Attempt by writer' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from updating table', async () => {
      const res = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', readerCookie)
        .send({ description: 'Attempt by reader' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('DELETE /api/datavault/tables/:tableId', () => {
    it('should deny writer from deleting table', async () => {
      const res = await request(app)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Cookie', writerCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from deleting table', async () => {
      const res = await request(app)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Cookie', readerCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny non-member from deleting table', async () => {
      const res = await request(app)
        .delete(`/api/datavault/tables/${tableId}`)
        .set('Cookie', nonMemberCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('GET /api/datavault/tables/:tableId/permissions', () => {
    it('should allow owner to view permissions', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // writer and reader
    });

    it('should deny writer from viewing permissions', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', writerCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should deny reader from viewing permissions', async () => {
      const res = await request(app)
        .get(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', readerCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('POST /api/datavault/tables/:tableId/permissions', () => {
    it('should allow owner to grant permissions', async () => {
      const res = await request(app)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', ownerCookie)
        .send({ userId: nonMemberId, role: 'read' });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(nonMemberId);
      expect(res.body.role).toBe('read');

      // Cleanup: Remove the permission
      await db
        .delete(datavaultTablePermissions)
        .where(
          eq(datavaultTablePermissions.userId, nonMemberId)
        );
    });

    it('should allow owner to update existing permission (upsert)', async () => {
      const res = await request(app)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', ownerCookie)
        .send({ userId: readerId, role: 'write' }); // Upgrade reader to writer

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('write');

      // Revert back to read
      await request(app)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', ownerCookie)
        .send({ userId: readerId, role: 'read' });
    });

    it('should deny writer from granting permissions', async () => {
      const res = await request(app)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', writerCookie)
        .send({ userId: nonMemberId, role: 'read' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should prevent modifying table owner permissions', async () => {
      const res = await request(app)
        .post(`/api/datavault/tables/${tableId}/permissions`)
        .set('Cookie', ownerCookie)
        .send({ userId: ownerId, role: 'read' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Cannot modify permissions for table owner');
    });
  });

  describe('DELETE /api/datavault/permissions/:permissionId', () => {
    it('should allow owner to revoke permissions', async () => {
      // Get writer's permission ID
      const perms = await db
        .select()
        .from(datavaultTablePermissions)
        .where(eq(datavaultTablePermissions.userId, writerId));

      expect(perms.length).toBe(1);
      const permissionId = perms[0].id;

      const res = await request(app)
        .delete(`/api/datavault/permissions/${permissionId}?tableId=${tableId}`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Re-grant the permission
      await db.insert(datavaultTablePermissions).values({
        tableId,
        userId: writerId,
        role: 'write',
      });
    });

    it('should deny writer from revoking permissions', async () => {
      const perms = await db
        .select()
        .from(datavaultTablePermissions)
        .where(eq(datavaultTablePermissions.userId, readerId));

      const permissionId = perms[0].id;

      const res = await request(app)
        .delete(`/api/datavault/permissions/${permissionId}?tableId=${tableId}`)
        .set('Cookie', writerCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });

  describe('Permission hierarchy', () => {
    it('should enforce owner includes write and read', async () => {
      // Owner can read
      const readRes = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', ownerCookie);
      expect(readRes.status).toBe(200);

      // Owner can update table
      const updateRes = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', ownerCookie)
        .send({ description: 'Owner test' });
      expect(updateRes.status).toBe(200);
    });

    it('should enforce write includes read but not owner', async () => {
      // Writer can read
      const readRes = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', writerCookie);
      expect(readRes.status).toBe(200);

      // Writer cannot update table schema
      const updateRes = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', writerCookie)
        .send({ description: 'Writer test' });
      expect(updateRes.status).toBe(403);
    });

    it('should enforce read is read-only', async () => {
      // Reader can read
      const readRes = await request(app)
        .get(`/api/datavault/tables/${tableId}`)
        .set('Cookie', readerCookie);
      expect(readRes.status).toBe(200);

      // Reader cannot update
      const updateRes = await request(app)
        .patch(`/api/datavault/tables/${tableId}`)
        .set('Cookie', readerCookie)
        .send({ description: 'Reader test' });
      expect(updateRes.status).toBe(403);
    });
  });
});
