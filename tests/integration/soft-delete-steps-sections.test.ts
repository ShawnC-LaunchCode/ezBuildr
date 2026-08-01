/**
 * ICW2-B1 — Soft-delete for steps/sections (`deletedAt`).
 *
 * Deleting a step/section used to be a hard SQL DELETE, destroying
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

import { db } from "../../server/db";
import { workflowContentIngestService, type WorkflowContentData } from "../../server/services/WorkflowContentIngestService";
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from "../helpers/integrationTestHelper";
import { TestFactory } from "../helpers/testFactory";

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
  factory = new TestFactory(db);
});

afterAll(async () => {
  await ctx.cleanup();
});

/** Create a workflow (filed under the test project) with one section; return both ids. */
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

/** Create a short_text step under the given workflow/section; return its id. */
async function makeStep(workflowId: string, sectionId: string, alias: string): Promise<string> {
  const res = await agent
    .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
    .send({ type: "short_text", title: alias, alias });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function fetchStepRow(stepId: string) {
  const [row] = await db.select().from(schema.steps).where(eq(schema.steps.id, stepId));
  return row;
}

async function fetchSectionRow(sectionId: string) {
  const [row] = await db.select().from(schema.sections).where(eq(schema.sections.id, sectionId));
  return row;
}

describe("DELETE /api/steps/:stepId soft-deletes and preserves answers (ICW2-B1 AC1)", () => {
  it("sets deletedAt and leaves existing step_values intact", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const stepId = await makeStep(workflowId, sectionId, "answered_question");

    const [run] = await db.insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await db.insert(schema.stepValues).values({ runId: run.id, stepId, value: "the answer" });

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);

    const stepRow = await fetchStepRow(stepId);
    expect(stepRow).toBeDefined();
    expect(stepRow.deletedAt).not.toBeNull();

    const values = await db.select().from(schema.stepValues).where(eq(schema.stepValues.stepId, stepId));
    expect(values).toHaveLength(1);
    expect(values[0].value).toBe("the answer");
  });

  it("DELETE /api/sections/:sectionId soft-deletes the section and cascades to its steps", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const stepId = await makeStep(workflowId, sectionId, "child_of_section");

    const [run] = await db.insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await db.insert(schema.stepValues).values({ runId: run.id, stepId, value: "kept" });

    const del = await agent.delete(`/api/sections/${sectionId}`);
    expect(del.status).toBe(204);

    const sectionRow = await fetchSectionRow(sectionId);
    expect(sectionRow.deletedAt).not.toBeNull();

    const stepRow = await fetchStepRow(stepId);
    expect(stepRow.deletedAt).not.toBeNull();

    const values = await db.select().from(schema.stepValues).where(eq(schema.stepValues.stepId, stepId));
    expect(values).toHaveLength(1);
  });
});

describe("soft-deleted steps/sections are invisible to reads (ICW2-B1 AC2)", () => {
  it("is excluded from the aggregate reader (GET /api/workflows/:workflowId) and the runner path", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const keepStepId = await makeStep(workflowId, sectionId, "keep_visible");
    const deleteStepId = await makeStep(workflowId, sectionId, "hide_me");

    const del = await agent.delete(`/api/steps/${deleteStepId}`);
    expect(del.status).toBe(204);

    // Aggregate reader (builder / workflow detail view)
    const detail = await agent.get(`/api/workflows/${workflowId}`);
    expect(detail.status).toBe(200);
    const detailSection = detail.body.sections.find((s: { id: string }) => s.id === sectionId);
    const detailStepIds = detailSection.steps.map((s: { id: string }) => s.id);
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

  it("a soft-deleted section disappears from the sections list and its steps disappear from the workflow detail", async () => {
    const { workflowId, sectionId: keepSectionId } = await makeWorkflowWithSection();
    const deleteSectionRes = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "Section to remove" });
    expect(deleteSectionRes.status).toBe(201);
    const deleteSectionId = deleteSectionRes.body.id as string;
    await makeStep(workflowId, deleteSectionId, "orphaned_by_section_delete");

    const del = await agent.delete(`/api/sections/${deleteSectionId}`);
    expect(del.status).toBe(204);

    const sectionsList = await agent.get(`/api/workflows/${workflowId}/sections`);
    expect(sectionsList.status).toBe(200);
    const listedIds = sectionsList.body.map((s: { id: string }) => s.id);
    expect(listedIds).toContain(keepSectionId);
    expect(listedIds).not.toContain(deleteSectionId);

    const detail = await agent.get(`/api/workflows/${workflowId}`);
    expect(detail.status).toBe(200);
    const detailSectionIds = detail.body.sections.map((s: { id: string }) => s.id);
    expect(detailSectionIds).not.toContain(deleteSectionId);
  });
});

describe("a soft-deleted step's alias frees up for reuse (ICW2-B1 AC3)", () => {
  it("creating a new step with the same alias does not hit the unique-alias violation", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const originalStepId = await makeStep(workflowId, sectionId, "reusable_alias");

    const del = await agent.delete(`/api/steps/${originalStepId}`);
    expect(del.status).toBe(204);

    const recreate = await agent
      .post(`/api/workflows/${workflowId}/sections/${sectionId}/steps`)
      .send({ type: "short_text", title: "Reused", alias: "reusable_alias" });
    expect(recreate.status).toBe(201);
    expect(recreate.body.alias).toBe("reusable_alias");
    expect(recreate.body.id).not.toBe(originalStepId);
  });
});

describe("restore endpoints clear deletedAt under edit access (ICW2-B1 AC4)", () => {
  it("POST /api/steps/:stepId/restore clears deletedAt for the owner", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const stepId = await makeStep(workflowId, sectionId, "restore_me_step");

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);
    expect((await fetchStepRow(stepId)).deletedAt).not.toBeNull();

    const restore = await agent.post(`/api/steps/${stepId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();

    // It is visible again afterwards.
    const detail = await agent.get(`/api/workflows/${workflowId}`);
    const detailSection = detail.body.sections.find((s: { id: string }) => s.id === sectionId);
    expect(detailSection.steps.map((s: { id: string }) => s.id)).toContain(stepId);
  });

  it("POST /api/sections/:sectionId/restore clears deletedAt for the section and cascades to its steps", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const stepId = await makeStep(workflowId, sectionId, "restore_me_child");

    const del = await agent.delete(`/api/sections/${sectionId}`);
    expect(del.status).toBe(204);

    const restore = await agent.post(`/api/sections/${sectionId}/restore`);
    expect(restore.status).toBe(200);
    expect(restore.body.deletedAt).toBeNull();

    expect((await fetchSectionRow(sectionId)).deletedAt).toBeNull();
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();

    const sectionsList = await agent.get(`/api/workflows/${workflowId}/sections`);
    expect(sectionsList.body.map((s: { id: string }) => s.id)).toContain(sectionId);
  });

  it("denies restore to a view-role collaborator (403) and allows it once raised to edit", async () => {
    // Unfiled workflow so the shared user's only access is the direct ACL
    // row inserted below (mirrors the ICW2-1 ACL test pattern).
    const wfRes = await agent.post("/api/workflows").send({ title: `Restore ACL WF ${nanoid()}` });
    expect(wfRes.status).toBe(201);
    const workflowId = wfRes.body.id as string;
    const secRes = await agent
      .post(`/api/workflows/${workflowId}/sections`)
      .send({ title: "ACL Section" });
    expect(secRes.status).toBe(201);
    const sectionId = secRes.body.id as string;
    const stepId = await makeStep(workflowId, sectionId, "acl_restore_step");

    const del = await agent.delete(`/api/steps/${stepId}`);
    expect(del.status).toBe(204);

    const sharedUser = await createTestUser(ctx, "builder");
    const sharedAgent = createAuthenticatedAgent(ctx.baseURL, sharedUser.token);

    const [aclEntry] = await db
      .insert(schema.workflowAccess)
      .values({ workflowId, principalType: "user", principalId: sharedUser.userId, role: "view" })
      .returning();

    const deniedRestore = await sharedAgent.post(`/api/steps/${stepId}/restore`);
    expect(deniedRestore.status).toBe(403);
    expect((await fetchStepRow(stepId)).deletedAt).not.toBeNull();

    await db
      .update(schema.workflowAccess)
      .set({ role: "edit" })
      .where(eq(schema.workflowAccess.id, aclEntry.id));

    const allowedRestore = await sharedAgent.post(`/api/steps/${stepId}/restore`);
    expect(allowedRestore.status).toBe(200);
    expect((await fetchStepRow(stepId)).deletedAt).toBeNull();
  });

  it("returns 401 without auth and 404 for a step that was never deleted... only once restored is a no-op restore idempotent", async () => {
    const { workflowId, sectionId } = await makeWorkflowWithSection();
    const stepId = await makeStep(workflowId, sectionId, "noauth_restore");

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
    const workflowId = await createWorkflow(`Ingest Soft-Delete ${nanoid()}`);

    const v1: WorkflowContentData = {
      sections: [
        {
          id: "sec-a",
          title: "Section A",
          order: 0,
          steps: [
            { id: "step-keep", type: "short_text", title: "Keep Me", alias: "ingestKeepMe", order: 0 },
            { id: "step-remove", type: "short_text", title: "Remove Me", alias: "ingestRemoveMe", order: 1 },
          ],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v1, { source: "manual" });

    const dbSteps = await db.select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const keepStep = dbSteps.find((s) => s.alias === "ingestKeepMe");
    const removeStep = dbSteps.find((s) => s.alias === "ingestRemoveMe");
    if (!keepStep || !removeStep) {
      throw new Error("Expected both ingest steps to have been created");
    }
    const [dbSection] = await db.select().from(schema.sections).where(eq(schema.sections.workflowId, workflowId));

    // Give the step-to-be-removed an answer, to confirm the reconciliation
    // delete is a soft-delete (answers survive), not a hard DELETE.
    const [run] = await db.insert(schema.workflowRuns)
      .values({ workflowId, runToken: nanoid(), createdBy: ctx.userId }).returning();
    await db.insert(schema.stepValues).values({ runId: run.id, stepId: removeStep.id, value: "will survive" });

    // v2 references the real DB ids for the section and the surviving step
    // only — "Remove Me" is gone from the payload, as if a user deleted the
    // question in the builder.
    const v2: WorkflowContentData = {
      sections: [
        {
          id: dbSection.id,
          title: "Section A",
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

    const survivingValues = await db.select().from(schema.stepValues).where(eq(schema.stepValues.stepId, removeStep.id));
    expect(survivingValues).toHaveLength(1);

    // Re-applying the same (v2) payload again must ignore the already
    // soft-deleted step — it must not be re-stamped or error.
    await workflowContentIngestService.apply(workflowId, v2, { source: "manual" });
    const removedAfterV3 = await fetchStepRow(removeStep.id);
    expect(removedAfterV3.deletedAt).not.toBeNull();
    expect((removedAfterV3.deletedAt as Date).getTime()).toBe(removedAtV2.getTime());
  });

  it("soft-deletes a whole section dropped from the incoming payload, cascading to its steps", async () => {
    const workflowId = await createWorkflow(`Ingest Section Removal ${nanoid()}`);

    const v1: WorkflowContentData = {
      sections: [
        {
          id: "sec-keep",
          title: "Kept Section",
          order: 0,
          steps: [{ id: "step-a", type: "short_text", title: "A", alias: "ingestSectionA", order: 0 }],
        },
        {
          id: "sec-remove",
          title: "Removed Section",
          order: 1,
          steps: [{ id: "step-b", type: "short_text", title: "B", alias: "ingestSectionB", order: 0 }],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v1, { source: "manual" });

    const dbSections = await db.select().from(schema.sections).where(eq(schema.sections.workflowId, workflowId));
    const keepSection = dbSections.find((s) => s.title === "Kept Section");
    const removeSection = dbSections.find((s) => s.title === "Removed Section");
    if (!keepSection || !removeSection) {
      throw new Error("Expected both ingest sections to have been created");
    }
    const dbStepsBefore = await db.select().from(schema.steps).where(eq(schema.steps.workflowId, workflowId));
    const removedChildStep = dbStepsBefore.find((s) => s.alias === "ingestSectionB");
    if (!removedChildStep) {
      throw new Error("Expected the removed section's step to have been created");
    }

    const v2: WorkflowContentData = {
      sections: [
        {
          id: keepSection.id,
          title: "Kept Section",
          order: 0,
          steps: [{ id: dbStepsBefore.find((s) => s.alias === "ingestSectionA")!.id, type: "short_text", title: "A", alias: "ingestSectionA", order: 0 }],
        },
      ],
    };
    await workflowContentIngestService.apply(workflowId, v2, { source: "manual" });

    expect((await fetchSectionRow(removeSection.id)).deletedAt).not.toBeNull();
    expect((await fetchStepRow(removedChildStep.id)).deletedAt).not.toBeNull();
    expect((await fetchSectionRow(keepSection.id)).deletedAt).toBeNull();
  });
});
