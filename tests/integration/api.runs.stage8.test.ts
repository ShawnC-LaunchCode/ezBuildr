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
 * Stage 8: Runs API Integration Tests
 * Tests for enhanced runs features: filters, rerun, export, compare
 */
describe("Stage 8: Runs API Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;
  let authToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let workflowId: string;
  let workflowVersionId: string;
  let runId1: string;
  let runId2: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    server = await registerRoutes(app);

    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5013;
        resolve(port);
      });
    });

    baseURL = `http://localhost:${port}`;

    // Setup tenant
    const [tenant] = await db.insert(schema.tenants).values({
      name: "Test Tenant for Runs Stage 8",
      plan: "pro",
    }).returning();
    tenantId = tenant.id;

    // Setup user
    const email = `test-runs-stage8-${nanoid()}@example.com`;
    const [user] = await db.insert(schema.users).values({
      email,
      passwordHash: "hashed_password",
      tenantId,
      tenantRole: "builder",
    }).returning();
    userId = user.id;

    // Mock auth token (in real app this would come from auth flow)
    authToken = `mock-token-${userId}`;

    // Create project
    const [project] = await db.insert(schema.projects).values({
      name: "Test Project for Runs",
      tenantId,
      createdBy: userId,
    }).returning();
    projectId = project.id;

    // Create workflow
    const [workflow] = await db.insert(schema.workflows).values({
      name: "Test Workflow",
      projectId,
      createdBy: userId,
      status: "active",
      graphJson: { nodes: [], edges: [] },
    }).returning();
    workflowId = workflow.id;

    // Create and publish workflow version
    const [version] = await db.insert(schema.workflowVersions).values({
      workflowId,
      name: "v1.0",
      graphJson: { nodes: [], edges: [] },
      published: true,
      publishedAt: new Date(),
      publishedBy: userId,
    }).returning();
    workflowVersionId = version.id;

    // Create test runs
    const [run1] = await db.insert(schema.runs).values({
      workflowVersionId,
      inputJson: { name: "Alice", age: 30 },
      outputRefs: { document: { fileRef: "test-output-1.docx" } },
      status: "success",
      durationMs: 1500,
      createdBy: userId,
      trace: [
        {
          nodeId: "node1",
          type: "input",
          status: "executed",
          timestamp: new Date().toISOString(),
        },
      ],
    }).returning();
    runId1 = run1.id;

    const [run2] = await db.insert(schema.runs).values({
      workflowVersionId,
      inputJson: { name: "Bob", age: 25 },
      outputRefs: { document: { fileRef: "test-output-2.docx" } },
      status: "success",
      durationMs: 1200,
      createdBy: userId,
      trace: [
        {
          nodeId: "node1",
          type: "input",
          status: "executed",
          timestamp: new Date().toISOString(),
        },
      ],
    }).returning();
    runId2 = run2.id;

    // Create a failed run
    await db.insert(schema.runs).values({
      workflowVersionId,
      inputJson: { name: "Charlie", age: 40 },
      status: "error",
      error: "Test error message",
      durationMs: 500,
      createdBy: userId,
    });

    // Create run logs
    await db.insert(schema.runLogs).values([
      {
        runId: runId1,
        nodeId: "node1",
        level: "info",
        message: "Test log message 1",
      },
      {
        runId: runId2,
        nodeId: "node1",
        level: "info",
        message: "Test log message 2",
      },
    ]);
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

  describe("GET /api/runs", () => {
    it("should list all runs with pagination", async () => {
      // Note: This test assumes auth middleware is mocked or bypassed in test environment
      // In production, you'd need to properly authenticate with Bearer token or session

      const response = await request(baseURL)
        .get("/api/runs")
        .query({ limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it("should filter runs by status", async () => {
      const response = await request(baseURL)
        .get("/api/runs")
        .query({ status: "success", limit: 10 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      response.body.items.forEach((run: any) => {
        expect(run.status).toBe("success");
      });
    });

    it("should filter runs by workflow", async () => {
      const response = await request(baseURL)
        .get("/api/runs")
        .query({ workflowId, limit: 10 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      response.body.items.forEach((run: any) => {
        expect(run.workflowVersion.workflow.id).toBe(workflowId);
      });
    });

    it("should filter runs by project", async () => {
      const response = await request(baseURL)
        .get("/api/runs")
        .query({ projectId, limit: 10 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      response.body.items.forEach((run: any) => {
        expect(run.workflowVersion.workflow.projectId).toBe(projectId);
      });
    });

    it("should filter runs by date range", async () => {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
      const to = new Date().toISOString();

      const response = await request(baseURL)
        .get("/api/runs")
        .query({ from, to, limit: 10 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      response.body.items.forEach((run: any) => {
        const createdAt = new Date(run.createdAt);
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(new Date(from).getTime());
        expect(createdAt.getTime()).toBeLessThanOrEqual(new Date(to).getTime());
      });
    });

    it("should search runs by query string", async () => {
      const response = await request(baseURL)
        .get("/api/runs")
        .query({ q: "Alice", limit: 10 })
        .expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      // At least one run should match the search
      const hasMatch = response.body.items.some((run: any) =>
        JSON.stringify(run.inputJson).includes("Alice")
      );
      expect(hasMatch).toBe(true);
    });
  });

  describe("GET /api/runs/:id", () => {
    it("should get run by ID with all details", async () => {
      const response = await request(baseURL)
        .get(`/api/runs/${runId1}`)
        .expect(200);

      expect(response.body).toHaveProperty("id", runId1);
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("inputJson");
      expect(response.body).toHaveProperty("outputRefs");
      expect(response.body).toHaveProperty("trace");
      expect(response.body).toHaveProperty("durationMs");
      expect(response.body).toHaveProperty("workflowVersion");
    });

    it("should return 404 for non-existent run", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await request(baseURL)
        .get(`/api/runs/${fakeId}`)
        .expect(404);
    });
  });

  describe("GET /api/runs/:id/logs", () => {
    it("should get logs for a run", async () => {
      const response = await request(baseURL)
        .get(`/api/runs/${runId1}/logs`)
        .query({ limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty("items");
      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.items.length).toBeGreaterThan(0);

      const log = response.body.items[0];
      expect(log).toHaveProperty("runId", runId1);
      expect(log).toHaveProperty("level");
      expect(log).toHaveProperty("message");
    });
  });

  describe("POST /api/runs/:id/rerun", () => {
    it("should re-run workflow with same inputs", async () => {
      const response = await request(baseURL)
        .post(`/api/runs/${runId1}/rerun`)
        .send({})
        .expect(201);

      expect(response.body).toHaveProperty("runId");
      expect(response.body).toHaveProperty("status");
      expect(response.body.runId).not.toBe(runId1); // New run ID

      // Verify new run was created
      const newRunId = response.body.runId;
      const newRun = await db.query.runs.findFirst({
        where: eq(schema.runs.id, newRunId),
      });

      expect(newRun).toBeDefined();
      expect(newRun?.inputJson).toEqual({ name: "Alice", age: 30 });
    });

    it("should re-run workflow with override inputs", async () => {
      const response = await request(baseURL)
        .post(`/api/runs/${runId1}/rerun`)
        .send({
          overrideInputJson: { age: 35 }, // Override age but keep name
        })
        .expect(201);

      expect(response.body).toHaveProperty("runId");

      // Verify new run has merged inputs
      const newRunId = response.body.runId;
      const newRun = await db.query.runs.findFirst({
        where: eq(schema.runs.id, newRunId),
      });

      expect(newRun).toBeDefined();
      expect(newRun?.inputJson).toEqual({ name: "Alice", age: 35 });
    });

    it("should return 404 for non-existent run", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await request(baseURL)
        .post(`/api/runs/${fakeId}/rerun`)
        .send({})
        .expect(404);
    });
  });

  describe("GET /api/runs/export.csv", () => {
    it("should export runs to CSV", async () => {
      const response = await request(baseURL)
        .get("/api/runs/export.csv")
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');

      const csvContent = response.text;
      expect(csvContent).toContain('runId,projectId,workflowId,workflowName');
      expect(csvContent.split('\n').length).toBeGreaterThan(1); // Header + at least one row
    });

    it("should export runs with filters applied", async () => {
      const response = await request(baseURL)
        .get("/api/runs/export.csv")
        .query({ status: "success" })
        .expect(200);

      const csvContent = response.text;
      expect(csvContent).toContain('success');
      expect(csvContent).not.toContain('error'); // Filtered out error runs
    });
  });

  describe("GET /api/runs/compare", () => {
    it("should compare two runs", async () => {
      const response = await request(baseURL)
        .get("/api/runs/compare")
        .query({ runA: runId1, runB: runId2 })
        .expect(200);

      expect(response.body).toHaveProperty("runA");
      expect(response.body).toHaveProperty("runB");
      expect(response.body).toHaveProperty("summaryDiff");

      expect(response.body.runA.id).toBe(runId1);
      expect(response.body.runB.id).toBe(runId2);

      const diff = response.body.summaryDiff;
      expect(diff).toHaveProperty("inputsChangedKeys");
      expect(diff).toHaveProperty("outputsChangedKeys");
      expect(diff).toHaveProperty("statusMatch");
      expect(diff).toHaveProperty("durationDiff");

      // Both are success status
      expect(diff.statusMatch).toBe(true);
    });

    it("should identify changed input keys", async () => {
      const response = await request(baseURL)
        .get("/api/runs/compare")
        .query({ runA: runId1, runB: runId2 })
        .expect(200);

      const diff = response.body.summaryDiff;
      // Name and age are different between Alice(30) and Bob(25)
      expect(diff.inputsChangedKeys).toContain("name");
      expect(diff.inputsChangedKeys).toContain("age");
    });

    it("should return 404 if run A not found", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await request(baseURL)
        .get("/api/runs/compare")
        .query({ runA: fakeId, runB: runId2 })
        .expect(404);
    });

    it("should return 404 if run B not found", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await request(baseURL)
        .get("/api/runs/compare")
        .query({ runA: runId1, runB: fakeId })
        .expect(404);
    });
  });

  describe("RBAC and Tenant Isolation", () => {
    it("should enforce tenant isolation on runs list", async () => {
      // Create another tenant
      const [otherTenant] = await db.insert(schema.tenants).values({
        name: "Other Tenant",
        plan: "free",
      }).returning();

      // Create user in other tenant
      const [otherUser] = await db.insert(schema.users).values({
        email: `other-${nanoid()}@example.com`,
        passwordHash: "hashed_password",
        tenantId: otherTenant.id,
        tenantRole: "builder",
      }).returning();

      // Create project and workflow in other tenant
      const [otherProject] = await db.insert(schema.projects).values({
        name: "Other Project",
        tenantId: otherTenant.id,
        createdBy: otherUser.id,
      }).returning();

      const [otherWorkflow] = await db.insert(schema.workflows).values({
        name: "Other Workflow",
        projectId: otherProject.id,
        createdBy: otherUser.id,
        status: "active",
        graphJson: { nodes: [], edges: [] },
      }).returning();

      const [otherVersion] = await db.insert(schema.workflowVersions).values({
        workflowId: otherWorkflow.id,
        name: "v1.0",
        graphJson: { nodes: [], edges: [] },
        published: true,
        publishedAt: new Date(),
        publishedBy: otherUser.id,
      }).returning();

      // Create run in other tenant
      await db.insert(schema.runs).values({
        workflowVersionId: otherVersion.id,
        inputJson: { data: "other tenant data" },
        status: "success",
        createdBy: otherUser.id,
      });

      // List runs as original user (should not see other tenant's runs)
      const response = await request(baseURL)
        .get("/api/runs")
        .query({ limit: 100 })
        .expect(200);

      const otherTenantRuns = response.body.items.filter((run: any) =>
        run.workflowVersion?.workflow?.projectId === otherProject.id
      );

      expect(otherTenantRuns.length).toBe(0);

      // Cleanup
      await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenant.id));
    });
  });
});
