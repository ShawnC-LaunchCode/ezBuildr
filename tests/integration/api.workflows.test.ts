import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "../../server/routes";
import { nanoid } from "nanoid";
import { db } from "../../server/db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Workflows API Integration Tests
 */
describe("Workflows API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5011;
        resolve(port);
      });
    });

    baseURL = `http://localhost:${port}`;

    // Setup tenant, user, and project
    const [tenant] = await db.insert(schema.tenants).values({
      name: "Test Tenant for Workflows",
      plan: "free",
    }).returning();
    tenantId = tenant.id;

    const email = `test-workflows-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPassword123",
      })
      .expect(201);

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;

    await db.update(schema.users)
      .set({ tenantId, tenantRole: "builder" })
      .where(eq(schema.users.id, userId));

    // Create project
    const projectResponse = await request(baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Test Project for Workflows" });
    projectId = projectResponse.body.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe("POST /api/projects/:projectId/workflows", () => {
    it("should create a new draft workflow", async () => {
      const response = await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Test Workflow",
          graphJson: { nodes: [], edges: [] },
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name", "Test Workflow");
      expect(response.body).toHaveProperty("status", "draft");
      expect(response.body).toHaveProperty("currentVersion");
      expect(response.body.currentVersion).toHaveProperty("published", false);
    });

    it("should reject without permission", async () => {
      // Create viewer user
      const viewerEmail = `viewer-${nanoid()}@example.com`;
      const viewerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({ email: viewerEmail, password: "TestPassword123" })
        .expect(201);

      await db.update(schema.users)
        .set({ tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, viewerResponse.body.user.id));

      await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${viewerResponse.body.token}`)
        .send({ name: "Test Workflow" })
        .expect(403);
    });
  });

  describe("GET /api/projects/:projectId/workflows", () => {
    beforeEach(async () => {
      await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: `List Test ${nanoid()}` });
    });

    it("should list workflows", async () => {
      const response = await request(baseURL)
        .get(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it("should filter by status", async () => {
      const response = await request(baseURL)
        .get(`/api/projects/${projectId}/workflows?status=draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.items.every((w: any) => w.status === "draft")).toBe(true);
    });

    it("should search by name", async () => {
      const uniqueName = `SearchTest-${nanoid()}`;
      await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: uniqueName });

      const response = await request(baseURL)
        .get(`/api/projects/${projectId}/workflows?q=${uniqueName}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
    });
  });

  describe("PATCH /api/workflows/:id", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Edit Test" });
      workflowId = response.body.id;
    });

    it("should update draft workflow", async () => {
      const response = await request(baseURL)
        .patch(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Updated Name" })
        .expect(200);

      expect(response.body).toHaveProperty("name", "Updated Name");
    });

    it("should not allow editing published workflow", async () => {
      // Publish workflow first
      await request(baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      // Try to edit
      await request(baseURL)
        .patch(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Should Fail" })
        .expect(400);
    });
  });

  describe("POST /api/workflows/:id/publish", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Publish Test" });
      workflowId = response.body.id;
    });

    it("should publish workflow", async () => {
      const response = await request(baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("status", "published");
      expect(response.body.currentVersion).toHaveProperty("published", true);
      expect(response.body.currentVersion).toHaveProperty("publishedAt");
    });
  });

  describe("GET /api/workflows/:id/versions", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ name: "Versions Test" });
      workflowId = response.body.id;

      // Publish to create a version
      await request(baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${authToken}`);
    });

    it("should list workflow versions", async () => {
      const response = await request(baseURL)
        .get(`/api/workflows/${workflowId}/versions`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0]).toHaveProperty("published", true);
    });
  });
});
