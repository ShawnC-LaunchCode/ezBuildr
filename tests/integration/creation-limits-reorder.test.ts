/**
 * ICW-11 / ICW-12 integration coverage:
 *  - reorderPages / reorderSteps roll back completely when one update in
 *    the batch fails (single-transaction reorders)
 *  - the ingest (deep-update) path rejects content exceeding the aggregate
 *    LIMITS caps before anything is written
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@shared/schema";
import { LIMITS } from "@shared/limits";

import { pageService } from "../../server/services/PageService";
import { stepService } from "../../server/services/StepService";
import {
  workflowContentIngestService,
  type WorkflowContentData,
} from "../../server/services/WorkflowContentIngestService";
import { TestFactory } from "../helpers/testFactory";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
// RLS-5: fixture writes and verification reads are the OBSERVER, not the
// application under test — see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

describe.sequential("creation limits and transactional reorders (ICW-11/12)", () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: "Creation Limits Tenant",
      createProject: true,
    });
    // Fixture rows belong to the observer, not the application pool (RLS-5).
    factory = new TestFactory(getOwnerDb());
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /**
   * RLS-5: every test in this file calls `pageService` / `stepService` /
   * `workflowContentIngestService` DIRECTLY — no HTTP, so no middleware opens
   * a tenant context and their `withCurrentTenant` has nothing to read. Each
   * test starts here, so entering the context in this helper covers all of
   * them; a `beforeAll` entry would NOT propagate into the test bodies.
   */
  async function createWorkflowId(title: string): Promise<string> {
    enterTenantContextForTests(ctx.tenantId);
    if (ctx.projectId === undefined) {
      throw new Error("Integration test project was not created");
    }
    const { workflow } = await factory.createWorkflow(ctx.projectId, ctx.userId, {
      workflow: { title },
    });
    return workflow.id;
  }

  it("rolls back the whole page reorder when one update fails (ICW-12)", async () => {
    const workflowId = await createWorkflowId("Reorder rollback pages");
    const s1 = await factory.createPage(workflowId, { title: "S1", order: 0 });
    const s2 = await factory.createPage(workflowId, { title: "S2", order: 1 });

    await expect(
      pageService.reorderPages(workflowId, ctx.userId, [
        { id: s1.id, order: 10, sectionId: null },
        { id: randomUUID(), order: 11, sectionId: null },
      ])
    ).rejects.toThrow();

    const rows = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.workflowId, workflowId));
    const byId = new Map(rows.map((row) => [row.id, row.order]));
    // s1's update executed BEFORE the failing one — it must have rolled back.
    expect(byId.get(s1.id)).toBe(0);
    expect(byId.get(s2.id)).toBe(1);
  });

  it("rolls back the whole step reorder when one update fails (ICW-12)", async () => {
    const workflowId = await createWorkflowId("Reorder rollback steps");
    const page = await factory.createPage(workflowId, { title: "S", order: 0 });
    const st1 = await factory.createStep(page.id, { title: "Q1", order: 0 });
    const st2 = await factory.createStep(page.id, { title: "Q2", order: 1 });

    await expect(
      stepService.reorderSteps(workflowId, page.id, ctx.userId, [
        { id: st1.id, order: 10 },
        { id: randomUUID(), order: 11 },
      ])
    ).rejects.toThrow();

    const rows = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.pageId, page.id));
    const byId = new Map(rows.map((row) => [row.id, row.order]));
    expect(byId.get(st1.id)).toBe(0);
    expect(byId.get(st2.id)).toBe(1);
  });

  it("happy-path reorder persists new orders (ICW-12)", async () => {
    const workflowId = await createWorkflowId("Reorder happy path");
    const s1 = await factory.createPage(workflowId, { title: "S1", order: 0 });
    const s2 = await factory.createPage(workflowId, { title: "S2", order: 1 });

    await pageService.reorderPages(workflowId, ctx.userId, [
      { id: s1.id, order: 1, sectionId: null },
      { id: s2.id, order: 0, sectionId: null },
    ]);

    const rows = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.workflowId, workflowId));
    const byId = new Map(rows.map((row) => [row.id, row.order]));
    expect(byId.get(s1.id)).toBe(1);
    expect(byId.get(s2.id)).toBe(0);
  });

  it("ingest rejects content over the page cap before writing anything (ICW-11)", async () => {
    const workflowId = await createWorkflowId("Ingest page cap");
    const oversized: WorkflowContentData = {
      title: "Too many pages",
      pages: Array.from({ length: LIMITS.MAX_PAGES_PER_WORKFLOW + 1 }, (_, i) => ({
        id: `page-${i}`,
        title: `Page ${i}`,
        order: i,
        steps: [],
      })),
    };

    await expect(
      workflowContentIngestService.apply(workflowId, oversized, { source: "ai" })
    ).rejects.toThrow(/Page limit reached/);

    const rows = await getOwnerDb()
      .select()
      .from(schema.pages)
      .where(eq(schema.pages.workflowId, workflowId));
    expect(rows).toHaveLength(0);
  });

  it("ingest rejects content over the total step cap (ICW-11)", async () => {
    const workflowId = await createWorkflowId("Ingest step cap");
    const stepsPerPage = Math.ceil((LIMITS.MAX_STEPS_PER_WORKFLOW + 1) / 2);
    const oversized: WorkflowContentData = {
      title: "Too many steps",
      pages: [0, 1].map((pageIndex) => ({
        id: `page-${pageIndex}`,
        title: `Page ${pageIndex}`,
        order: pageIndex,
        steps: Array.from({ length: stepsPerPage }, (_, i) => ({
          id: `step-${pageIndex}-${i}`,
          type: "short_text",
          title: `Question ${pageIndex}-${i}`,
          order: i,
        })),
      })),
    };

    await expect(
      workflowContentIngestService.apply(workflowId, oversized, { source: "ai" })
    ).rejects.toThrow(/Question limit reached/);

    const rows = await getOwnerDb()
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.workflowId, workflowId));
    expect(rows).toHaveLength(0);
  });
});
