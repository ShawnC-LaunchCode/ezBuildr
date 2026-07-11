import _fs from "fs/promises";
import _path from "path";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { vi , describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import * as schema from "@shared/schema";

import { db } from "../../server/db";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
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
    saveTemplateFile: vi.fn().mockImplementation(async () => {
      return `test-file-${Math.random().toString(36).substring(7)}.docx`;
    }),
    deleteTemplateFile: vi.fn().mockResolvedValue(undefined),
    templateFileExists: vi.fn().mockResolvedValue(true),
    extractPlaceholders: vi.fn().mockResolvedValue(["{{name}}", "{{date}}"]),
    validateTemplate: vi.fn().mockResolvedValue({ valid: true, missingVars: [], extraVars: [] }),
  };
});
/**
 * Templates and Runs API Integration Tests
 *
 * Refactored to use integrationTestHelper for consistent setup/teardown
 */
describe("Templates API Integration Tests", () => {
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
      .post(`/api/workflows`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({
        title: "Test Workflow",
        projectId: ctx.projectId,
      })
      .expect(201);
    workflowId = workflowResponse.body.id;
    await request(ctx.baseURL)
      .post(`/api/workflows/${workflowId}/publish`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({ graphJson: { pages: [] } })
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
          .expect(201)
          .catch((err: unknown) => {
            if (err && typeof err === 'object' && 'response' in err) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const response = (err as any).response;
              if (response?.body) {
                console.error("DEBUG: Template upload failed:", JSON.stringify(response.body, null, 2));
              }
            }
            throw err;
          });
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
          .expect(400); // Multer/Validator rejects invalid file type
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
});