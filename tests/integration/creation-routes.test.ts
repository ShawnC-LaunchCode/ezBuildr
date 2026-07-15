/**
 * ICW-17 — E2E HTTP coverage for the manual interview-creation routes.
 *
 * Exercises the routes users hit most often over real HTTP (supertest against a
 * listening server, real JWT via register), locking in the error contracts that
 * Phase 1–2 established:
 *   - POST /api/workflows                                  (ICW-1)
 *   - POST /api/workflows/:id/sections
 *   - POST /api/workflows/:id/sections/:sectionId/steps    + simplified variant
 *   - aggregate size caps                                  (ICW-11)
 *
 * The caps cases set tiny limits by mutating the shared `LIMITS` object. `LIMITS`
 * resolves its env overrides once at import time (frozen values), so mutating
 * `process.env` mid-test is a no-op; the services read `LIMITS.MAX_*` at call
 * time from this same object reference, so a direct, restored mutation is the
 * reliable equivalent of an env override and exercises the real cap code path.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LIMITS } from "@shared/limits";
import * as schema from "@shared/schema";

import { db } from "../../server/db";
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";

let ctx: IntegrationTestContext;
let agent: ReturnType<typeof createAuthenticatedAgent>;

beforeAll(async () => {
  ctx = await setupIntegrationTest({
    createProject: true,
    userRole: "admin",
    tenantRole: "owner",
  });
  agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
});

afterAll(async () => {
  await ctx.cleanup();
});

/** Create a workflow (filed under the test project) and one section; return both ids. */
async function makeWorkflowWithSection(): Promise<{ workflowId: string; sectionId: string }> {
  const wfRes = await agent
    .post("/api/workflows")
    .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
  expect(wfRes.status).toBe(201);
  const workflowId = wfRes.body.id as string;

  const secRes = await agent
    .post(`/api/workflows/${workflowId}/sections`)
    .send({ title: "Section A" });
  expect(secRes.status).toBe(201);
  return { workflowId, sectionId: secRes.body.id as string };
}

describe("POST /api/workflows", () => {
  it("creates a workflow (201)", async () => {
    const res = await agent
      .post("/api/workflows")
      .send({ title: "My Interview", projectId: ctx.projectId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe("My Interview");
    expect(res.body.status).toBe("draft");
  });

  it("rejects a malformed body (400)", async () => {
    const res = await agent
      .post("/api/workflows")
      .send({ title: 123, projectId: ctx.projectId });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid workflow data");
    expect(res.body.errors).toBeDefined();
  });

  it("returns 404 for a nonexistent projectId", async () => {
    const res = await agent
      .post("/api/workflows")
      .send({ title: "Orphan", projectId: randomUUID() });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns 403 for a project the user cannot edit", async () => {
    // A project owned by a user in a different tenant — the caller has no ACL role.
    const [foreignTenant] = await db
      .insert(schema.tenants)
      .values({ name: `Foreign ${nanoid()}`, plan: "pro" })
      .returning();
    const foreignUser = await createTestUser(ctx, "owner", foreignTenant.id);
    const projRes = await request(ctx.baseURL)
      .post("/api/projects")
      .set("Authorization", `Bearer ${foreignUser.token}`)
      .send({ name: "Foreign Project" });
    expect(projRes.status).toBe(201);

    const res = await agent
      .post("/api/workflows")
      .send({ title: "Sneaky", projectId: projRes.body.id });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/access denied/i);

    // cleanup foreign tenant + its users to avoid FK debris across the suite
    await db.delete(schema.users).where(eq(schema.users.tenantId, foreignTenant.id));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, foreignTenant.id));
  });

  it("returns 401 without auth", async () => {
    const res = await request(ctx.baseURL)
      .post("/api/workflows")
      .send({ title: "No auth", projectId: ctx.projectId });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/workflows/:workflowId/sections", () => {
  it("creates a section with auto-order (201)", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const workflowId = wfRes.body.id as string;

    const res = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Page 2" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    // A fresh workflow already has an auto-created "Section 1" (order 1), so the
    // next section is auto-assigned order 2.
    expect(res.body.order).toBe(2);
  });

  it("returns 401 without auth", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const res = await request(ctx.baseURL)
      .post(`/api/workflows/${wfRes.body.id}/sections`)
      .send({ title: "Nope" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-collaborator (404 masked)", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const other = await createTestUser(ctx, "viewer");

    const res = await request(ctx.baseURL)
      .post(`/api/workflows/${wfRes.body.id}/sections`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ title: "Intruder" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/access denied/i);
  });

  it("returns 404 for a nonexistent workflow", async () => {
    const res = await agent
      .post(`/api/workflows/${randomUUID()}/sections`)
      .send({ title: "Ghost" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe("POST /api/workflows/:workflowId/sections/:sectionId/steps", () => {
  it("creates a step with a valid alias (201)", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();

    const res = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "First name", alias: "first_name" });

    expect(res.status).toBe(201);
    expect(res.body.alias).toBe("first_name");
    expect(res.body.order).toBe(1);
  });

  it("returns 400 for an invalid alias format", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();

    const res = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Bad", alias: "1st-question" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/variable names must/i);
  });

  it("returns 400 for a duplicate alias", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();

    const first = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Q1", alias: "email" });
    expect(first.status).toBe(201);

    const dup = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Q2", alias: "email" });

    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/already in use/i);
  });

  it("returns 400 for a config invalid for the step type (post ICW-10)", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();

    const res = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      // 'text' requires variant 'short' | 'long'; 'medium' is invalid.
      .send({ type: "text", title: "Bad config", config: { variant: "medium", validation: {} } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation error/i);
  });

  it("simplified route creates a step (201) — parity", async () => {
    const { sectionId } = await makeWorkflowWithSection();

    const res = await agent
      .post(`/api/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Via simplified route" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});

describe("aggregate size caps (ICW-11)", () => {
  const originalSections = LIMITS.MAX_SECTIONS_PER_WORKFLOW;
  const originalSteps = LIMITS.MAX_STEPS_PER_WORKFLOW;

  afterEach(() => {
    LIMITS.MAX_SECTIONS_PER_WORKFLOW = originalSections;
    LIMITS.MAX_STEPS_PER_WORKFLOW = originalSteps;
  });

  it("rejects section creation past the workflow cap (400)", async () => {
    LIMITS.MAX_SECTIONS_PER_WORKFLOW = 3;

    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `Cap WF ${nanoid()}`, projectId: ctx.projectId });
    const workflowId = wfRes.body.id as string;

    // Auto "Section 1" already counts (1). Two more reach the cap of 3.
    expect((await agent.post(`/api/workflows/${workflowId}/sections`).send({ title: "s2" })).status).toBe(201);
    expect((await agent.post(`/api/workflows/${workflowId}/sections`).send({ title: "s3" })).status).toBe(201);

    const overflow = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "s4" });
    expect(overflow.status).toBe(400);
    expect(overflow.body.message).toMatch(/section limit reached/i);
  });

  it("rejects step creation past the workflow cap (400)", async () => {
    LIMITS.MAX_STEPS_PER_WORKFLOW = 2;

    const { workflowId, sectionId } = await makeWorkflowWithSection();

    expect(
      (await agent.post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`).send({ type: "short_text", title: "q1" })).status
    ).toBe(201);
    expect(
      (await agent.post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`).send({ type: "short_text", title: "q2" })).status
    ).toBe(201);

    const overflow = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "q3" });
    expect(overflow.status).toBe(400);
    expect(overflow.body.message).toMatch(/question limit reached/i);
  });
});
