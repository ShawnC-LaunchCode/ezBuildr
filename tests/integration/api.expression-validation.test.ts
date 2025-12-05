import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { setupIntegrationTest, createAuthenticatedAgent, type IntegrationTestContext } from "../helpers/integrationTestHelper";

/**
 * Expression Validation API Integration Tests
 *
 * Refactored to use integrationTestHelper for consistent setup/teardown
 */
describe("Expression Validation API Integration Tests", () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;

  beforeAll(async () => {
    // Use integration test helper for consistent setup
    ctx = await setupIntegrationTest({
      tenantName: "Test Tenant for Expression Validation",
      createProject: true,
      projectName: "Test Project for Expression Validation",
      userRole: "admin",
      tenantRole: "owner",
    });

    // Create workflow with some nodes
    const workflowResponse = await request(ctx.baseURL)
      .post(`/api/projects/${ctx.projectId}/workflows`)
      .set("Authorization", `Bearer ${ctx.authToken}`)
      .send({
        name: "Test Workflow for Expressions",
        graphJson: {
          nodes: [
            {
              id: "node_1",
              type: "question",
              config: {
                key: "age",
                inputType: "number",
                required: true,
              },
            },
            {
              id: "node_2",
              type: "compute",
              config: {
                expression: "age * 2",
                outputKey: "double_age",
              },
            },
          ],
          edges: [{ id: "edge_1", source: "node_1", target: "node_2" }],
          startNodeId: "node_1",
        },
      })
      .expect(201);

    workflowId = workflowResponse.body.id;
  });

  afterAll(async () => {
    // Use helper's cleanup function
    await ctx.cleanup();
  });

  describe("POST /api/workflows/validateExpression", () => {
    it("should validate a correct expression", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "node_2",
          expression: "age + 10",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should reject expression with unknown variable", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "node_2",
          expression: "unknown_var + 10",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", false);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(response.body.errors[0].message).toContain("unknown_var");
    });

    it("should validate expression with helper function", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "node_2",
          expression: "round(age * 1.5, 2)",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should reject invalid syntax", async () => {
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId,
          nodeId: "node_2",
          expression: "age +",
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
          nodeId: "node_2",
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
        .get(`/api/workflows/${workflowId}/availableVars/node_2`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("vars");
      expect(Array.isArray(response.body.vars)).toBe(true);
      expect(response.body.vars).toContain("age");
    });

    it("should return empty array for first node", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/availableVars/node_1`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("vars");
      expect(response.body.vars).toEqual([]);
    });

    it("should reject without authentication", async () => {
      await request(ctx.baseURL)
        .get(`/api/workflows/${workflowId}/availableVars/node_2`)
        .expect(401);
    });

    it("should reject non-existent workflow", async () => {
      await request(ctx.baseURL)
        .get(`/api/workflows/non-existent-id/availableVars/node_2`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(404);
    });
  });

  describe("GET /api/engine/helpers", () => {
    it("should return list of helper functions", async () => {
      const response = await request(ctx.baseURL)
        .get("/api/engine/helpers")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("helpers");
      expect(Array.isArray(response.body.helpers)).toBe(true);
      expect(response.body.helpers.length).toBeGreaterThan(0);

      // Check for some expected helpers
      const helperNames = response.body.helpers.map((h: any) => h.name);
      expect(helperNames).toContain("round");
      expect(helperNames).toContain("coalesce");
      expect(helperNames).toContain("isEmpty");

      // Check helper structure
      const firstHelper = response.body.helpers[0];
      expect(firstHelper).toHaveProperty("name");
      expect(firstHelper).toHaveProperty("signature");
      expect(firstHelper).toHaveProperty("doc");
    });

    it("should reject without authentication", async () => {
      await request(ctx.baseURL)
        .get("/api/engine/helpers")
        .expect(401);
    });
  });

  describe("Expression validation with complex graph", () => {
    it("should validate expressions with variables from multiple upstream nodes", async () => {
      // Create a more complex workflow
      const complexWorkflowResponse = await request(ctx.baseURL)
        .post(`/api/projects/${projectId}/workflows`)
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          name: "Complex Workflow",
          graphJson: {
            nodes: [
              {
                id: "q1",
                type: "question",
                config: { key: "name", inputType: "text" },
              },
              {
                id: "q2",
                type: "question",
                config: { key: "age", inputType: "number" },
              },
              {
                id: "c1",
                type: "compute",
                config: { expression: "age * 2", outputKey: "double_age" },
              },
              {
                id: "c2",
                type: "compute",
                config: {
                  expression: "concat(name, ' is ', double_age, ' years old (doubled)')",
                  outputKey: "message",
                },
              },
            ],
            edges: [
              { id: "e1", source: "q1", target: "c1" },
              { id: "e2", source: "q2", target: "c1" },
              { id: "e3", source: "c1", target: "c2" },
            ],
            startNodeId: "q1",
          },
        })
        .expect(201);

      const complexWorkflowId = complexWorkflowResponse.body.id;

      // Validate expression in c2 that uses variables from q1 and c1
      const response = await request(ctx.baseURL)
        .post("/api/workflows/validateExpression")
        .set("Authorization", `Bearer ${ctx.authToken}`)
        .send({
          workflowId: complexWorkflowId,
          nodeId: "c2",
          expression: "concat(name, ' doubled: ', double_age)",
        })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });
  });
});
