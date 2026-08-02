import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";

import { db } from "../../server/db";
import {
  setupIntegrationTest,
  createTestUser,
  createAuthenticatedAgent,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";

/**
 * Admin user-workflows API integration tests.
 *
 * Backs the /admin/users/:userId/workflows admin screen, which exists so an
 * admin can salvage (copy) or clear (delete) a departing user's workflows
 * before deleting the account. Both actions reach across ownership: the admin
 * has no ACL grant on the target user's workflows, so these routes are the
 * only path that works.
 */
describe.sequential("Admin user workflows API", () => {
  let ctx: IntegrationTestContext;
  let targetUserId: string;
  let targetUserToken: string;
  let adminAgent: ReturnType<typeof createAuthenticatedAgent>;

  const createWorkflowAs = async (token: string, title: string): Promise<string> => {
    const response = await request(ctx.baseURL)
      .post("/api/workflows")
      .set("Authorization", `Bearer ${token}`)
      .send({ title });

    if (response.status !== 201) {
      throw new Error(`Failed to create workflow: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.id;
  };

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Admin Workflows Tenant",
      userRole: "admin",
      tenantRole: "owner",
    });
    adminAgent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const targetUser = await createTestUser(ctx, "builder");
    targetUserId = targetUser.userId;
    targetUserToken = targetUser.token;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe("GET /api/admin/users/:userId/workflows", () => {
    it("returns another user's workflows to an admin, with run counts", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Target User Workflow");

      const response = await adminAgent.get(`/api/admin/users/${targetUserId}/workflows`);

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(targetUserId);

      const listed = response.body.workflows.find((w: { id: string }) => w.id === workflowId);
      expect(listed).toBeDefined();
      expect(listed.title).toBe("Target User Workflow");
      // No runs have been started, so the count is a zero-filled default rather
      // than a missing field — the delete dialog renders it directly.
      expect(listed.runCount).toBe(0);
    });

    it("does not list workflows belonging to a different user", async () => {
      const adminWorkflowId = await createWorkflowAs(ctx.authToken, "Admin Own Workflow");

      const response = await adminAgent.get(`/api/admin/users/${targetUserId}/workflows`);

      expect(response.status).toBe(200);
      expect(
        response.body.workflows.some((w: { id: string }) => w.id === adminWorkflowId)
      ).toBe(false);
    });

    it("returns 404 for a user that does not exist", async () => {
      const response = await adminAgent.get(
        "/api/admin/users/00000000-0000-0000-0000-000000000000/workflows"
      );

      expect(response.status).toBe(404);
    });

    it("denies a non-admin", async () => {
      const response = await request(ctx.baseURL)
        .get(`/api/admin/users/${targetUserId}/workflows`)
        .set("Authorization", `Bearer ${targetUserToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/admin/workflows/:workflowId/copy", () => {
    it("copies another user's workflow into the admin's own account", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Workflow To Salvage");

      const response = await adminAgent
        .post(`/api/admin/workflows/${workflowId}/copy`)
        .send({ name: "Salvaged Copy" });

      expect(response.status).toBe(201);
      expect(response.body.workflow.id).not.toBe(workflowId);

      const [copy] = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, response.body.workflow.id));

      expect(copy.creatorId).toBe(ctx.userId);
      expect(copy.title).toBe("Salvaged Copy");

      // The source is untouched — copy is a salvage step, not a move.
      const [source] = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, workflowId));
      expect(source).toBeDefined();
      expect(source.creatorId).toBe(targetUserId);
    });

    it("returns 404 for a workflow that does not exist", async () => {
      const response = await adminAgent
        .post("/api/admin/workflows/00000000-0000-0000-0000-000000000000/copy")
        .send({});

      expect(response.status).toBe(404);
    });

    it("rejects an invalid body", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Bad Body Workflow");

      const response = await adminAgent
        .post(`/api/admin/workflows/${workflowId}/copy`)
        .send({ name: "" });

      expect(response.status).toBe(400);
    });

    it("denies a non-admin", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Non Admin Copy Target");

      const response = await request(ctx.baseURL)
        .post(`/api/admin/workflows/${workflowId}/copy`)
        .set("Authorization", `Bearer ${targetUserToken}`)
        .send({});

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/admin/workflows/:workflowId", () => {
    it("deletes another user's workflow and removes it from the listing", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Workflow To Delete");

      const deleteResponse = await adminAgent.delete(`/api/admin/workflows/${workflowId}`);
      expect(deleteResponse.status).toBe(200);

      const listResponse = await adminAgent.get(`/api/admin/users/${targetUserId}/workflows`);
      expect(
        listResponse.body.workflows.some((w: { id: string }) => w.id === workflowId)
      ).toBe(false);

      const rows = await db
        .select()
        .from(schema.workflows)
        .where(eq(schema.workflows.id, workflowId));
      expect(rows).toHaveLength(0);
    });

    it("denies a non-admin", async () => {
      const workflowId = await createWorkflowAs(targetUserToken, "Non Admin Delete Target");

      const response = await request(ctx.baseURL)
        .delete(`/api/admin/workflows/${workflowId}`)
        .set("Authorization", `Bearer ${targetUserToken}`);

      expect(response.status).toBe(403);
    });
  });
});
