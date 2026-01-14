import { createServer, type Server } from "http";

import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";


import * as schema from "@shared/schema";

import { db } from "../../server/db";
import { registerRoutes } from "../../server/routes";


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
    const [tenant] = await db.insert(schema.tenants).values({
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
    await db.update(schema.users)
      .set({ tenantId, tenantRole: "owner" })
      .where(eq(schema.users.id, userId));
  });

  afterAll(async () => {
    // Cleanup
    if (tenantId) {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
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
    let projectId: string;

    beforeEach(async () => {
      // Create a test project
      const response = await request(baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `List Test Project ${nanoid()}` });
      projectId = response.body.id;
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
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));

      expect(project.archived).toBe(true);
    });
  });

  describe("Tenant Isolation", () => {
    let otherTenantId: string;
    let otherAuthToken: string;
    let projectId: string;

    beforeEach(async () => {
      // Create another tenant and user
      const [otherTenant] = await db.insert(schema.tenants).values({
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

      await db.update(schema.users)
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
        await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
      }
    });

    it("should not allow cross-tenant access", async () => {
      await request(baseURL)
        .get(`/api/projects/${projectId}`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .expect(404);
    });
  });
});
