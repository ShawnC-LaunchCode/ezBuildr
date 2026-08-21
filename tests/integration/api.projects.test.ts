import { type Server } from "http";

import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import * as schema from "@shared/schema";

import { rlsContext } from "../../server/middleware/rlsContext";
import { registerRoutes } from "../../server/routes";
import { projectService } from "../../server/services/ProjectService";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
/**
 * Projects API Integration Tests
 *
 * Using describe.sequential because tests share tenant/server setup
 */
describe.sequential("Projects API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    // RLS-2d: mounted BEFORE registerRoutes, mirroring server/index.ts /
    // server/production.ts — this suite builds its own app rather than using
    // the shared integration harness, so it never got rlsContext for free.
    // Without it, ProjectService's withCurrentTenant() has no tenant to
    // read and every request 500s with "RLS: no tenant in context."
    app.use(rlsContext);
    // Register all routes
    server = await registerRoutes(app);
    // Find available port
    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5010;
        resolve(port);
      });
    });
    baseURL = `http://localhost:${port}`;
    // Create test tenant
    const [tenant] = await getOwnerDb().insert(schema.tenants).values({
      name: "Test Tenant for Projects",
      plan: "free",
    }).returning();
    tenantId = tenant.id;
    // Register test user with tenant
    const email = `test-projects-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123!@#Strong",
        firstName: "Test",
        lastName: "User",
      })
      .expect(201);
    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;
    // Assign tenant and role to user
    await getOwnerDb().update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));
  });
  afterAll(async () => {
    // Cleanup
    if (tenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
  describe("POST /api/projects", () => {
    it("should create a new project", async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Test Project",
          description: "A test project",
        })
        .expect(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name", "Test Project");
      expect(response.body).toHaveProperty("description", "A test project");
      expect(response.body).toHaveProperty("tenantId", tenantId);
      expect(response.body).toHaveProperty("archived", false);
    });
    it("should reject without authentication", async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .send({ name: "Test Project" })
        .expect(401);
      expect(response.body).toHaveProperty("error");
    });
    it("should reject with invalid data", async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "" }) // Empty name
        .expect(400);
      expect(response.body).toHaveProperty("error");
    });
  });
  describe("GET /api/projects", () => {

    beforeEach(async () => {
      // Create a test project
      await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `List Test Project ${nanoid()}` });
      // projectId = response.body.id;
    });
    it("should list projects for tenant", async () => {
      const response = await request(baseURL)
        .get("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);
      expect(response.body).toHaveProperty("items");
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty("hasMore");
      expect(response.body).toHaveProperty("nextCursor");
    });
    it("should support pagination", async () => {
      const response = await request(baseURL)
        .get("/api/projects?limit=1")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);
      expect(response.body.items.length).toBeLessThanOrEqual(1);
    });
    it("PROJ-4: walks the cursor to exhaustion with no overlap or gaps", async () => {
      // Fresh, uniquely-named batch so we can assert each appears exactly once.
      const batchTag = nanoid();
      const createdIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(baseURL)
          .post("/api/projects")
          .set("Authorization", `Bearer ${authToken}`)
          .send({ name: `Cursor Walk ${batchTag} ${i}` })
          .expect(201);
        createdIds.push(response.body.id);
      }

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      let pages = 0;
      do {
        const qs = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
        const response = await request(baseURL)
          .get(`/api/projects${qs}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);
        expect(response.body.items.length).toBeLessThanOrEqual(2);
        for (const item of response.body.items) {
          seenIds.push(item.id);
        }
        hasMore = response.body.hasMore;
        cursor = response.body.nextCursor ?? undefined;
        pages += 1;
        // Safety valve: a broken cursor implementation must not hang the suite.
        expect(pages).toBeLessThan(500);
      } while (hasMore);

      // Final page contract.
      expect(hasMore).toBe(false);
      expect(cursor).toBeUndefined();

      // No overlap across pages (every id seen at most once across the whole walk)...
      const seenCounts = new Map<string, number>();
      for (const id of seenIds) {
        seenCounts.set(id, (seenCounts.get(id) ?? 0) + 1);
      }
      for (const count of seenCounts.values()) {
        expect(count).toBe(1);
      }
      // ...and no gaps: every project created for this batch shows up exactly once.
      for (const id of createdIds) {
        expect(seenCounts.get(id)).toBe(1);
      }
    });
    it("PROJ-4: composes ?active=true with the cursor, excluding archived rows on every page", async () => {
      const batchTag = nanoid();
      const activeResponse = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Active Compose ${batchTag} A` })
        .expect(201);
      const archivedResponse = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Active Compose ${batchTag} B` })
        .expect(201);
      const activeProjectId = activeResponse.body.id;
      const archivedProjectId = archivedResponse.body.id;

      await request(baseURL)
        .put(`/api/projects/${archivedProjectId}/archive`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      let pages = 0;
      do {
        const qs = cursor
          ? `?active=true&limit=2&cursor=${encodeURIComponent(cursor)}`
          : "?active=true&limit=2";
        const response = await request(baseURL)
          .get(`/api/projects${qs}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);
        for (const item of response.body.items) {
          expect(item.id).not.toBe(archivedProjectId);
          seenIds.push(item.id);
        }
        hasMore = response.body.hasMore;
        cursor = response.body.nextCursor ?? undefined;
        pages += 1;
        expect(pages).toBeLessThan(500);
      } while (hasMore);

      expect(seenIds).toContain(activeProjectId);
      expect(seenIds).not.toContain(archivedProjectId);
    });
    it("PROJ-8: active list carries ownerName for an org-owned project", async () => {
      const [org] = await getOwnerDb().insert(schema.organizations).values({
        name: `Owner Name Org ${nanoid()}`,
        tenantId,
        createdByUserId: userId,
      }).returning();
      await getOwnerDb().insert(schema.organizationMemberships).values({
        orgId: org.id,
        userId,
        role: "admin",
      });
      const createResponse = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Org Owned ${nanoid()}`, ownerType: "org", ownerUuid: org.id })
        .expect(201);
      const orgProjectId = createResponse.body.id;

      const seenIds: string[] = [];
      let cursor: string | undefined;
      let hasMore = true;
      let match: { id: string; ownerName?: string | null } | undefined;
      do {
        const qs = cursor
          ? `?active=true&limit=5&cursor=${encodeURIComponent(cursor)}`
          : "?active=true&limit=5";
        const response = await request(baseURL)
          .get(`/api/projects${qs}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);
        for (const item of response.body.items) {
          seenIds.push(item.id);
          if (item.id === orgProjectId) {
            match = item;
          }
        }
        hasMore = response.body.hasMore;
        cursor = response.body.nextCursor ?? undefined;
      } while (hasMore && !match);

      expect(seenIds).toContain(orgProjectId);
      expect(match).toBeDefined();
      expect(match?.ownerName).toBe(org.name);
    });
    it("PROJ-4: returns 400 for a garbage cursor instead of silently returning the first page", async () => {
      const response = await request(baseURL)
        .get("/api/projects?cursor=invalid-cursor")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);
      expect(response.body).toHaveProperty("message");
    });
  });
  describe("GET /api/projects/:id", () => {
    let projectId: string;
    beforeEach(async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Get Test Project ${nanoid()}` });
      projectId = response.body.id;
    });
    it("should get project by ID", async () => {
      const response = await request(baseURL)
        .get(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);
      expect(response.body).toHaveProperty("id", projectId);
      expect(response.body).toHaveProperty("name");
    });
    it("should return 404 for non-existent project", async () => {
      const fakeId = "123e4567-e89b-12d3-a456-426614174000";
      await request(baseURL)
        .get(`/api/projects/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);
    });
  });
  describe("PATCH /api/projects/:id", () => {
    let projectId: string;
    beforeEach(async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Update Test Project ${nanoid()}` });
      projectId = response.body.id;
    });
    it("should update project", async () => {
      const response = await request(baseURL)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Updated Name" })
        .expect(200);
      expect(response.body).toHaveProperty("name", "Updated Name");
    });
  });
  describe("PUT /api/projects/:id", () => {
    let projectId: string;
    beforeEach(async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Update Test Project ${nanoid()}` });
      projectId = response.body.id;
    });
    it("should update project", async () => {
      const response = await request(baseURL)
        .put(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Updated Name" })
        .expect(200);
      expect(response.body).toHaveProperty("name", "Updated Name");
    });
  });
  describe("DELETE /api/projects/:id", () => {
    let projectId: string;
    beforeEach(async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Delete Test Project ${nanoid()}` });
      projectId = response.body.id;
    });
    it("should soft-delete project", async () => {
      await request(baseURL)
        .delete(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(204);
      // Verify it's archived
      const [project] = await getOwnerDb()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      expect(project.archived).toBe(true);
    });
    it("rejects delete from a non-owner (edit-role) caller with 403", async () => {
      const email = `delete-nonowner-${nanoid()}@example.com`;
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password: "TestPassword123!@#Strong",
        })
        .expect(201);
      const editUserToken = registerResponse.body.token;
      const editUserId = registerResponse.body.user.id;
      await getOwnerDb().update(schema.users)
        .set({ tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, editUserId));
      await getOwnerDb().insert(schema.projectAccess).values({
        projectId,
        principalType: "user",
        principalId: editUserId,
        role: "edit",
      });

      await request(baseURL)
        .delete(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${editUserToken}`)
        .expect(403);
      // Verify it was NOT archived — the edit-role caller was rejected before any write.
      const [project] = await getOwnerDb()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      expect(project.archived).toBe(false);
      expect(project.status).toBe("active");
    });
  });
  describe("Tenant Isolation", () => {
    let otherTenantId: string;
    let otherAuthToken: string;
    let projectId: string;
    beforeEach(async () => {
      // Create another tenant and user
      const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({
        name: "Other Tenant",
        plan: "free",
      }).returning();
      otherTenantId = otherTenant.id;
      const email = `other-${nanoid()}@example.com`;
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password: "TestPassword123!@#Strong",
        })
        .expect(201);
      otherAuthToken = registerResponse.body.token;
      const otherUserId = registerResponse.body.user.id;
      await getOwnerDb().update(schema.users)
        .set({ tenantId: otherTenantId, tenantRole: "owner" })
        .where(eq(schema.users.id, otherUserId));
      // Create project in first tenant
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Isolation Test Project ${nanoid()}` });
      projectId = response.body.id;
    });
    afterAll(async () => {
      if (otherTenantId) {
        await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
      }
    });
    it("should not allow cross-tenant access", async () => {
      await request(baseURL)
        .get(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .expect(403);
    });
  });
  describe("PROJ-1: org-admin archive gate on updateProject", () => {
    let orgId: string;
    let memberUserId: string;
    let memberAuthToken: string;
    let projectId: string;

    beforeAll(async () => {
      // Org owned by the main tenant, with `userId` (tenant owner) as org admin.
      const [org] = await getOwnerDb().insert(schema.organizations).values({
        name: `Archive Gate Org ${nanoid()}`,
        tenantId,
        createdByUserId: userId,
      }).returning();
      orgId = org.id;
      await getOwnerDb().insert(schema.organizationMemberships).values({
        orgId,
        userId,
        role: "admin",
      });
      // Non-admin member of the same org.
      const email = `member-${nanoid()}@example.com`;
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password: "TestPassword123!@#Strong",
          firstName: "Member",
          lastName: "User",
        })
        .expect(201);
      memberAuthToken = registerResponse.body.token;
      memberUserId = registerResponse.body.user.id;
      await getOwnerDb().update(schema.users)
        .set({ tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, memberUserId));
      await getOwnerDb().insert(schema.organizationMemberships).values({
        orgId,
        userId: memberUserId,
        role: "member",
      });
    });
    afterAll(async () => {
      if (orgId) {
        await getOwnerDb().delete(schema.organizations).where(eq(schema.organizations.id, orgId));
      }
    });
    beforeEach(async () => {
      // Fresh org-owned project per test, with the non-admin member granted `edit`.
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `Archive Gate Project ${nanoid()}`, ownerType: "org", ownerUuid: orgId })
        .expect(201);
      projectId = response.body.id;
      await getOwnerDb().insert(schema.projectAccess).values({
        projectId,
        principalType: "user",
        principalId: memberUserId,
        role: "edit",
      });
    });
    it("rejects a direct service archive by a non-admin org member and allows an org admin", async () => {
      // RLS-2d: this bypasses HTTP (calling projectService directly), so
      // rlsContext never runs and there is no ambient tenant. beforeAll/
      // beforeEach cannot bind it (AsyncLocalStorage.enterWith does not
      // propagate across hooks) — must be inside the test body itself.
      enterTenantContextForTests(tenantId);
      await expect(
        projectService.updateProject(projectId, memberUserId, { status: "archived" })
      ).rejects.toThrow(/Access denied/);
      const [unchanged] = await getOwnerDb()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      expect(unchanged.archived).toBe(false);
      expect(unchanged.status).toBe("active");

      await expect(
        projectService.updateProject(projectId, memberUserId, { archived: true })
      ).rejects.toThrow(/Access denied/);

      const updated = await projectService.updateProject(projectId, userId, {
        status: "archived",
        archived: true,
      });
      expect(updated.archived).toBe(true);
      expect(updated.status).toBe("archived");
    });
    it("PATCH ignores a status field: no archival change, other fields still apply", async () => {
      const response = await request(baseURL)
        .patch(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${memberAuthToken}`)
        .send({ name: "Renamed via PATCH", status: "archived" })
        .expect(200);
      expect(response.body).toHaveProperty("name", "Renamed via PATCH");
      const [row] = await getOwnerDb()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      expect(row.archived).toBe(false);
      expect(row.status).toBe("active");
    });
    it("PUT ignores a status field: no archival change, other fields still apply", async () => {
      const response = await request(baseURL)
        .put(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${memberAuthToken}`)
        .send({ name: "Renamed via PUT", status: "archived" })
        .expect(200);
      expect(response.body).toHaveProperty("name", "Renamed via PUT");
      const [row] = await getOwnerDb()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      expect(row.archived).toBe(false);
      expect(row.status).toBe("active");
    });
  });
  describe("PROJ-9: ACL principal validation & transactional grant/revoke", () => {
    let projectId: string;
    beforeEach(async () => {
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `ACL Test Project ${nanoid()}` })
        .expect(201);
      projectId = response.body.id;
    });
    it("PUT /access rejects a non-UUID principalId with 400", async () => {
      const response = await request(baseURL)
        .put(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          entries: [
            { principalType: "user", principalId: "not-a-uuid", role: "edit" },
          ],
        })
        .expect(400);
      expect(response.body.success).toBe(false);
      const acl = await getOwnerDb()
        .select()
        .from(schema.projectAccess)
        .where(eq(schema.projectAccess.projectId, projectId));
      expect(acl).toHaveLength(0);
    });
    it("DELETE /access rejects a non-UUID principalId with 400", async () => {
      const response = await request(baseURL)
        .delete(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          entries: [{ principalType: "user", principalId: "not-a-uuid" }],
        })
        .expect(400);
      expect(response.body.success).toBe(false);
    });
    it("PUT /access rejects an entries array over the 50-item cap with 400", async () => {
      const entries = Array.from({ length: 51 }, () => ({
        principalType: "user" as const,
        principalId: crypto.randomUUID(),
        role: "view" as const,
      }));
      const response = await request(baseURL)
        .put(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ entries })
        .expect(400);
      expect(response.body.success).toBe(false);
    });
    it("PUT /access rejects an empty entries array with 400", async () => {
      await request(baseURL)
        .put(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ entries: [] })
        .expect(400);
    });
    it("single-entry grant then revoke flows are unchanged (same response shapes)", async () => {
      const principalId = crypto.randomUUID();
      const grantResponse = await request(baseURL)
        .put(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ entries: [{ principalType: "user", principalId, role: "edit" }] })
        .expect(200);
      expect(grantResponse.body).toMatchObject({ success: true });
      expect(grantResponse.body.data).toHaveLength(1);
      expect(grantResponse.body.data[0]).toMatchObject({
        projectId,
        principalType: "user",
        principalId,
        role: "edit",
      });

      const revokeResponse = await request(baseURL)
        .delete(`/api/projects/${projectId}/access`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ entries: [{ principalType: "user", principalId }] })
        .expect(200);
      expect(revokeResponse.body).toMatchObject({
        success: true,
        message: "Access revoked successfully",
      });
      const [remaining] = await getOwnerDb()
        .select()
        .from(schema.projectAccess)
        .where(
          eq(schema.projectAccess.projectId, projectId)
        );
      expect(remaining).toBeUndefined();
    });
    it("a grant batch with one invalid entry applies nothing — the transaction rolls back", async () => {
      // Bypasses the route's Zod validation (which would reject an
      // out-of-band role before it ever reaches the service) to exercise
      // the service-level transactional guarantee directly: a mid-loop DB
      // failure (role exceeds the varchar(20) column) must roll back the
      // entries that already succeeded in the same call.
      const validId1 = crypto.randomUUID();
      const validId2 = crypto.randomUUID();
      const badId = crypto.randomUUID();
      const entries = [
        { principalType: "user" as const, principalId: validId1, role: "view" as const },
        { principalType: "user" as const, principalId: validId2, role: "edit" as const },
        {
          principalType: "user" as const,
          principalId: badId,

          role: "x".repeat(25) as any,
        },
      ];

      // RLS-2d: direct service call, no HTTP request — bind the tenant
      // in-body (see the note on the archive-gate test above).
      enterTenantContextForTests(tenantId);
      await expect(
        projectService.grantProjectAccess(projectId, userId, entries)
      ).rejects.toThrow();

      const acl = await getOwnerDb()
        .select()
        .from(schema.projectAccess)
        .where(eq(schema.projectAccess.projectId, projectId));
      expect(acl).toHaveLength(0);
    });
  });
});