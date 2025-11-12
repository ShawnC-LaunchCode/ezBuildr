import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "../../server/routes";
import { nanoid } from "nanoid";
import { db } from "../../server/db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

/**
 * Templates and Runs API Integration Tests
 */
describe("Templates and Runs API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5012;
        resolve(port);
      });
    });

    baseURL = `http://localhost:${port}`;

    // Setup tenant, user, project, and workflow
    const [tenant] = await db.insert(schema.tenants).values({
      name: "Test Tenant for Templates",
      plan: "free",
    }).returning();
    tenantId = tenant.id;

    const email = `test-templates-${nanoid()}@example.com`;
    const registerResponse = await request(baseURL)
      .post("/api/auth/register")
      .send({ email, password: "TestPassword123" })
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
      .send({ name: "Test Project" });
    projectId = projectResponse.body.id;

    // Create and publish workflow
    const workflowResponse = await request(baseURL)
      .post(`/api/projects/${projectId}/workflows`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "Test Workflow", graphJson: {} });
    workflowId = workflowResponse.body.id;

    await request(baseURL)
      .post(`/api/workflows/${workflowId}/publish`)
      .set("Authorization", `Bearer ${authToken}`);
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

  describe("Templates API", () => {
    describe("POST /api/projects/:projectId/templates", () => {
      it("should create template with file upload", async () => {
        // Create a mock .docx file (ZIP format)
        const mockDocx = Buffer.from("PK\x03\x04"); // ZIP file signature

        const response = await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Test Template")
          .attach("file", mockDocx, "test.docx")
          .expect(201);

        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("name", "Test Template");
        expect(response.body).toHaveProperty("fileRef");
        expect(response.body).toHaveProperty("type", "docx");
      });

      it("should reject non-docx files", async () => {
        const mockPdf = Buffer.from("%PDF");

        await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Test Template")
          .attach("file", mockPdf, "test.pdf")
          .expect(500); // Multer rejects before handler
      });

      it("should reject without file", async () => {
        await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Test Template")
          .expect(400);
      });
    });

    describe("GET /api/projects/:projectId/templates", () => {
      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", `List Test ${nanoid()}`)
          .attach("file", mockDocx, "test.docx");
      });

      it("should list templates", async () => {
        const response = await request(baseURL)
          .get(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
        expect(Array.isArray(response.body.items)).toBe(true);
        expect(response.body.items.length).toBeGreaterThan(0);
      });
    });

    describe("GET /api/templates/:id", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Get Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should get template by ID", async () => {
        const response = await request(baseURL)
          .get(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("id", templateId);
      });
    });

    describe("GET /api/templates/:id/placeholders", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Placeholder Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should extract placeholders", async () => {
        const response = await request(baseURL)
          .get(`/api/templates/${templateId}/placeholders`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("templateId", templateId);
        expect(response.body).toHaveProperty("placeholders");
        expect(Array.isArray(response.body.placeholders)).toBe(true);
      });
    });

    describe("PATCH /api/templates/:id", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Update Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should update template name", async () => {
        const response = await request(baseURL)
          .patch(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Updated Name")
          .expect(200);

        expect(response.body).toHaveProperty("name", "Updated Name");
      });
    });

    describe("DELETE /api/templates/:id", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(baseURL)
          .post(`/api/projects/${projectId}/templates`)
          .set("Authorization", `Bearer ${authToken}`)
          .field("name", "Delete Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should delete template", async () => {
        await request(baseURL)
          .delete(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(204);

        // Verify deletion
        await request(baseURL)
          .get(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(404);
      });
    });
  });

  describe("Runs API", () => {
    describe("POST /api/workflows/:id/run", () => {
      it("should execute workflow", async () => {
        const response = await request(baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            inputJson: { customer_name: "Test Customer" },
          })
          .expect(201);

        expect(response.body).toHaveProperty("runId");
        expect(response.body).toHaveProperty("status");
        expect(["success", "error"]).toContain(response.body.status);
      });

      it("should include logs in debug mode", async () => {
        const response = await request(baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({
            inputJson: { customer_name: "Test Customer" },
            options: { debug: true },
          })
          .expect(201);

        expect(response.body).toHaveProperty("logs");
        expect(Array.isArray(response.body.logs)).toBe(true);
      });

      it("should reject without required permission", async () => {
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
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${viewerResponse.body.token}`)
          .send({ inputJson: { customer_name: "Test" } })
          .expect(403);
      });
    });

    describe("GET /api/runs", () => {
      beforeEach(async () => {
        await request(baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
      });

      it("should list runs", async () => {
        const response = await request(baseURL)
          .get("/api/runs")
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
        expect(Array.isArray(response.body.items)).toBe(true);
      });

      it("should filter by workflowId", async () => {
        const response = await request(baseURL)
          .get(`/api/runs?workflowId=${workflowId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
      });
    });

    describe("GET /api/runs/:id", () => {
      let runId: string;

      beforeEach(async () => {
        const response = await request(baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
        runId = response.body.runId;
      });

      it("should get run by ID", async () => {
        const response = await request(baseURL)
          .get(`/api/runs/${runId}`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("id", runId);
        expect(response.body).toHaveProperty("status");
      });
    });

    describe("GET /api/runs/:id/logs", () => {
      let runId: string;

      beforeEach(async () => {
        const response = await request(baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
        runId = response.body.runId;
      });

      it("should get run logs", async () => {
        const response = await request(baseURL)
          .get(`/api/runs/${runId}/logs`)
          .set("Authorization", `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
        expect(Array.isArray(response.body.items)).toBe(true);
      });
    });
  });
});
