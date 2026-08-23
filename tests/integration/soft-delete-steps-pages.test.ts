/**
 * ICW2-B1 — Soft-delete for steps/pages (`deletedAt`).
 *
 * Deleting a step/page used to be a hard SQL DELETE, destroying
 * respondent answers via the `step_values` FK cascade. This suite proves the
 * shippable server-side core: delete sets `deletedAt` instead (answers
 * survive), soft-deleted rows are excluded from every read chokepoint, a
 * soft-deleted step's alias frees up for reuse, the dedicated restore
 * endpoints clear `deletedAt` under edit access only, and the ingest
 * reconciliation path (WorkflowContentIngestService) soft-deletes removed
 * rows instead of hard-deleting them.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";

import { workflowContentIngestService, type WorkflowContentData } from "../../server/services/WorkflowContentIngestService";
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { TestFactory } from "../helpers/testFactory";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

let ctx: IntegrationTestContext;
let agent: ReturnType<typeof createAuthenticatedAgent>;
let factory: TestFactory;

beforeAll(async () => {
  ctx = await setupIntegrationTest({
    tenantName: "Soft-Delete Tenant",
    createProject: true,
    userRole: "admin",
    tenantRole: "owner",
  });
  agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
  factory = new TestFactory();
});

afterAll(async () => {
  await ctx.cleanup();
});

/** Create a workflow (filed under the test project) with one page; return both ids. */
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

/** Create a short_text step under the given workflow/page; return its id. */
async function makeStep(workflowId: string, pageId: string, alias: string): Promise<string> {
  const res = await agent
    .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
    .send({ type: "short_text", title: alias, alias });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function fetchStepRow(stepId: string) {
  const [row] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
  return row;
}

async function fetchPageRow(pageId: string) {
  const [row] = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.id, pageId));
  return row;
}

describe("DELETE /api/steps/:stepId soft-deletes and preserves answers (ICW2-B1 AC1)", () => {
  it("sets deletedAt and leaves existing step_values intact", async () => {
    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "answered_question");

    const [run] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await getOwnerDb().insert(schema.stepValues).values({ runId: run.id, stepId, value: "the answer" });

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);

    const stepRow = await fetchStepRow(stepId);
    expect(stepRow).toBeDefined();
    expect(stepRow.deletedAt).not.toBeNull();

    const values = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.stepId, stepId));
    expect(values).toHaveLength(1);
    expect(values[0].value).toBe("the answer");
  });

  it("DELETE /api/pages/:pageId soft-deletes the page and cascades to its steps", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "child_of_page");

    const [run] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await getOwnerDb().insert(schema.stepValues).values({ runId: run.id, stepId, value: "kept" });

    const del = await agent.delete(`/api/pages/${pageId}`);
    expect(del.status).toBe(204);

    const pageRow = await fetchPageRow(pageId);
    expect(pageRow.deletedAt).not.toBeNull();

    const stepRow = await fetchStepRow(stepId);
    expect(stepRow.deletedAt).not.toBeNull();

    const values = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.stepId, stepId));
    expect(values).toHaveLength(1);
  });
});

describe("soft-deleted steps/pages are invisible to reads (ICW2-B1 AC2)", () => {
  it("is excluded from the aggregate reader (GET /api/workflows/:workflowId) and the runner path", async () => {
    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const keepStepId = await makeStep(workflowId, pageId, "keep_visible");
    const deleteStepId = await makeStep(workflowId, pageId, "hide_me");

    const del = await agent.delete(`/api/steps/${deleteStepId}`);
    expect(del.status).toBe(204);

    // Aggregate reader (builder / workflow detail view)
    const detail = await agent.get(`/api/workflows/${workflowId}`);
    expect(detail.status).toBe(200);
    const detailPage = detail.body.pages.find((s: { id: string }) => s.id === pageId);
    const detailStepIds = detailPage.steps.map((s: { id: string }) => s.id);
    expect(detailStepIds).toContain(keepStepId);
    expect(detailStepIds).not.toContain(deleteStepId);

    // Runner path: GET /api/workflows/:workflowId/steps ("used by the runner,
    // including public runs" per its route doc comment)
    const runnerSteps = await agent.get(`/api/workflows/${workflowId}/steps`);
    expect(runnerSteps.status).toBe(200);
    const runnerStepIds = runnerSteps.body.map((s: { id: string }) => s.id);
    expect(runnerStepIds).toContain(keepStepId);
    expect(runnerStepIds).not.toContain(deleteStepId);
  });

  it("a soft-deleted page disappears from the pages list and its steps disappear from the workflow detail", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId: keepPageId } = await makeWorkflowWithPage();
    const deletePageRes = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "Page to remove" });
    expect(deletePageRes.status).toBe(201);
    const deletePageId = deletePageRes.body.id as string;
    await makeStep(workflowId, deletePageId, "orphaned_by_page_delete");

    const del = await agent.delete(`/api/pages/${deletePageId}`);
    expect(del.status).toBe(204);

    const pagesList = await agent.get(`/api/workflows/${workflowId}/pages`);
    expect(pagesList.status).toBe(200);
    const listedIds = pagesList.body.map((s: { id: string }) => s.id);
    expect(listedIds).toContain(keepPageId);
    expect(listedIds).not.toContain(deletePageId);

    const detail = await agent.get(`/api/workflows/${workflowId}`);
    expect(detail.status).toBe(200);
    const detailPageIds = detail.body.pages.map((s: { id: string }) => s.id);
    expect(detailPageIds).not.toContain(deletePageId);
  });
});

describe("a soft-deleted step's alias frees up for reuse (ICW2-B1 AC3)", () => {
  it("creating a new step with the same alias does not hit the unique-alias violation", async () => {
    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const originalStepId = await makeStep(workflowId, pageId, "reusable_alias");

    const del = await agent.delete(`/api/steps/${originalStepId}`);
    expect(del.status).toBe(204);

    const recreate = await agent
      .post(`/api/workflows/${workflowId}/pages/${pageId}/steps`)
      .send({ type: "short_text", title: "Reused", alias: "reusable_alias" });
    expect(recreate.status).toBe(201);
    expect(recreate.body.alias).toBe("reusable_alias");
    expect(recreate.body.id).not.toBe(originalStepId);
  });
});

describe("restore endpoints clear deletedAt under edit access (ICW2-B1 AC4)", () => {
  it("POST /api/steps/:stepId/restore clears deletedAt for the owner", async () => {
    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "restore_me_step");

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);
    expect((await fetchStepRow(stepId)).deletedAt).not.toBeNull();

    const restore = await agent.post(`/api/steps/${stepId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();

    // It is visible again afterwards.
    const detail = await agent.get(`/api/workflows/${workflowId}`);
    const detailPage = detail.body.pages.find((s: { id: string }) => s.id === pageId);
    expect(detailPage.steps.map((s: { id: string }) => s.id)).toContain(stepId);
  });

  it("POST /api/pages/:pageId/restore clears deletedAt for the page and cascades to its steps", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "restore_me_child");

    const del = await agent.delete(`/api/pages/${pageId}`);
    expect(del.status).toBe(204);

    const restore = await agent.post(`/api/pages/${pageId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();

    expect((await fetchPageRow(pageId)).deletedAt).toBeNull();
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();

    const pagesList = await agent.get(`/api/workflows/${workflowId}/pages`);
    expect(pagesList.body.map((s: { id: string }) => s.id)).toContain(pageId);
  });

  it("denies restore to a view-role collaborator (403) and allows it once raised to edit", async () => {

    enterTenantContextForTests(ctx.tenantId);
    // Unfiled workflow so the shared user's only access is the direct ACL
    // row inserted below (mirrors the ICW2-1 ACL test pattern).
    const wfRes = await agent.post("/api/workflows").send({ title: `Restore ACL WF ${nanoid()}` });
    expect(wfRes.status).toBe(201);
    const workflowId = wfRes.body.id as string;
    const pageResponse = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: "ACL Page" });
    expect(pageResponse.status).toBe(201);
    const pageId = pageResponse.body.id as string;
    const stepId = await makeStep(workflowId, pageId, "acl_restore_step");

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);

    const sharedUser = await createTestUser(ctx, "builder");
    const sharedAgent = createAuthenticatedAgent(ctx.baseURL, sharedUser.token);

    const [aclEntry] = await getOwnerDb()
      .insert(schema.workflowAccess)
      .values({ workflowId, principalType: "user", principalId: sharedUser.userId, role: "view" })
      .returning();

    const deniedRestore = await sharedAgent.post(`/api/steps/${stepId}/restore`);
    expect(deniedRestore.status).toBe(403);
    expect((await fetchStepRow(stepId)).deletedAt).not.toBeNull();

    await getOwnerDb()
      .update(schema.workflowAccess)
      .set({ role: "edit" })
      .where(eq(schema.workflowAccess.id, aclEntry.id));

    const allowedRestore = await sharedAgent.post(`/api/steps/${stepId}/restore`);
    expect(allowedRestore.status).toBe(200);
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();
  });

  it("returns 401 without auth and 404 for a step that was never deleted... only once restored is a no-op restore idempotent", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const { workflowId, pageId } = await makeWorkflowWithPage();
    const stepId = await makeStep(workflowId, pageId, "noauth_restore");

    const noAuth = await request(ctx.baseURL).post(`/api/steps/${stepId}/restore`);
    expect(noAuth.status).toBe(401);

    // Restoring a step that was never soft-deleted is a harmless no-op.
    const restore = await agent.post(`/api/steps/${stepId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();
  });
});

describe("WorkflowContentIngestService reconciliation soft-deletes removed rows (ICW2-B1 AC5)", () => {
  async function createWorkflow(title: string): Promise<string> {
    if (ctx.projectId === undefined) {
      throw new Error("Integration test project was not created");
    }
    const { workflow } = await factory.createWorkflow(ctx.projectId, ctx.userId, { workflow: { title } });
    return workflow.id;
  }

  it("soft-deletes a step dropped from the incoming payload, ignores it on a later re-apply, and leaves the surviving step untouched", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const workflowId = await createWorkflow(`Ingest Soft-Delete ${nanoid()}`);

    const v1: WorkflowContentData = {
      pages: [
        {
          id: "page-a",
          title: "Page A",
          order: 0,
          steps: [
            { id: "step-keep", type: "short_text", title: "Keep Me", alias: "ingestKeepMe", order: 0 },
            { id: "step-remove", type: "short_text", title: "Remove Me", alias: "ingestRemoveMe", order: 1 },
          ],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v1, { source: "manual" });

    const dbSteps = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const keepStep = dbSteps.find((s) => s.alias === "ingestKeepMe");
    const removeStep = dbSteps.find((s) => s.alias === "ingestRemoveMe");
    if (!keepStep || !removeStep) {
      throw new Error("Expected both ingest steps to have been created");
    }
    const [dbPage] = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId));

    // Give the step-to-be-removed an answer, to confirm the reconciliation
    // delete is a soft-delete (answers survive), not a hard DELETE.
    const [run] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await getOwnerDb().insert(schema.stepValues).values({ runId: run.id, stepId: removeStep.id, value: "will survive" });

    // v2 references the real DB ids for the page and the surviving step
    // only — "Remove Me" is gone from the payload, as if a user deleted the
    // question in the builder.
    const v2: WorkflowContentData = {
      pages: [
        {
          id: dbPage.id,
          title: "Page A",
          order: 0,
          steps: [
            { id: keepStep.id, type: "short_text", title: "Keep Me", alias: "ingestKeepMe", order: 0 },
          ],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v2, { source: "manual" });

    const removedAfterV2 = await fetchStepRow(removeStep.id);
    expect(removedAfterV2).toBeDefined(); // still present — not a hard DELETE
    expect(removedAfterV2.deletedAt).not.toBeNull();
    const removedAtV2 = removedAfterV2.deletedAt as Date;

    const keptAfterV2 = await fetchStepRow(keepStep.id);
    expect(keptAfterV2.deletedAt).toBeNull();

    const survivingValues = await getOwnerDb().select().from(schema.stepValues).where(eq(schema.stepValues.stepId, removeStep.id));
    expect(survivingValues).toHaveLength(1);

    // Re-applying the same (v2) payload again must ignore the already
    // soft-deleted step — it must not be re-stamped or error.
    await workflowContentIngestService.apply(workflowId, v2, { source: "manual" });
    const removedAfterV3 = await fetchStepRow(removeStep.id);
    expect(removedAfterV3.deletedAt).not.toBeNull();
    expect((removedAfterV3.deletedAt as Date).getTime()).toBe(removedAtV2.getTime());
  });

  it("soft-deletes a whole page dropped from the incoming payload, cascading to its steps", async () => {

    enterTenantContextForTests(ctx.tenantId);
    const workflowId = await createWorkflow(`Ingest Page Removal ${nanoid()}`);

    const v1: WorkflowContentData = {
      pages: [
        {
          id: "page-keep",
          title: "Kept Page",
          order: 0,
          steps: [{ id: "step-a", type: "short_text", title: "A", alias: "ingestPageA", order: 0 }],
        },
        {
          id: "page-remove",
          title: "Removed Page",
          order: 1,
          steps: [{ id: "step-b", type: "short_text", title: "B", alias: "ingestPageB", order: 0 }],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v1, { source: "manual" });

    const dbPages = await getOwnerDb().select().from(schema.pages).where(eq(schema.pages.workflowId, workflowId));
    const keepPage = dbPages.find((s) => s.title === "Kept Page");
    const removePage = dbPages.find((s) => s.title === "Removed Page");
    if (!keepPage || !removePage) {
      throw new Error("Expected both ingest pages to have been created");
    }
    const dbStepsBefore = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const removedChildStep = dbStepsBefore.find((s) => s.alias === "ingestPageB");
    if (!removedChildStep) {
      throw new Error("Expected the removed page's step to have been created");
    }

    const v2: WorkflowContentData = {
      pages: [
        {
          id: keepPage.id,
          title: "Kept Page",
          order: 0,
          steps: [{ id: dbStepsBefore.find((s) => s.alias === "ingestPageA")!.id, type: "short_text", title: "A", alias: "ingestPageA", order: 0 }],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v2, { source: "manual" });

    expect((await fetchPageRow(removePage.id)).deletedAt).not.toBeNull();
    expect((await fetchStepRow(removedChildStep.id)).deletedAt).not.toBeNull();
    expect((await fetchPageRow(keepPage.id)).deletedAt).toBeNull();
  });
});
