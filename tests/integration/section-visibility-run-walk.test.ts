/**
 * SECT-7 vertical proof. Uses real persisted workflow content, publish
 * serialization, pinned run definitions, the canonical evaluator, and the
 * real RunService page walk. No evaluator/navigation function is mocked.
 * Cross-tenant denial is N/A: SECT-7 adds no endpoint or tenant surface.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pages, sections, steps, workflows } from "@shared/schema";

import { runService } from "../../server/services/RunService";
import { versionService } from "../../server/services/VersionService";
import { enterTenantContextForTests } from "../../server/utils/rlsContext";
import { buildTestWhen } from "../helpers/conditionFixtures";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential("SECT-7 conditional Section vertical run walk", () => {
  let ctx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: "SECT-7 visibility", createProject: true });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("false hides all three Section pages; true reveals two while the page-level false remains hidden", async () => {
    enterTenantContextForTests(ctx.tenantId);
    const [workflow] = await getOwnerDb().insert(workflows).values({
      title: "SECT-7 published interview",
      projectId: ctx.projectId!,
      creatorId: ctx.userId,
      ownerId: ctx.userId,
      status: "draft",
    }).returning();

    try {
      const [conditionalSection] = await getOwnerDb().insert(sections).values({
        workflowId: workflow.id,
        title: "Joint filing details",
        visibleIf: buildTestWhen("filed_jointly", "is_true"),
      }).returning();
      const [intro] = await getOwnerDb().insert(pages).values({
        workflowId: workflow.id, title: "Filing status", order: 0, sectionId: null,
      }).returning();
      const [jointOne] = await getOwnerDb().insert(pages).values({
        workflowId: workflow.id, title: "Joint one", order: 1, sectionId: conditionalSection.id,
      }).returning();
      const [ownFalse] = await getOwnerDb().insert(pages).values({
        workflowId: workflow.id,
        title: "Own condition false",
        order: 2,
        sectionId: conditionalSection.id,
        visibleIf: buildTestWhen("filed_jointly", "is_false"),
      }).returning();
      const [jointThree] = await getOwnerDb().insert(pages).values({
        workflowId: workflow.id, title: "Joint three", order: 3, sectionId: conditionalSection.id,
      }).returning();

      const [filedJointly] = await getOwnerDb().insert(steps).values({
        workflowId: workflow.id,
        pageId: intro.id,
        type: "yes_no",
        title: "Filed jointly?",
        alias: "filed_jointly",
        required: true,
        order: 0,
      }).returning();
      const memberSteps = await getOwnerDb().insert(steps).values([
        { workflowId: workflow.id, pageId: jointOne.id, type: "short_text", title: "Joint one answer", alias: "joint_one", required: false, order: 0 },
        { workflowId: workflow.id, pageId: ownFalse.id, type: "short_text", title: "Hidden answer", alias: "hidden_answer", required: false, order: 0 },
        { workflowId: workflow.id, pageId: jointThree.id, type: "short_text", title: "Joint three answer", alias: "joint_three", required: false, order: 0 },
      ]).returning();

      const published = await versionService.publishVersion(workflow.id, ctx.userId, "SECT-7 vertical");

      // Make the live definition disagree after publish. Both runs below must
      // still use the Section condition captured in `published`.
      await getOwnerDb().update(sections)
        .set({ visibleIf: buildTestWhen("filed_jointly", "is_false") })
        .where(eq(sections.id, conditionalSection.id));

      const falseRun = await runService.createRun(workflow.id, ctx.userId, {});
      expect(falseRun.workflowVersionId).toBe(published.id);
      await expect(runService.submitPage(falseRun.id, intro.id, ctx.userId, [
        { stepId: filedJointly.id, value: false },
      ])).resolves.toEqual({ success: true });
      const falseBranch = await runService.next(falseRun.id, ctx.userId);
      expect(falseBranch.visiblePages).toEqual([intro.id]);
      expect(falseBranch.nextPageId).toBeNull();

      const trueRun = await runService.createRun(workflow.id, ctx.userId, {});
      expect(trueRun.workflowVersionId).toBe(published.id);
      await expect(runService.submitPage(trueRun.id, intro.id, ctx.userId, [
        { stepId: filedJointly.id, value: true },
      ])).resolves.toEqual({ success: true });
      const firstTrueMove = await runService.next(trueRun.id, ctx.userId);
      expect(firstTrueMove.visiblePages).toEqual([intro.id, jointOne.id, jointThree.id]);
      expect(firstTrueMove.visiblePages).not.toContain(ownFalse.id);
      expect(firstTrueMove.nextPageId).toBe(jointOne.id);

      await expect(runService.submitPage(trueRun.id, jointOne.id, ctx.userId, [
        { stepId: memberSteps[0].id, value: "one" },
      ])).resolves.toEqual({ success: true });
      expect((await runService.next(trueRun.id, ctx.userId)).nextPageId).toBe(jointThree.id);
      await expect(runService.submitPage(trueRun.id, jointThree.id, ctx.userId, [
        { stepId: memberSteps[2].id, value: "three" },
      ])).resolves.toEqual({ success: true });
      expect((await runService.next(trueRun.id, ctx.userId)).nextPageId).toBeNull();
    } finally {
      await getOwnerDb().delete(workflows).where(eq(workflows.id, workflow.id));
    }
  });
});
