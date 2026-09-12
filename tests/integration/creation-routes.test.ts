/**
 * ICW-17 — E2E HTTP coverage for the manual interview-creation routes.
 *
 * Exercises the routes users hit most often over real HTTP (supertest against a
 * listening server, real JWT via register), locking in the error contracts that
 * Phase 1–2 established:
 *   - POST /api/workflows                                  (ICW-1)
 *   - POST /api/workflows/:id/pages
 *   - POST /api/workflows/:id/pages/:pageId/steps    + simplified variant
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
import { buildTestWhen } from "../helpers/conditionFixtures";

import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { expectCrossTenantDenied } from '../helpers/expectDenied';

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

/** Create a workflow (filed under the test project) and one page; return both ids. */
async function makeWorkflowWithPage(): Promise<{ workflowId: string; pageId: string }> {
  const wfRes = await agent
    .post("/api/workflows")
    .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
  expect(wfRes.status).toBe(201);
  const workflowId = wfRes.body.id as string;

  const pageResponse = await agent
    .post(`/api/workflows/${workflowId}/pages`)
    .send({ title: "Page A" });
  expect(pageResponse.status).toBe(201);
  return { workflowId, pageId: pageResponse.body.id as string };
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
    const [foreignTenant] = await getOwnerDb()
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

    expectCrossTenantDenied(res.status);

    // cleanup foreign tenant + its users to avoid FK debris across the suite
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenant.id));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenant.id));
  });

  it("returns 401 without auth", async () => {
    const res = await request(ctx.baseURL)
      .post("/api/workflows")
      .send({ title: "No auth", projectId: ctx.projectId });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/workflows/:workflowId/pages", () => {
  it("creates a page with auto-order (201)", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const workflowId = wfRes.body.id as string;

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Page 2" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    // A fresh workflow already has an auto-created "Page 1" (order 1), so the
    // next page is auto-assigned order 2.
    expect(res.body.order).toBe(2);
  });

  it("returns 401 without auth", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const res = await request(ctx.baseURL)
      .post(`/api/workflows/${wfRes.body.id}/pages`)
      .send({ title: "Nope" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-collaborator (404 masked)", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `WF ${nanoid()}`, projectId: ctx.projectId });
    const other = await createTestUser(ctx, "viewer");

    const res = await request(ctx.baseURL)
      .post(`/api/workflows/${wfRes.body.id}/pages`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ title: "Intruder" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/access denied/i);
  });

  it("returns 404 for a nonexistent workflow", async () => {
    const res = await agent
      .post(`/api/workflows/${randomUUID()}/pages`)
      .send({ title: "Ghost" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe("POST /api/workflows/:workflowId/pages/:pageId/steps", () => {
  it("creates a step with a valid alias (201)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "First name", alias: "first_name", config: { variant: "short" } });

    expect(res.status).toBe(201);
    expect(res.body.alias).toBe("first_name");
    expect(res.body.order).toBe(1);
  });

  it("creates a 'list' step and reads it back with type 'list' (LIST-1)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "list", title: "Children", config: { fields: [] } });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("list");

    const getRes = await agent.get(`/api/steps/${res.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.type).toBe("list");
  });

  it("rejects a 'list' step whose config has a field with a malformed alias (LIST2-3 AC1)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({
        type: "list",
        title: "Children",
        config: {
          fields: [
            { kind: "question", id: "f-1", alias: "2bad", type: "text", title: "Bad alias", order: 0, config: { variant: "short" } },
          ],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation error/i);
  });

  it("rejects a 'list' step config nested deeper than the max depth (LIST2-3 AC3)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    // LIST_VALIDATION_MAX_DEPTH is 3; nest one level past it (4 ListConfig levels).
    const config = {
      fields: [
        {
          kind: "list", id: "f-1", alias: "level1", title: "Level 1", order: 0,
          list: {
            fields: [
              {
                kind: "list", id: "f-2", alias: "level2", title: "Level 2", order: 0,
                list: {
                  fields: [
                    {
                      kind: "list", id: "f-3", alias: "level3", title: "Level 3", order: 0,
                      list: {
                        fields: [
                          { kind: "question", id: "f-4", alias: "leaf", type: "text", title: "Leaf", order: 0, config: { variant: "short" } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "list", title: "Too Deep", config });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation error/i);
  });

  it("returns 400 for an invalid alias format", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Bad", alias: "1st-question", config: { variant: "short" } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/variable names must/i);
  });

  it("returns 400 for a duplicate alias", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const first = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Q1", alias: "email", config: { variant: "short" } });
    expect(first.status).toBe(201);

    const dup = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Q2", alias: "email", config: { variant: "short" } });

    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/already in use/i);
  });

  it("returns 400 for a config invalid for the step type (post ICW-10)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      // 'text' requires variant 'short' | 'long'; 'medium' is invalid.
      .send({ type: "text", title: "Bad config", config: { variant: "medium", validation: {} } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation error/i);
  });

  it("simplified route creates a step (201) — parity", async () => {
    const { pageId } = await makeWorkflowWithPage();

    const res = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: "text", title: "Via simplified route", config: { variant: "short" } });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });
});

describe("aggregate size caps (ICW-11)", () => {
  const originalPages = LIMITS.MAX_PAGES_PER_WORKFLOW;
  const originalSteps = LIMITS.MAX_STEPS_PER_WORKFLOW;

  afterEach(() => {
    LIMITS.MAX_PAGES_PER_WORKFLOW = originalPages;
    LIMITS.MAX_STEPS_PER_WORKFLOW = originalSteps;
  });

  it("rejects page creation past the workflow cap (400)", async () => {
    LIMITS.MAX_PAGES_PER_WORKFLOW = 3;

    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `Cap WF ${nanoid()}`, projectId: ctx.projectId });
    const workflowId = wfRes.body.id as string;

    // Auto "Page 1" already counts (1). Two more reach the cap of 3.
    expect((await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: "s2" })).status).toBe(201);
    expect((await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: "s3" })).status).toBe(201);

    const overflow = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "s4" });
    expect(overflow.status).toBe(400);
    expect(overflow.body.message).toMatch(/page limit reached/i);
  });

  it("rejects step creation past the workflow cap (400)", async () => {
    LIMITS.MAX_STEPS_PER_WORKFLOW = 2;

    const { workflowId, pageId } = await makeWorkflowWithPage();

    expect(
      (await agent.post(`/api/workflows/${workflowId}/pages/${pageId}/steps`).send({ type: "text", title: "q1", config: { variant: "short" } })).status
    ).toBe(201);
    expect(
      (await agent.post(`/api/workflows/${workflowId}/pages/${pageId}/steps`).send({ type: "text", title: "q2", config: { variant: "short" } })).status
    ).toBe(201);

    const overflow = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "q3", config: { variant: "short" } });
    expect(overflow.status).toBe(400);
    expect(overflow.body.message).toMatch(/question limit reached/i);
  });
});

describe("edit role required for structural mutations (ICW2-1)", () => {
  let workflowId: string;
  let pageId: string;
  let sharedAgent: ReturnType<typeof createAuthenticatedAgent>;
  let aclEntryId: string;

  beforeAll(async () => {
    // Unfiled workflow owned by the main user, so the shared user's only
    // access comes from the direct workflow ACL row inserted below (no
    // project-role inheritance in play).
    const wfRes = await agent.post("/api/workflows").send({ title: `ACL WF ${nanoid()}` });
    expect(wfRes.status).toBe(201);
    workflowId = wfRes.body.id as string;

    const pageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Owner page" });
    expect(pageResponse.status).toBe(201);
    pageId = pageResponse.body.id as string;

    // 'builder' tenant role so tenant RBAC is not the limiter — the ACL role is.
    const sharedUser = await createTestUser(ctx, "builder");
    sharedAgent = createAuthenticatedAgent(ctx.baseURL, sharedUser.token);

    const [aclEntry] = await getOwnerDb()
      .insert(schema.workflowAccess)
      .values({
        workflowId,
        principalType: "user",
        principalId: sharedUser.userId,
        role: "view",
      })
      .returning();
    aclEntryId = aclEntry.id;
  });

  it("view role can read but gets 403 on page and step mutations", async () => {
    const read = await sharedAgent.get(`/api/workflows/${workflowId}`);
    expect(read.status).toBe(200);

    const createPage = await sharedAgent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Not allowed" });
    expect(createPage.status).toBe(403);
    expect(createPage.body.message).toMatch(/access denied/i);

    const createStep = await sharedAgent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Not allowed", config: { variant: "short" } });
    expect(createStep.status).toBe(403);

    const reorder = await sharedAgent
      .put(`/api/workflows/${workflowId}/pages/reorder`)
      .send({ pages: [{ id: pageId, order: 3, sectionId: null }] });
    expect(reorder.status).toBe(403);
  });

  it("the same mutations succeed once the ACL role is raised to edit", async () => {
    await getOwnerDb()
      .update(schema.workflowAccess)
      .set({ role: "edit" })
      .where(eq(schema.workflowAccess.id, aclEntryId));

    const createPage = await sharedAgent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Editor page" });
    expect(createPage.status).toBe(201);

    const createStep = await sharedAgent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Editor question", config: { variant: "short" } });
    expect(createStep.status).toBe(201);
  });
});

describe("reorder ids are scoped to their workflow/page (ICW2-1)", () => {
  it("page reorder containing a foreign workflow's page id → 404, no rows changed", async () => {
    const mine = await makeWorkflowWithPage();
    const other = await makeWorkflowWithPage();

    const orderOf = async (id: string): Promise<number> => {
      const [row] = await getOwnerDb()
        .select({ order: schema.pages.order })
        .from(schema.pages)
        .where(eq(schema.pages.id, id));
      return row.order;
    };
    const mineBefore = await orderOf(mine.pageId);
    const otherBefore = await orderOf(other.pageId);

    const res = await agent
      .put(`/api/workflows/${mine.workflowId}/pages/reorder`)
      .send({
        pages: [
          { id: mine.pageId, order: 7, sectionId: null },
          { id: other.pageId, order: 9, sectionId: null },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);

    // The foreign row is untouched, and the transactional reorder rolled back
    // the in-scope update too.
    expect(await orderOf(other.pageId)).toBe(otherBefore);
    expect(await orderOf(mine.pageId)).toBe(mineBefore);
  });

  it("step reorder containing a step id from another page → 404, no rows changed", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const otherPageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Page B" });
    expect(otherPageResponse.status).toBe(201);
    const otherPageId = otherPageResponse.body.id as string;

    const mkStep = async (targetPageId: string, title: string): Promise<string> => {
      const res = await agent
        .post(`/api/workflows/${workflowId}/pages/${targetPageId}/steps`)
        .send({ type: "text", title, config: { variant: "short" } });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const myStepId = await mkStep(pageId, "Mine");
    const foreignStepId = await mkStep(otherPageId, "Foreign");

    const orderOf = async (id: string): Promise<number> => {
      const [row] = await getOwnerDb()
        .select({ order: schema.steps.order })
        .from(schema.steps)
        .where(eq(schema.steps.id, id));
      return row.order;
    };
    const myBefore = await orderOf(myStepId);
    const foreignBefore = await orderOf(foreignStepId);

    const res = await agent
      .put(`/api/workflows/${workflowId}/pages/${pageId}/steps/reorder`)
      .send({
        steps: [
          { id: myStepId, order: 4 },
          { id: foreignStepId, order: 5 },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);

    expect(await orderOf(foreignStepId)).toBe(foreignBefore);
    expect(await orderOf(myStepId)).toBe(myBefore);
  });
});

describe("update payloads cannot mass-assign immutable/server-controlled fields (QA-SEC)", () => {
  it("PUT /api/steps/:id ignores a client-supplied id (no primary-key rewrite)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const created = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Original", config: { variant: "short" } });
    expect(created.status).toBe(201);
    const stepId = created.body.id as string;
    const hijackId = randomUUID();

    const res = await agent
      .put(`/api/steps/${stepId}`)
      .send({ title: "Renamed", id: hijackId });

    // The legitimate field updates, but the primary key is untouched.
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(stepId);
    expect(res.body.title).toBe("Renamed");

    // The row still lives at its original id; the attacker-chosen id never existed.
    const [row] = await getOwnerDb()
      .select({ id: schema.steps.id })
      .from(schema.steps)
      .where(eq(schema.steps.id, stepId));
    expect(row?.id).toBe(stepId);
    const hijackRows = await getOwnerDb()
      .select({ id: schema.steps.id })
      .from(schema.steps)
      .where(eq(schema.steps.id, hijackId));
    expect(hijackRows).toHaveLength(0);
  });

  it("PUT /api/pages/:id ignores a client-supplied workflowId (no cross-workflow reparent)", async () => {
    const { pageId, workflowId } = await makeWorkflowWithPage();

    // A second user's workflow the caller has no access to — the reparent target.
    const other = await createTestUser(ctx, "owner");
    const otherAgent = createAuthenticatedAgent(ctx.baseURL, other.token);
    const otherWf = await otherAgent.post("/api/workflows").send({ title: `Foreign ${nanoid()}` });
    expect(otherWf.status).toBe(201);
    const foreignWorkflowId = otherWf.body.id as string;

    const res = await agent
      .put(`/api/pages/${pageId}`)
      .send({ title: "Renamed", workflowId: foreignWorkflowId });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed");
    // Crucially, the page stays in the caller's workflow.
    expect(res.body.workflowId).toBe(workflowId);

    const [row] = await getOwnerDb()
      .select({ workflowId: schema.pages.workflowId })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId));
    expect(row?.workflowId).toBe(workflowId);
    expect(row?.workflowId).not.toBe(foreignWorkflowId);
  });
});

describe("cross-page step moves assign proper order (ICW2-5)", () => {
  it("moving a step to another page appends it to the end by default", async () => {
    const { workflowId, pageId: srcPageId } = await makeWorkflowWithPage();
    
    // Create destination page
    const destinationPageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Dest Page" });
    const destPageId = destinationPageResponse.body.id as string;

    // Create steps in dest page to bump the max order
    await agent.post(`/api/workflows/${workflowId}/pages/${destPageId}/steps`).send({ type: "text", title: "Dest Step 1", config: { variant: "short" } });
    await agent.post(`/api/workflows/${workflowId}/pages/${destPageId}/steps`).send({ type: "text", title: "Dest Step 2", config: { variant: "short" } });

    // Create step in source page
    const mkRes = await agent.post(`/api/workflows/${workflowId}/pages/${srcPageId}/steps`).send({ type: "text", title: "Moving Step", config: { variant: "short" } });
    const movingStepId = mkRes.body.id as string;

    // Move step via simplified PUT endpoint
    const moveRes = await agent
      .put(`/api/steps/${movingStepId}`)
      .send({ pageId: destPageId });
    
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.order).toBe(3); // Should append after the 2 existing steps
  });
});

describe("workflow settings persist across save + reload (ICW2-9)", () => {
  it("stores branding/behavior/publishing settings and returns them on reload", async () => {
    const wfRes = await agent
      .post("/api/workflows")
      .send({ title: `Settings WF ${nanoid()}`, projectId: ctx.projectId });
    expect(wfRes.status).toBe(201);
    const workflowId = wfRes.body.id as string;

    const settings = {
      brandingEnabled: true,
      logoUrl: "https://example.test/logo.png",
      primaryColor: "#123456",
      completionMessage: "All done — thank you!",
      redirectUrl: "https://example.test/thanks",
      allowSaveAndResume: false,
      requireLogin: true,
    };

    const putRes = await agent.put(`/api/workflows/${workflowId}`).send({ settings });
    expect(putRes.status).toBe(200);

    // Reload via a fresh GET — the values must survive, not reset to defaults.
    const getRes = await agent.get(`/api/workflows/${workflowId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.settings).toMatchObject(settings);
  });
});

describe("GET /api/steps/:stepId/delete-impact + /api/pages/:pageId/delete-impact (ICW2-13)", () => {
  /** Create a short text step under the given workflow/page; return its id. */
  async function makeStep(workflowId: string, pageId: string, alias: string): Promise<string> {
    const res = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: alias, alias, config: { variant: "short" } });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it("counts answers + distinct runs per step and aggregates across a page", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId1 = await makeStep(workflowId, pageId, "q_one");
    const stepId2 = await makeStep(workflowId, pageId, "q_two");

    // Two runs; step1 answered in both (2 answers / 2 runs), step2 in one (1 / 1).
    const [run1] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    const [run2] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await getOwnerDb().insert(schema.stepValues).values([
      { runId: run1.id, stepId: stepId1, value: "a" },
      { runId: run2.id, stepId: stepId1, value: "b" },
      { runId: run1.id, stepId: stepId2, value: "c" },
    ]);

    const stepImpact = await agent.get(`/api/steps/${stepId1}/delete-impact`);
    expect(stepImpact.status).toBe(200);
    expect(stepImpact.body).toEqual({ answerCount: 2, runCount: 2 });

    // Page aggregates both steps: 3 answers across 2 distinct runs.
    const pageImpact = await agent.get(`/api/pages/${pageId}/delete-impact`);
    expect(pageImpact.status).toBe(200);
    expect(pageImpact.body).toEqual({ answerCount: 3, runCount: 2 });
  });

  it("returns zero impact for a step with no answers", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "q_empty");
    const res = await agent.get(`/api/steps/${stepId}/delete-impact`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answerCount: 0, runCount: 0 });
  });

  it("returns 401 without auth", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "q_noauth");
    const res = await request(ctx.baseURL).get(`/api/steps/${stepId}/delete-impact`);
    expect(res.status).toBe(401);
  });

  it("denies impact lookup to a non-collaborator (403/404 masked)", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "q_secret");
    const other = await createTestUser(ctx, "viewer");

    const stepRes = await request(ctx.baseURL)
      .get(`/api/steps/${stepId}/delete-impact`)
      .set("Authorization", `Bearer ${other.token}`);
    expect([403, 404]).toContain(stepRes.status);

    const pageRes = await request(ctx.baseURL)
      .get(`/api/pages/${pageId}/delete-impact`)
      .set("Authorization", `Bearer ${other.token}`);
    expect([403, 404]).toContain(pageRes.status);
  });
});

describe("POST /api/steps/:id/duplicate (ICW2-B5)", () => {
  it("creates a copy in the same page with a fresh alias and identical config, positioned after the source", async () => {
    const { pageId } = await makeWorkflowWithPage();

    const original = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: "text", title: "Original", alias: "clientName", config: { variant: "short" } });
    expect(original.status).toBe(201);

    const dup = await agent.post(`/api/steps/${original.body.id}/duplicate`);

    expect(dup.status).toBe(201);
    expect(dup.body.id).not.toBe(original.body.id);
    expect(dup.body.pageId).toBe(pageId);
    expect(dup.body.title).toBe("Original");
    expect(dup.body.config).toEqual(original.body.config);
    // Fresh, unique alias — never a verbatim copy (would collide with the
    // workflow's per-alias unique index).
    expect(dup.body.alias).not.toBe("clientName");
    expect(dup.body.alias).toMatch(/^clientName_copy/);
    expect(dup.body.order).toBe(original.body.order + 1);
  });

  it("shifts a later sibling down by one to make room for the copy", async () => {
    const { pageId } = await makeWorkflowWithPage();

    const step1 = await agent.post(`/api/pages/${pageId}/steps`).send({ type: "text", title: "Q1", config: { variant: "short" } });
    const step2 = await agent.post(`/api/pages/${pageId}/steps`).send({ type: "text", title: "Q2", config: { variant: "short" } });
    expect(step1.body.order).toBe(1);
    expect(step2.body.order).toBe(2);

    const dup = await agent.post(`/api/steps/${step1.body.id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.order).toBe(2);

    const stepsRes = await agent.get(`/api/pages/${pageId}/steps`);
    const shiftedStep2 = (stepsRes.body as Array<{ id: string; order: number }>).find((s) => s.id === step2.body.id);
    expect(shiftedStep2?.order).toBe(3);
  });

  it("returns 404 for a nonexistent step", async () => {
    const res = await agent.post(`/api/steps/${randomUUID()}/duplicate`);
    expect(res.status).toBe(404);
  });

  it("view role gets 403, edit role succeeds", async () => {
    const wfRes = await agent.post("/api/workflows").send({ title: `Dup ACL WF ${nanoid()}` });
    const workflowId = wfRes.body.id as string;
    const pageResponse = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: "Page" });
    const pageId = pageResponse.body.id as string;
    const stepRes = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "text", title: "Q1", config: { variant: "short" } });
    const stepId = stepRes.body.id as string;

    const sharedUser = await createTestUser(ctx, "builder");
    const sharedAgent = createAuthenticatedAgent(ctx.baseURL, sharedUser.token);
    const [aclEntry] = await getOwnerDb()
      .insert(schema.workflowAccess)
      .values({ workflowId, principalType: "user", principalId: sharedUser.userId, role: "view" })
      .returning();

    const denied = await sharedAgent.post(`/api/steps/${stepId}/duplicate`);
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/access denied/i);

    await getOwnerDb().update(schema.workflowAccess).set({ role: "edit" }).where(eq(schema.workflowAccess.id, aclEntry.id));

    const allowed = await sharedAgent.post(`/api/steps/${stepId}/duplicate`);
    expect(allowed.status).toBe(201);
  });

  it("returns 400 once the workflow step cap is reached (ICW-11)", async () => {
    const originalLimit = LIMITS.MAX_STEPS_PER_WORKFLOW;
    LIMITS.MAX_STEPS_PER_WORKFLOW = 1;
    try {
      const { pageId } = await makeWorkflowWithPage();
      const step = await agent.post(`/api/pages/${pageId}/steps`).send({ type: "text", title: "Only one", config: { variant: "short" } });
      expect(step.status).toBe(201);

      const dup = await agent.post(`/api/steps/${step.body.id}/duplicate`);
      expect(dup.status).toBe(400);
      expect(dup.body.message).toMatch(/question limit reached/i);
    } finally {
      LIMITS.MAX_STEPS_PER_WORKFLOW = originalLimit;
    }
  });
});

describe("POST /api/pages/:id/duplicate (ICW2-B5)", () => {
  it("copies the page, its steps with fresh aliases, and page-scoped logic rules with remapped ids", async () => {
    const { workflowId, pageId } = await makeWorkflowWithPage();

    const step1 = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: "text", title: "Q1", alias: "q_one", config: { variant: "short" } });
    const step2 = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: "text", title: "Q2", alias: "q_two", config: { variant: "short" } });
    expect(step1.status).toBe(201);
    expect(step2.status).toBe(201);

    const [rule] = await getOwnerDb()
      .insert(schema.logicRules)
      .values({
        workflowId,
        conditionStepId: step1.body.id,
        when: buildTestWhen(step1.body.id, "equals", "yes"),
        targetType: "step",
        targetStepId: step2.body.id,
        action: "show",
        order: 1,
      })
      .returning();

    const dup = await agent.post(`/api/pages/${pageId}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.id).not.toBe(pageId);
    // The workflow's auto-created "Page 1" (order 1) plus this one (order 2)
    // means the source page is order 2, so the copy lands at order 3.
    expect(dup.body.order).toBe(3);

    const newStepsRes = await agent.get(`/api/pages/${dup.body.id}/steps`);
    expect(newStepsRes.status).toBe(200);
    const newSteps = newStepsRes.body as Array<{ id: string; title: string; alias: string | null }>;
    expect(newSteps).toHaveLength(2);

    const newStep1 = newSteps.find((s) => s.title === "Q1");
    const newStep2 = newSteps.find((s) => s.title === "Q2");
    expect(newStep1?.id).not.toBe(step1.body.id);
    expect(newStep1?.alias).not.toBe("q_one");
    expect(newStep1?.alias).toMatch(/^q_one_copy/);
    expect(newStep2?.alias).not.toBe("q_two");
    expect(newStep2?.alias).toMatch(/^q_two_copy/);

    // The page-scoped logic rule was copied with both ids remapped onto
    // the new steps — never left pointing at the source's step ids.
    const allRules = await getOwnerDb().select().from(schema.logicRules).where(eq(schema.logicRules.workflowId, workflowId));
    const copiedRule = allRules.find((r) => r.id !== rule.id);
    expect(copiedRule).toBeDefined();
    expect(copiedRule?.conditionStepId).toBe(newStep1?.id);
    expect(copiedRule?.targetStepId).toBe(newStep2?.id);
  });

  it("returns 404 for a nonexistent page", async () => {
    const res = await agent.post(`/api/pages/${randomUUID()}/duplicate`);
    expect(res.status).toBe(404);
  });

  it("view role gets 403, edit role succeeds", async () => {
    const wfRes = await agent.post("/api/workflows").send({ title: `Dup Page ACL WF ${nanoid()}` });
    const workflowId = wfRes.body.id as string;
    const pageResponse = await agent.post(`/api/workflows/${workflowId}/pages`).send({ title: "Page" });
    const pageId = pageResponse.body.id as string;

    const sharedUser = await createTestUser(ctx, "builder");
    const sharedAgent = createAuthenticatedAgent(ctx.baseURL, sharedUser.token);
    const [aclEntry] = await getOwnerDb()
      .insert(schema.workflowAccess)
      .values({ workflowId, principalType: "user", principalId: sharedUser.userId, role: "view" })
      .returning();

    const denied = await sharedAgent.post(`/api/pages/${pageId}/duplicate`);
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/access denied/i);

    await getOwnerDb().update(schema.workflowAccess).set({ role: "edit" }).where(eq(schema.workflowAccess.id, aclEntry.id));

    const allowed = await sharedAgent.post(`/api/pages/${pageId}/duplicate`);
    expect(allowed.status).toBe(201);
  });

  it("returns 400 once the workflow page cap is reached (ICW-11)", async () => {
    const originalLimit = LIMITS.MAX_PAGES_PER_WORKFLOW;
    // Create the workflow/page under the real limit, then tighten the cap —
    // creating the page itself must not be blocked by the test's own cap.
    const { pageId } = await makeWorkflowWithPage();
    LIMITS.MAX_PAGES_PER_WORKFLOW = 2;
    try {
      const dup = await agent.post(`/api/pages/${pageId}/duplicate`);
      expect(dup.status).toBe(400);
      expect(dup.body.message).toMatch(/page limit reached/i);
    } finally {
      LIMITS.MAX_PAGES_PER_WORKFLOW = originalLimit;
    }
  });

  it("returns 400 when copying the page's steps would exceed the workflow step cap (ICW-11)", async () => {
    const originalLimit = LIMITS.MAX_STEPS_PER_WORKFLOW;
    LIMITS.MAX_STEPS_PER_WORKFLOW = 2;
    try {
      const { pageId } = await makeWorkflowWithPage();
      const step1 = await agent.post(`/api/pages/${pageId}/steps`).send({ type: "text", title: "Q1", config: { variant: "short" } });
      const step2 = await agent.post(`/api/pages/${pageId}/steps`).send({ type: "text", title: "Q2", config: { variant: "short" } });
      expect(step1.status).toBe(201);
      expect(step2.status).toBe(201);

      // At the cap already; duplicating the page would add 2 more steps.
      const dup = await agent.post(`/api/pages/${pageId}/duplicate`);
      expect(dup.status).toBe(400);
      expect(dup.body.message).toMatch(/question limit reached/i);
    } finally {
      LIMITS.MAX_STEPS_PER_WORKFLOW = originalLimit;
    }
  });
});
