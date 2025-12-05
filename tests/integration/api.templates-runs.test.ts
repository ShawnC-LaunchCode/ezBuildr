import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
import { db } from "../../server/db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { vi } from "vitest";
import { templateScanner } from "../../server/services/document/TemplateScanner";

// Mock template scanner to avoid parsing invalid zip files
vi.mock("../../server/services/document/TemplateScanner", () => ({
  templateScanner: {
    scan: vi.fn().mockResolvedValue({
      placeholders: ["{{name}}", "{{date}}"],
      isValid: true
    }),
    scanAndFix: vi.fn().mockResolvedValue({
      placeholders: ["{{name}}", "{{date}}"],
      isValid: true,
      fixed: false,
      buffer: Buffer.from("PK\x03\x04"),
      repairs: []
    }),
    extractPlaceholders: vi.fn().mockResolvedValue(["{{name}}", "{{date}}"])
  }
}));

// Mock services/templates to avoid parsing invalid docx files
vi.mock("../../server/services/templates", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/templates")>("../../server/services/templates");
  return {
    ...actual,
    extractPlaceholders: vi.fn().mockResolvedValue(["{{name}}", "{{date}}"]),
  };
});

/**
 * Templates and Runs API Integration Tests
 *
 * Refactored to use integrationTestHelper for consistent setup/teardown
 */
describe("Templates and Runs API Integration Tests", () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;

  beforeAll(async () => {
    // Use integration test helper for consistent setup
    ctx = await setupIntegrationTest({
      tenantName: "Test Tenant for Templates",
      createProject: true,
      projectName: "Test Project",
      userRole: "admin",
      tenantRole: "owner",
    });

    // Create and publish workflow
    const workflowResponse = await request(ctx.baseURL)
      .post(`/api/projects/${ctx.ctx.projectId}/workflows`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({
        name: "Test Workflow",
        graphJson: {
          nodes: [
            {
              id: "node-1",
              type: "question",
              config: {
                key: "name",
                questionText: "What is your name?",
                questionType: "text"
              }
            }
          ],
          edges: [],
          startNodeId: "node-1"
        }
      })
      .expect(201);
    workflowId = workflowResponse.body.id;

    await request(ctx.baseURL)
      .post(`/api/workflows/${workflowId}/publish`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .expect(200);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("Templates API", () => {
    describe("POST /api/projects/:ctx.projectId/templates", () => {
      it("should create template with file upload", async () => {
        // Create a mock .docx file (ZIP format)
        const mockDocx = Buffer.from("PK\x03\x04"); // ZIP file signature

        const response = await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .attach("file", mockDocx, "test.docx")
          .field("name", "Test Template")
          .expect(201);

        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("name", "Test Template");
        expect(response.body).toHaveProperty("fileRef");
        expect(response.body).toHaveProperty("type", "docx");
      });

      it("should reject non-docx files", async () => {
        const mockPdf = Buffer.from("%PDF");

        await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Test Template")
          .attach("file", mockPdf, "test.pdf")
          .expect(500); // Multer rejects before handler
      });

      it("should reject without file", async () => {
        await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Test Template")
          .expect(400);
      });
    });

    describe("GET /api/projects/:ctx.projectId/templates", () => {
      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", `List Test ${nanoid()}`)
          .attach("file", mockDocx, "test.docx");
      });

      it("should list templates", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
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
        const response = await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Get Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should get template by ID", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("id", templateId);
      });
    });

    describe("GET /api/templates/:id/placeholders", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Placeholder Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should extract placeholders", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/templates/${templateId}/placeholders`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
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
        const response = await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Update Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should update template name", async () => {
        const response = await request(ctx.baseURL)
          .patch(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Updated Name")
          .expect(200);

        expect(response.body).toHaveProperty("name", "Updated Name");
      });
    });

    describe("DELETE /api/templates/:id", () => {
      let templateId: string;

      beforeEach(async () => {
        const mockDocx = Buffer.from("PK\x03\x04");
        const response = await request(ctx.baseURL)
          .post(`/api/projects/${ctx.projectId}/templates`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .field("name", "Delete Test")
          .attach("file", mockDocx, "test.docx");
        templateId = response.body.id;
      });

      it("should delete template", async () => {
        await request(ctx.baseURL)
          .delete(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(204);

        // Verify deletion
        await request(ctx.baseURL)
          .get(`/api/templates/${templateId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(404);
      });
    });
  });

  describe("Runs API", () => {
    describe("POST /api/workflows/:id/run", () => {
      it("should execute workflow", async () => {
        const response = await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .send({
            inputJson: { customer_name: "Test Customer" },
          })
          .expect(201);

        expect(response.body).toHaveProperty("runId");
        expect(response.body).toHaveProperty("status");
        expect(["success", "error"]).toContain(response.body.status);
      });

      it("should include logs in debug mode", async () => {
        const response = await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
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
        const viewerResponse = await request(ctx.baseURL)
          .post("/api/auth/register")
          .send({ email: viewerEmail, password: "TestPassword123" })
          .expect(201);

        await db.update(schema.users)
          .set({ tenantId, tenantRole: "viewer" })
          .where(eq(schema.users.id, viewerResponse.body.user.id));

        await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${viewerResponse.body.token}`)
          .send({ inputJson: { customer_name: "Test" } })
          .expect(403);
      });
    });

    describe("GET /api/runs", () => {
      beforeEach(async () => {
        await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
      });

      it("should list runs", async () => {
        const response = await request(ctx.baseURL)
          .get("/api/runs")
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
        expect(Array.isArray(response.body.items)).toBe(true);
      });

      it("should filter by workflowId", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/runs?workflowId=${workflowId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
      });
    });

    describe("GET /api/runs/:id", () => {
      let runId: string;

      beforeEach(async () => {
        const response = await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
        runId = response.body.runId;
      });

      it("should get run by ID", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/runs/${runId}`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("id", runId);
        expect(response.body).toHaveProperty("status");
      });
    });

    describe("GET /api/runs/:id/logs", () => {
      let runId: string;

      beforeEach(async () => {
        const response = await request(ctx.baseURL)
          .post(`/api/workflows/${workflowId}/run`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .send({ inputJson: { customer_name: "Test" } });
        runId = response.body.runId;
      });

      it("should get run logs", async () => {
        const response = await request(ctx.baseURL)
          .get(`/api/runs/${runId}/logs`)
          .set("Authorization", `Bearer ${ctx.authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty("items");
        expect(Array.isArray(response.body.items)).toBe(true);
      });
    });
  });
});
