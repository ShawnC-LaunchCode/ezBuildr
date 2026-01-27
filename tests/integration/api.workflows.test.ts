import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach , vi } from "vitest";


import * as schema from "@shared/schema";

// Local mock to fix constructor error
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      constructor(apiKey: string) { }
      getGenerativeModel(params: any) {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => JSON.stringify({}) }
          })
        };
      }
    }
  };
});

import { db } from "../../server/db";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";





/**
 * Workflows API Integration Tests
 *
 * Refactored to use integrationTestHelper for consistent setup/teardown
 * Using describe.sequential because tests share project/tenant setup
 */
describe.sequential("Workflows API Integration Tests", () => {
  let ctx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Test Tenant for Workflows",
      createProject: true,
      projectName: "Test Project for Workflows",
      userRole: "admin",
      tenantRole: "owner",
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("POST /api/projects/:ctx.projectId/workflows", () => {
    it("should create a new draft workflow", async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
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
      const viewerResponse = await request(ctx.baseURL)
        .post("/api/auth/register")
        .send({ email: viewerEmail, password: "StrongTestPassword123!" })
        .expect(201);

      await db.update(schema.users)
        .set({ tenantId: ctx.tenantId, tenantRole: "viewer" })
        .where(eq(schema.users.id, viewerResponse.body.user.id));

      await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${viewerResponse.body.token}`)
        .send({ name: "Test Workflow" })
        .expect(403);
    });
  });

  describe("GET /api/projects/:ctx.projectId/workflows", () => {
    beforeEach(async () => {
      await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ name: `List Test ${nanoid()}` });
    });

    it("should list workflows", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it("should filter by status", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/projects/${ctx.projectId}/workflows?status=draft`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body.items.every((w: any) => w.status === "draft")).toBe(true);
    });

    it("should search by name", async () => {
      const uniqueName = `SearchTest-${nanoid()}`;
      await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ name: uniqueName });

      const response = await request(ctx.baseURL)
        .get(`/api/projects/${ctx.projectId}/workflows?q=${uniqueName}`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
    });
  });

  describe("PATCH /api/workflows/:id", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          name: "Edit Test",
          graphJson: { nodes: [], edges: [] }
        });
      workflowId = response.body.id;
    });

    it("should update draft workflow", async () => {
      const response = await request(ctx.baseURL)
        .patch(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ name: "Updated Name" })
        .expect(200);

      expect(response.body).toHaveProperty("name", "Updated Name");
    });

    it("should not allow editing published workflow", async () => {
      // Publish workflow first
      await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({})
        .expect(200);

      // Try to edit
      await request(ctx.baseURL)
        .patch(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ name: "Should Fail" })
        .expect(400);
    });
  });

  describe("POST /api/workflows/:id/publish", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          name: "Publish Test",
          graphJson: { nodes: [], edges: [] }
        });
      workflowId = response.body.id;
    });

    it("should publish workflow", async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty("status", "active");
      expect(response.body.currentVersion).toHaveProperty("published", true);
      expect(response.body.currentVersion).toHaveProperty("publishedAt");
    });
  });

  describe("GET /api/workflows/:id/versions", () => {
    let workflowId: string;

    beforeEach(async () => {
      const response = await request(ctx.baseURL)
        .post(`/api/projects/${ctx.projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          name: "Versions Test",
          graphJson: { nodes: [], edges: [] }
        });
      workflowId = response.body.id;

      // Publish to create a version
      await request(ctx.baseURL)
        .post(`/api/workflows/${workflowId}/publish`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({});
    });

    it("should list workflow versions", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/versions`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0]).toHaveProperty("published", true);
    });
  });

  describe("PUT /api/workflows/:id/move", () => {
    let workflowId: string;
    let targetProjectId: string;

    beforeEach(async () => {
      // Create a workflow in the default project
      const workflowResponse = await request(ctx.baseURL)
        .post("/api/workflows")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          title: "Move Test Workflow",
          description: "Test workflow for move operations",
        });

      if (workflowResponse.status !== 201) {
        throw new Error(`Failed to create workflow: ${workflowResponse.status}`);
      }
      workflowId = workflowResponse.body.id;

      // Create a second project as move target
      const projectResponse = await request(ctx.baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          name: "Target Project",
          description: "Target project for move tests",
        });
      targetProjectId = projectResponse.body.id;
    });

    it("should move workflow to a project", async () => {
      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: targetProjectId })
        .expect(200);

      expect(response.body).toHaveProperty("id", workflowId);
      expect(response.body).toHaveProperty("projectId", targetProjectId);

      // Verify the workflow was actually moved
      const verifyResponse = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(verifyResponse.body).toHaveProperty("projectId", targetProjectId);
    });

    it("should move workflow to Main Folder (projectId = null)", async () => {
      // First move to a project
      await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: targetProjectId });

      // Then move back to Main Folder
      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: null })
        .expect(200);

      expect(response.body).toHaveProperty("id", workflowId);
      expect(response.body.projectId).toBeNull();

      // Verify the workflow was actually moved to Main Folder
      const verifyResponse = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(verifyResponse.body.projectId).toBeNull();
    });

    it("should reject move to non-existent project", async () => {
      const fakeProjectId = "00000000-0000-0000-0000-000000000000";

      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: fakeProjectId })
        .expect(404);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("not found");
    });

    it("should reject move without authentication", async () => {
      await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .send({ projectId: targetProjectId })
        .expect(401);
    });



    it("should reject move of workflow user does not own", async () => {
      // Create a second user
      const email2 = `test-workflows-${nanoid()}@example.com`;
      const registerResponse2 = await request(ctx.baseURL)
        .post("/api/auth/register")
        .send({
          email: email2,
          password: "StrongTestPassword123!@#",
          fullName: "Test User 2",
          tenantId: ctx.tenantId,
        });

      if (registerResponse2.status !== 201) {
        console.log("DEBUG REGISTRATION FAILURE 1:", registerResponse2.status, registerResponse2.body);
      }

      const authToken2 = registerResponse2.body.token;

      // Try to move the first user's workflow as the second user
      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${authToken2}`)
        .send({ projectId: targetProjectId });

      if (response.status !== 403) {
        console.log("DEBUG FAILURE (user does not own):", response.status, response.text);
      }
      expect(response.status, `Expected 403 but got ${response.status}. Body: ${response.text}`).toBe(403);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("Access denied");
    });

    it("should reject move with invalid projectId format", async () => {
      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: "invalid-uuid" })
        .expect(400);

      expect(response.body).toHaveProperty("message");
    });

    it("should reject move without projectId in body", async () => {
      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("message");
    });

    it("should reject move to project user does not have access to", async () => {
      // Create a second user with their own project
      const email2 = `test-workflows-${nanoid()}@example.com`;
      const registerResponse2 = await request(ctx.baseURL)
        .post("/api/auth/register")
        .send({
          email: email2,
          password: "StrongTestPassword123!@#",
          fullName: "Test User 2",
          tenantId: ctx.tenantId,
        });

      const authToken2 = registerResponse2.body.token;
      const user2Id = registerResponse2.body.user?.id;

      await db.update(schema.users)
        .set({
          tenantId: ctx.tenantId,
          tenantRole: "owner",
          emailVerified: true
        })
        .where(eq(schema.users.id, user2Id));

      // Re-login to get updated token
      const loginResponse2 = await request(ctx.baseURL)
        .post("/api/auth/login")
        .send({
          email: email2,
          password: "StrongTestPassword123!@#"
        });

      if (loginResponse2.status !== 200) {
        throw new Error(`Login failed: ${loginResponse2.status} ${JSON.stringify(loginResponse2.body)}`);
      }
      if (!loginResponse2.body.token) {
        throw new Error("Login succeeded but no token returned");
      }

      const updatedAuthToken2 = loginResponse2.body.token;

      // Create a project owned by user 2
      const projectResponse2 = await request(ctx.baseURL)
        .post("/api/projects")
        .set("Authorization", `Bearer ${updatedAuthToken2}`)
        .send({
          name: "User 2 Project",
          description: "Project owned by user 2",
        });

      if (!projectResponse2.body.id) {
        throw new Error(`Project creation succeeded (201) but ID is missing. Body: ${JSON.stringify(projectResponse2.body)}`);
      }

      const user2ProjectId = projectResponse2.body.id;

      // Try to move user 1's workflow to user 2's project
      // if (!ctx.authToken) throw new Error("CTX AUTH TOKEN IS MISSING");
      // throw new Error(`DEBUG TEST TOKEN VALUE: ${ctx.authToken.substring(0, 20)}...`);

      const response = await request(ctx.baseURL)
        .put(`/api/workflows/${workflowId}/move`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({ projectId: user2ProjectId });

      expect(response.status, `Expected 403 but got ${response.status}. Body: ${response.text}`).toBe(403);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("Access denied");
      expect(response.body.message).toContain("target project");
    });
  });
});
