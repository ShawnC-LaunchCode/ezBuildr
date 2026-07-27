/**
 * RVP-5 — end-to-end proof that editing a live workflow cannot break an
 * in-flight run.
 *
 * This is the regression net for the whole Run Version Pinning initiative
 * (RVP-1/2/3/6): before those tickets, every server-side run decision
 * (navigation, section-submit, completion) re-read the LIVE `sections` /
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
 *   3. Delete a section mid-run        -> the run still navigates to it and
 *                                          submits it, using the pinned order.
 *   4. Edit a logic rule mid-run       -> visibility/requiredness is decided
 *      by the rule the respondent's snapshot had, not the live edit.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  workflows,
  sections,
  steps,
  logicRules,
  users,
  tenants,
  projects,
  workflowRuns,
  stepValues,
  auditLogs,
} from "@shared/schema";

import { db } from "../../server/db";
import { runService } from "../../server/services/RunService";
import { versionService } from "../../server/services/VersionService";

describe("RVP-5 mid-run live-workflow edits cannot desync an in-flight run", () => {
  let tenantId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const [tenant] = await db.insert(tenants).values({ name: "RVP-5 Tenant", plan: "pro" }).returning();
    tenantId = tenant.id;
    const [user] = await db.insert(users).values({
      email: `rvp5_${randomUUID().slice(0, 8)}@example.com`,
      fullName: "RVP-5 Tester",
      tenantId,
      role: "admin",
      tenantRole: "owner",
    }).returning();
    userId = user.id;
    const [project] = await db.insert(projects).values({
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
    if (projectId) { await db.delete(projects).where(eq(projects.id, projectId)); }
    if (userId) {
      // eslint-disable-next-line no-empty
      try { await db.delete(auditLogs).where(eq(auditLogs.userId, userId)); } catch (e) { /* table may be empty */ }
      await db.delete(users).where(eq(users.id, userId));
    }
    if (tenantId) { await db.delete(tenants).where(eq(tenants.id, tenantId)); }
  });

  /**
   * Build a 3-section, published workflow with real content, then pin a run
   * to it and mutate the LIVE workflow underneath that run. The workflow is
   * built directly against `sections`/`steps`/`logicRules` and published
   * with `versionService.publishVersion` AFTER all content exists (rather
   * than via `factory.createWorkflow`, which creates its version BEFORE
   * content is added -- see `api.runs.bulk-values.test.ts` for the fixture
   * pitfall that pattern causes: a run pinned to an empty snapshot).
   */
  async function buildPublishedWorkflowAndRun() {
    const [workflow] = await db.insert(workflows).values({
      title: "RVP-5 Interview",
      projectId,
      creatorId: userId,
      ownerId: userId,
      status: "draft",
    }).returning();
    const workflowId = workflow.id;

    const [section1] = await db.insert(sections).values({
      workflowId, title: "Intro", order: 0,
    }).returning();
    const [section2] = await db.insert(sections).values({
      workflowId, title: "Details", order: 1,
    }).returning();
    const [section3] = await db.insert(sections).values({
      workflowId, title: "Final", order: 2,
    }).returning();

    const [stepName] = await db.insert(steps).values({
      workflowId, sectionId: section1.id, type: "short_text",
      title: "Your name", alias: "name", required: true, order: 0,
    }).returning();
    const [stepToDelete] = await db.insert(steps).values({
      workflowId, sectionId: section1.id, type: "short_text",
      title: "About to be deleted", alias: "toDelete", required: false, order: 1,
    }).returning();
    const [stepWantsExtra] = await db.insert(steps).values({
      workflowId, sectionId: section1.id, type: "short_text",
      title: "Want extra detail?", alias: "wantsExtra", required: true, order: 2,
    }).returning();
    const [stepExtraDetail] = await db.insert(steps).values({
      workflowId, sectionId: section1.id, type: "short_text",
      title: "Extra detail", alias: "extraDetail", required: false, order: 3,
    }).returning();

    const [stepDetail1] = await db.insert(steps).values({
      workflowId, sectionId: section2.id, type: "short_text",
      title: "Detail", alias: "detail1", required: true, order: 0,
    }).returning();

    const [stepFinal1] = await db.insert(steps).values({
      workflowId, sectionId: section3.id, type: "short_text",
      title: "Final answer", alias: "final1", required: true, order: 0,
    }).returning();

    // Rule: hide `extraDetail` when `wantsExtra` == 'no'. This is the rule
    // consequence-4's mutation targets: extraDetail's OWN `required` flag is
    // false, so it is required only if this rule's hide action does NOT
    // apply -- making it a decisive test of which copy of the rule (pinned
    // vs. live) the server actually used.
    const [rule] = await db.insert(logicRules).values({
      workflowId,
      conditionStepId: stepWantsExtra.id,
      operator: "equals",
      conditionValue: "no",
      targetType: "step",
      targetStepId: stepExtraDetail.id,
      action: "hide",
      order: 1,
    }).returning();

    // Publish AFTER all content exists: publishVersion serializes the LIVE
    // tables at call time, so this snapshot captures every section/step/rule
    // created above.
    const publishedVersion = await versionService.publishVersion(workflowId, userId, "rvp5 publish");

    const run = await runService.createRun(workflow.id, userId, {});
    expect(run.workflowVersionId).toBe(publishedVersion.id);

    return {
      workflowId,
      section1, section2, section3,
      stepName, stepToDelete, stepWantsExtra, stepExtraDetail, stepDetail1, stepFinal1,
      rule,
      run,
    };
  }

  async function cleanupWorkflow(workflowId: string): Promise<void> {
    await db.delete(workflowRuns).where(eq(workflowRuns.workflowId, workflowId));
    await db.delete(logicRules).where(eq(logicRules.workflowId, workflowId));
    await db.delete(steps).where(eq(steps.workflowId, workflowId));
    await db.delete(sections).where(eq(sections.workflowId, workflowId));
    // workflow_versions has no direct FK cascade from workflows in this
    // schema's delete order used elsewhere in this file's sibling
    // (run-version-pinning-rvp6.test.ts); workflow delete cascades it.
    await db.delete(workflows).where(eq(workflows.id, workflowId));
  }

  it(
    "survives a deleted question, a mid-run required question, a deleted section, and an edited logic rule -- and completes",
    async () => {
      const {
        workflowId, section1, section2, section3,
        stepName, stepToDelete, stepWantsExtra, stepExtraDetail, stepDetail1, stepFinal1,
        rule, run,
      } = await buildPublishedWorkflowAndRun();

      try {
        // The run starts on section1, resolved from the pinned definition at
        // creation (RVP-2's evaluateNavigation).
        expect(run.currentSectionId).toBe(section1.id);

        // ---- Mutate the LIVE workflow underneath the in-flight run ----

        // Consequence 1: delete a question. Soft-delete (ICW2-B1) is how the
        // app actually removes a step -- the row survives so step_values
        // stays valid, but live-table readers (`stepRepo.findBySectionId`
        // etc.) filter it out via `deletedAt IS NULL`.
        await db.update(steps).set({ deletedAt: new Date() }).where(eq(steps.id, stepToDelete.id));

        // Consequence 2: add a REQUIRED question mid-run, directly to the
        // live `steps` table (bypassing the version snapshot entirely --
        // exactly what an author editing the published workflow does). It
        // belongs to section3, which the respondent has not reached yet.
        const [liveOnlyRequired] = await db.insert(steps).values({
          workflowId, sectionId: section3.id, type: "short_text",
          title: "Added after the run started", alias: "liveOnlyRequired",
          required: true, order: 1,
        }).returning();

        // Consequence 3: delete a section. Soft-delete again -- the run's
        // pinned graph still has section2's snapshot, so navigation and
        // submission must still walk through it.
        await db.update(sections).set({ deletedAt: new Date() }).where(eq(sections.id, section2.id));

        // Consequence 4: edit a logic rule. Flip the SAME rule's action from
        // 'hide' to 'require', keeping the same condition/target. If the
        // server were reading the live rule, submitting wantsExtra='no'
        // would now REQUIRE extraDetail (which the respondent is never
        // asked for) instead of hiding it.
        await db.update(logicRules).set({ action: "require" }).where(eq(logicRules.id, rule.id));

        // ---- Drive the run through to completion using the PINNED definition ----

        const section1Submit = await runService.submitSection(run.id, section1.id, userId, [
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
        expect(section1Submit).toEqual({ success: true });

        const afterSection1 = await runService.next(run.id, userId);
        // Deleted-from-live section2 must still be the next section, per the
        // pinned order (RVP-2/3).
        expect(afterSection1.nextSectionId).toBe(section2.id);
        expect(afterSection1.visibleSections).toContain(section2.id);
        expect(afterSection1.visibleSections).toContain(section3.id);
        // extraDetail must not be visible or required: the PINNED rule
        // (hide) must have been used, not the live-mutated one (require).
        expect(afterSection1.visibleSteps).not.toContain(stepExtraDetail.id);
        expect(afterSection1.requiredSteps).not.toContain(stepExtraDetail.id);

        const section2Submit = await runService.submitSection(run.id, section2.id, userId, [
          { stepId: stepDetail1.id, value: "Detail answer" },
        ]);
        expect(section2Submit).toEqual({ success: true });

        const afterSection2 = await runService.next(run.id, userId);
        expect(afterSection2.nextSectionId).toBe(section3.id);

        // Only answer final1 -- never liveOnlyRequired, which did not exist
        // in this respondent's pinned interview.
        const section3Submit = await runService.submitSection(run.id, section3.id, userId, [
          { stepId: stepFinal1.id, value: "Final answer" },
        ]);
        expect(section3Submit).toEqual({ success: true });

        const afterSection3 = await runService.next(run.id, userId);
        expect(afterSection3.nextSectionId).toBeNull();

        // THE assertion that matters most: completion must succeed even
        // though `liveOnlyRequired` -- a required question added to the live
        // workflow after the run started -- was never answered. Pre-fix,
        // this was unrecoverable: `validateCompletion` demanded a step the
        // respondent's client had never shown them, with no action they
        // could take.
        const completedRun = await runService.completeRun(run.id, userId);
        expect(completedRun.completed).toBe(true);

        // The deleted question's answer was persisted, not silently lost.
        const [savedToDelete] = await db.select().from(stepValues)
          .where(eq(stepValues.stepId, stepToDelete.id));
        expect(savedToDelete?.value).toBe("stale but still mine");

        // The live-only required question was never asked and never
        // answered -- completion did not (and could not) demand it.
        const liveOnlyValues = await db.select().from(stepValues)
          .where(eq(stepValues.stepId, liveOnlyRequired.id));
        expect(liveOnlyValues).toHaveLength(0);

        // extraDetail (hidden per the pinned rule) was never answered either.
        const extraDetailValues = await db.select().from(stepValues)
          .where(eq(stepValues.stepId, stepExtraDetail.id));
        expect(extraDetailValues).toHaveLength(0);
      } finally {
        await cleanupWorkflow(workflowId);
      }
    }
  );
});
