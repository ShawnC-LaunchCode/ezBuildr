import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";

/**
 * Expression Validation API Integration Tests
 *
 * Tests the workflow expression validation endpoints for:
 * - Expression syntax validation
 * - Variable scope checking
 * - Helper function availability
 * - Authentication/authorization
 */
describe("Expression Validation API Integration Tests", () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Test Tenant for Expression Validation",
      createProject: true,
      projectName: "Test Project for Expression Validation",
      userRole: "admin",
      tenantRole: "owner",
    });

    // Create a simple linear workflow: q1 -> q2 -> c1
    const workflowResponse = await request(ctx.baseURL)
      .post(`/api/projects/${ctx.projectId}/workflows`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({
        name: "Expression Validation Test Workflow",
        graphJson: {
          nodes: [
            {
              id: "q1",
              type: "question",
              config: {
                key: "age",
                questionText: "What is your age?",
                questionType: "number",
              },
            },
            {
              id: "q2",
              type: "question",
              config: {
                key: "name",
                questionText: "What is your name?",
                questionType: "text",
              },
            },
            {
              id: "c1",
              type: "compute",
              config: {
                expression: "age * 2",
                outputKey: "double_age",
              },
            },
          ],
          edges: [
            { id: "e1", source: "q1", target: "q2" },
            { id: "e2", source: "q2", target: "c1" },
          ],
          startNodeId: "q1",
        },
      })
      .expect(201);

    workflowId = workflowResponse.body.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("POST /api/workflows/validateExpression", () => {
    it("should validate a correct expression with valid variables", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "c1",
          expression: "age + 10",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should validate expression with string concatenation", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "c1",
          expression: "concat(name, ' is ', age, ' years old')",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should reject expression with invalid syntax", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "c1",
          expression: "age +", // Incomplete expression
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", false);
      expect(response.body.errors).toBeDefined();
    });

    it("should reject without authentication", async () => {
      await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .send({
          workflowId,
          nodeId: "c1",
          expression: "age + 10",
        })
        .expect(401);
    });

    it("should reject missing required fields", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          // Missing nodeId and expression
        })
        .expect(400);

      expect(response.body).toHaveProperty("ok", false);
    });
  });

  describe("GET /api/workflows/:id/availableVars/:nodeId", () => {
    it("should return available variables for a node", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/availableVars/c1`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("vars");
      expect(Array.isArray(response.body.vars)).toBe(true);

      // Compute node should have access to upstream question variables
      expect(response.body.vars).toContain("age");
      expect(response.body.vars).toContain("name");
    });

    it("should reject without authentication", async () => {
      await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/availableVars/c1`)
        .expect(401);
    });

    it("should reject non-existent workflow", async () => {
      await request(ctx.baseURL)
        .get(`/api/workflows/00000000-0000-0000-0000-000000000000/availableVars/c1`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(404);
    });
  });

  describe("GET /api/engine/helpers", () => {
    it("should return list of helper functions with metadata", async () => {
      const response = await request(ctx.baseURL)
        .get("/api/engine/helpers")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("helpers");
      expect(Array.isArray(response.body.helpers)).toBe(true);
      expect(response.body.helpers.length).toBeGreaterThan(0);

      // Check for expected helpers
      const helperNames = response.body.helpers.map((h: any) => h.name);
      expect(helperNames).toContain("round");
      expect(helperNames).toContain("concat");
      expect(helperNames).toContain("coalesce");
      expect(helperNames).toContain("isEmpty");
      expect(helperNames).toContain("upper");
      expect(helperNames).toContain("lower");

      // Verify helper structure
      const firstHelper = response.body.helpers[0];
      expect(firstHelper).toHaveProperty("name");
      expect(firstHelper).toHaveProperty("signature");
      expect(firstHelper).toHaveProperty("doc");
      expect(typeof firstHelper.name).toBe("string");
      expect(typeof firstHelper.signature).toBe("string");
      expect(typeof firstHelper.doc).toBe("string");
    });

    it("should reject without authentication", async () => {
      await request(ctx.baseURL)
        .get("/api/engine/helpers")
        .expect(401);
    });
  });
});
