/**
 * RVP-5 — end-to-end proof that editing a live workflow cannot break an
 * in-flight run.
 *
 * This is the regression net for the whole Run Version Pinning initiative
 * (RVP-1/2/3/6): before those tickets, every server-side run decision
 * (navigation, page-submit, completion) re-read the LIVE `pages` /
 * `steps` / `logic_rules` tables instead of the version a run pinned itself
 * to at creation. The moment an author edited a published workflow, an
 * in-flight respondent was answering one interview while the server
 * validated a different one (`tickets/RUN_VERSION_PINNING_TICKETS.md`, "The
 * problem, stated once").
 *
 * This test reproduces all four documented consequences against a real
 * database, in a single run that starts, survives every mutation, and
 * COMPLETES using the definition it started with:
 *
 *   1. Delete a question mid-run       -> its answer is still accepted and
 *                                          persisted (not silently dropped).
 *   2. Add a REQUIRED question mid-run -> does not block completion. This is
 *      the worst consequence: pre-fix, it was unrecoverable for the
 *      respondent -- "Missing required steps: <title>" for a question that
 *      did not exist in their interview, with no action they could take.
 *   3. Delete a page mid-run        -> the run still navigates to it and
 *                                          submits it, using the pinned order.
 *   4. Edit a logic rule mid-run       -> visibility/requiredness is decided
 *      by the rule the respondent's snapshot had, not the live edit.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  workflows,
  pages,
  steps,
  logicRules,
  users,
  tenants,
  projects,
  workflowRuns,
  stepValues,
  auditLogs,
} from "@shared/schema";
import { buildTestWhen } from "../helpers/conditionFixtures";

import { runService } from "../../server/services/RunService";
import { versionService } from "../../server/services/VersionService";
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
// RLS-5 recipe step 3: direct service calls get no middleware, so the tenant
// context is entered per test body — a hook entry does not propagate.
import { enterTenantContextForTests } from "../../server/utils/rlsContext";

describe("RVP-5 mid-run live-workflow edits cannot desync an in-flight run", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const [tenant] = await getOwnerDb().insert(tenants).values({ name: "RVP-5 Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;
    const [user] = await getOwnerDb().insert(users).values({
      email: `rvp5_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "RVP-5 Tester",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;
    const [project] = await getOwnerDb().insert(projects).values({
      title: "RVP-5 Project",
      name: "RVP-5 Project",
      tenantId,
      creatorId: userId,
      createdBy: userId,
      ownerId: userId,
    }).returning();
    projectId = project.id;
  });

  afterAll(async () => {
    if (projectId) { await getOwnerDb().delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {

      try { await getOwnerDb().delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* table may be empty */ }
      await getOwnerDb().delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await getOwnerDb().delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  /**
   * Build a 3-page, published workflow with real content, then pin a run
   * to it and mutate the LIVE workflow underneath that run. The workflow is
   * built directly against `pages`/`steps`/`logicRules` and published
   * with `versionService.publishVersion` AFTER all content exists (rather
   * than via `factory.createWorkflow`, which creates its version BEFORE
   * content is added -- see `api.runs.bulk-values.test.ts` for the fixture
   * pitfall that pattern causes: a run pinned to an empty snapshot).
   */
  async function buildPublishedWorkflowAndRun() {
    const [workflow] = await getOwnerDb().insert(workflows).values({
      title: "RVP-5 Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    const workflowId = workflow.id;

    const [page1] = await getOwnerDb().insert(pages).values({
      workflowId, title: "Intro", order: 0,
    }).returning();
    const [page2] = await getOwnerDb().insert(pages).values({
      workflowId, title: "Details", order: 1,
    }).returning();
    const [page3] = await getOwnerDb().insert(pages).values({
      workflowId, title: "Final", order: 2,
    }).returning();

    const [stepName] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page1.id, type: "short_text",
      title: "Your name", alias: "name", required: true, order: 0,
    }).returning();
    const [stepToDelete] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page1.id, type: "short_text",
      title: "About to be deleted", alias: "toDelete", required: false, order: 1,
    }).returning();
    const [stepWantsExtra] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page1.id, type: "short_text",
      title: "Want extra detail?", alias: "wantsExtra", required: true, order: 2,
    }).returning();
    const [stepExtraDetail] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page1.id, type: "short_text",
      title: "Extra detail", alias: "extraDetail", required: false, order: 3,
    }).returning();

    const [stepDetail1] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page2.id, type: "short_text",
      title: "Detail", alias: "detail1", required: true, order: 0,
    }).returning();

    const [stepFinal1] = await getOwnerDb().insert(steps).values({
      workflowId, pageId: page3.id, type: "short_text",
      title: "Final answer", alias: "final1", required: true, order: 0,
    }).returning();

    // Rule: hide `extraDetail` when `wantsExtra` == 'no'. This is the rule
    // consequence-4's mutation targets: extraDetail's OWN `required` flag is
    // false, so it is required only if this rule's hide action does NOT
    // apply -- making it a decisive test of which copy of the rule (pinned
    // vs. live) the server actually used.
    const [rule] = await getOwnerDb().insert(logicRules).values({
      workflowId,
      conditionStepId: stepWantsExtra.id,
      when: buildTestWhen(stepWantsExtra.id, "equals", "no"),
      targetType: "step",
      targetStepId: stepExtraDetail.id,
      action: "hide",
      order: 1,
    }).returning();

    // Publish AFTER all content exists: publishVersion serializes the LIVE
    // tables at call time, so this snapshot captures every page/step/rule
    // created above.
    const publishedVersion = await versionService.publishVersion(workflowId, userId, "rvp5 publish");

    const run = await runService.createRun(workflow.id, userId, {});
    expect(run.workflowVersionId).toBe(publishedVersion.id);

    return {
      workflowId,
      page1, page2, page3,
      stepName, stepToDelete, stepWantsExtra, stepExtraDetail, stepDetail1, stepFinal1,
      rule,
      run,
    };
  }

  async function cleanupWorkflow(workflowId: string): Promise<void> {
    await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
    await getOwnerDb().delete(logicRules).where(eq(logicRules.workflowId, workflowId));
    await getOwnerDb().delete(steps).where(eq(steps.workflowId, workflowId));
    await getOwnerDb().delete(pages).where(eq(pages.workflowId, workflowId));
    // workflow_versions has no direct FK cascade from workflows in this
    // schema's delete order used elsewhere in this file's sibling
    // (run-version-pinning-rvp6.test.ts); workflow delete cascades it.
    await getOwnerDb().delete(workflows).where(eq(workflows.id, workflowId));
  }

  it(
    "survives a deleted question, a mid-run required question, a deleted page, and an edited logic rule -- and completes",
    async () => {

    enterTenantContextForTests(tenantId);
      const {
        workflowId, page1, page2, page3,
        stepName, stepToDelete, stepWantsExtra, stepExtraDetail, stepDetail1, stepFinal1,
        rule, run,
      } = await buildPublishedWorkflowAndRun();

      try {
        // The run starts on page1, resolved from the pinned definition at
        // creation (RVP-2's evaluateNavigation).
        expect(run.currentPageId).toBe(page1.id);

        // ---- Mutate the LIVE workflow underneath the in-flight run ----

        // Consequence 1: delete a question. Soft-delete (ICW2-B1) is how the
        // app actually removes a step -- the row survives so step_values
        // stays valid, but live-table readers (`stepRepo.findByPageId`
        // etc.) filter it out via `deletedAt IS NULL`.
        await getOwnerDb().update(steps).set({ deletedAt: new Date() }).where(eq(steps.id, stepToDelete.id));

        // Consequence 2: add a REQUIRED question mid-run, directly to the
        // live `steps` table (bypassing the version snapshot entirely --
        // exactly what an author editing the published workflow does). It
        // belongs to page3, which the respondent has not reached yet.
        const [liveOnlyRequired] = await getOwnerDb().insert(steps).values({
          workflowId, pageId: page3.id, type: "short_text",
          title: "Added after the run started", alias: "liveOnlyRequired",
          required: true, order: 1,
        }).returning();

        // Consequence 3: delete a page. Soft-delete again -- the run's
        // pinned graph still has page2's snapshot, so navigation and
        // submission must still walk through it.
        await getOwnerDb().update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, page2.id));

        // Consequence 4: edit a logic rule. Flip the SAME rule's action from
        // 'hide' to 'require', keeping the same condition/target. If the
        // server were reading the live rule, submitting wantsExtra='no'
        // would now REQUIRE extraDetail (which the respondent is never
        // asked for) instead of hiding it.
        await getOwnerDb().update(logicRules).set({ action: "require" }).where(eq(logicRules.id, rule.id));

        // ---- Drive the run through to completion using the PINNED definition ----

        const page1Submit = await runService.submitPage(run.id, page1.id, userId, [
          { stepId: stepName.id, value: "Ada" },
          // Deleted-from-live step: the respondent's client still rendered
          // it from the pinned snapshot and submits a value. Must be
          // ACCEPTED, not dropped (RVP-3).
          { stepId: stepToDelete.id, value: "stale but still mine" },
          // Triggers the hide rule (per the PINNED 'hide' action) -- must
          // NOT be forced into visibility/requiredness by the live 'require'
          // edit.
          { stepId: stepWantsExtra.id, value: "no" },
          // Deliberately NOT submitting stepExtraDetail's value.
        ]);
        expect(page1Submit).toEqual({ success: true });

        const afterPage1 = await runService.next(run.id, userId);
        // Deleted-from-live page2 must still be the next page, per the
        // pinned order (RVP-2/3).
        expect(afterPage1.nextPageId).toBe(page2.id);
        expect(afterPage1.visiblePages).toContain(page2.id);
        expect(afterPage1.visiblePages).toContain(page3.id);
        // extraDetail must not be visible or required: the PINNED rule
        // (hide) must have been used, not the live-mutated one (require).
        expect(afterPage1.visibleSteps).not.toContain(stepExtraDetail.id);
        expect(afterPage1.requiredSteps).not.toContain(stepExtraDetail.id);

        const page2Submit = await runService.submitPage(run.id, page2.id, userId, [
          { stepId: stepDetail1.id, value: "Detail answer" },
        ]);
        expect(page2Submit).toEqual({ success: true });

        const afterPage2 = await runService.next(run.id, userId);
        expect(afterPage2.nextPageId).toBe(page3.id);

        // Only answer final1 -- never liveOnlyRequired, which did not exist
        // in this respondent's pinned interview.
        const page3Submit = await runService.submitPage(run.id, page3.id, userId, [
          { stepId: stepFinal1.id, value: "Final answer" },
        ]);
        expect(page3Submit).toEqual({ success: true });

        const afterPage3 = await runService.next(run.id, userId);
        expect(afterPage3.nextPageId).toBeNull();

        // THE assertion that matters most: completion must succeed even
        // though `liveOnlyRequired` -- a required question added to the live
        // workflow after the run started -- was never answered. Pre-fix,
        // this was unrecoverable: `validateCompletion` demanded a step the
        // respondent's client had never shown them, with no action they
        // could take.
        const completedRun = await runService.completeRun(run.id, userId);
        expect(completedRun.completed).toBe(true);

        // The deleted question's answer was persisted, not silently lost.
        const [savedToDelete] = await getOwnerDb().select().from(stepValues)
          .where(eq(stepValues.stepId, stepToDelete.id));
        expect(savedToDelete?.value).toBe("stale but still mine");

        // The live-only required question was never asked and never
        // answered -- completion did not (and could not) demand it.
        const liveOnlyValues = await getOwnerDb().select().from(stepValues)
          .where(eq(stepValues.stepId, liveOnlyRequired.id));
        expect(liveOnlyValues).toHaveLength(0);

        // extraDetail (hidden per the pinned rule) was never answered either.
        const extraDetailValues = await getOwnerDb().select().from(stepValues)
          .where(eq(stepValues.stepId, stepExtraDetail.id));
        expect(extraDetailValues).toHaveLength(0);
      } finally {
        await cleanupWorkflow(workflowId);
      }
    }
  );
});
