import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { PageService } from "../../../server/services/PageService";
import { pageRepository, workflowRepository, stepRepository, stepValueRepository, logicRuleRepository } from "../../../server/repositories";
import { createTestPage, createTestStep, createTestLogicRule, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import { LIMITS } from "@shared/limits";

import type { Page, Step } from "@shared/schema";

// duplicatePage wraps its writes in db.transaction; the fake just invokes
// the callback with a stub tx (the mocked repos below ignore it).
vi.mock("../../../server/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
// Mock the repositories and services
vi.mock("../../../server/repositories", () => ({
  pageRepository: {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    findByWorkflowId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    updateOrder: vi.fn(),
  },
  workflowRepository: {
    findById: vi.fn(),
  },
  stepRepository: {
    findByPageId: vi.fn(),
    findByWorkflowId: vi.fn(),
    findByWorkflowIdWithAliases: vi.fn(),
    countByWorkflowId: vi.fn(),
    create: vi.fn(),
    softDeleteByPageId: vi.fn(),
    restoreByPageId: vi.fn(),
  },
  stepValueRepository: {
    countImpactForSteps: vi.fn(),
  },
  logicRuleRepository: {
    findByWorkflowId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: {
    verifyAccess: vi.fn(),
  },
}));

describe("PageService", () => {
  let service: PageService;
  let mockPageRepo: Mocked<typeof pageRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockStepValueRepo: Mocked<typeof stepValueRepository>;
  let mockLogicRuleRepo: Mocked<typeof logicRuleRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPageRepo = pageRepository as Mocked<typeof pageRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockStepValueRepo = stepValueRepository as Mocked<typeof stepValueRepository>;
    mockLogicRuleRepo = logicRuleRepository as Mocked<typeof logicRuleRepository>;

    mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
    mockPageRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });
    mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([]);
    mockStepRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepRepo.countByWorkflowId.mockResolvedValue(0);
    mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

    service = new PageService({
      pageRepo: mockPageRepo,
      workflowRepo: workflowRepository as Mocked<typeof workflowRepository>,
      stepRepo: mockStepRepo,
      workflowSvc: mockWorkflowSvc,
      stepValueRepo: mockStepValueRepo,
      logicRuleRepo: mockLogicRuleRepo,
    });
  });

  describe("createPage", () => {
    it("should create the page, return it, and check access with (workflowId, userId)", async () => {
      const workflow = createTestWorkflow();
      const created = createTestPage(workflow.id, { order: 1, title: "First Page" });

      mockPageRepo.findByWorkflowId.mockResolvedValue([]);
      mockPageRepo.create.mockResolvedValue(created as unknown as Page);

      const result = await service.createPage(workflow.id, "user-123", {
        title: "First Page",
      });

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      // Empty workflow → first page gets order 1.
      expect(mockPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: 1 }),
        expect.anything()
      );
      expect(result).toBe(created);
    });

    it("should create a page with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const existing = [
        createTestPage(workflow.id, { order: 1 }),
        createTestPage(workflow.id, { order: 2 }),
      ];
      const created = createTestPage(workflow.id, { order: 3 });

      mockPageRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Page[]);
      mockPageRepo.create.mockResolvedValue(created as unknown as Page);

      await service.createPage(workflow.id, "user-123", { title: "New Page" });

      expect(mockPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: 3 }),
        expect.anything()
      );
    });

    it("should reject creation once the workflow page limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const existing = Array.from({ length: LIMITS.MAX_PAGES_PER_WORKFLOW }, (_, i) =>
        createTestPage(workflow.id, { order: i })
      );
      mockPageRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Page[]);

      await expect(
        service.createPage(workflow.id, "user-123", { title: "One too many" })
      ).rejects.toThrow(/Page limit reached/);
      expect(mockPageRepo.create).not.toHaveBeenCalled();
    });

    it("should throw when the user lacks access", async () => {
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createPage("wf-1", "user-123", { title: "Nope" })
      ).rejects.toThrow("Access denied");
      expect(mockPageRepo.create).not.toHaveBeenCalled();
    });

    it("should propagate a workflow-not-found error and not create anything", async () => {
      // verifyAccess is the single gate for both existence and authorization;
      // a missing workflow surfaces as its thrown "not found" error.
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Workflow not found"));

      await expect(
        service.createPage("missing-wf", "user-123", { title: "Orphan" })
      ).rejects.toThrow(/not found/);
      expect(mockPageRepo.findByWorkflowId).not.toHaveBeenCalled();
      expect(mockPageRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("deletePage (ICW2-B1)", () => {
    it("soft-deletes the page and cascades to its steps instead of a hard DELETE", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);

      await service.deletePage(page.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      expect(mockStepRepo.softDeleteByPageId).toHaveBeenCalledWith(page.id, expect.anything());
      expect(mockPageRepo.softDelete).toHaveBeenCalledWith(page.id, expect.anything());
      expect(mockPageRepo.delete).not.toHaveBeenCalled();
    });

    it("throws if the page is not found", async () => {
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.deletePage("missing-page", "workflow-1", "user-123")
      ).rejects.toThrow("Page not found");
      expect(mockPageRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("restorePage (ICW2-B1)", () => {
    it("restores the page and cascades restore to its steps under edit access", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id, { deletedAt: new Date() });

      mockPageRepo.findByIdIncludingDeleted.mockResolvedValue(page as unknown as Page);
      mockPageRepo.restore.mockResolvedValue({ ...page, deletedAt: null } as unknown as Page);

      const restored = await service.restorePage(page.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      expect(mockStepRepo.restoreByPageId).toHaveBeenCalledWith(page.id, expect.anything());
      expect(mockPageRepo.restore).toHaveBeenCalledWith(page.id, expect.anything());
      expect(restored.deletedAt).toBeNull();
    });

    it("throws if the page does not exist at all", async () => {
      mockPageRepo.findByIdIncludingDeleted.mockResolvedValue(undefined);

      await expect(service.restorePage("nonexistent", "user-123")).rejects.toThrow("Page not found");
    });
  });

  describe("getPageDeleteImpact (ICW2-13)", () => {
    it("should aggregate the answer/run counts across every step in the page (AC3)", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const steps = [
        createTestStep(page.id, { order: 1 }),
        createTestStep(page.id, { order: 2 }),
        createTestStep(page.id, { order: 3 }),
      ];

      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.findByPageId.mockResolvedValue(steps as unknown as Step[]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 9, runCount: 4 });

      const result = await service.getPageDeleteImpact(page.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      // Aggregation is delegated to the repo, but it must be given every step id
      // in the page (including virtual/computed steps, which cascade too).
      expect(mockStepRepo.findByPageId).toHaveBeenCalledWith(page.id, expect.anything(), true);
      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith(
        steps.map((s) => s.id),
        expect.anything()
      );
      expect(result).toEqual({ answerCount: 9, runCount: 4 });
    });

    it("should return zero counts for a page with no steps", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.findByPageId.mockResolvedValue([]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

      const result = await service.getPageDeleteImpact(page.id, workflow.id, "user-123");

      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith([], expect.anything());
      expect(result).toEqual({ answerCount: 0, runCount: 0 });
    });

    it("should throw if the page is not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.getPageDeleteImpact("missing-page", "workflow-1", "user-123")
      ).rejects.toThrow("Page not found");
      expect(mockStepValueRepo.countImpactForSteps).not.toHaveBeenCalled();
    });
  });

  describe("getPageDeleteImpactById (ICW2-13)", () => {
    it("should look up the workflow from the page and delegate to getPageDeleteImpact", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const steps = [createTestStep(page.id, { order: 1 })];

      mockPageRepo.findById.mockResolvedValue(page);
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.findByPageId.mockResolvedValue(steps as unknown as Step[]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 3, runCount: 2 });

      const result = await service.getPageDeleteImpactById(page.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(page.workflowId, "user-123", "edit", expect.anything());
      expect(result).toEqual({ answerCount: 3, runCount: 2 });
    });

    it("should throw when the page does not exist", async () => {
      mockPageRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.getPageDeleteImpactById("nonexistent", "user-123")
      ).rejects.toThrow("Page not found");
    });
  });

  describe("duplicatePage (ICW2-B5)", () => {
    it("duplicates the page, its steps (fresh aliases), and its page-scoped logic rules", async () => {
      const workflow = createTestWorkflow();
      const source = createTestPage(workflow.id, { order: 1, title: "Original" });
      const sibling = createTestPage(workflow.id, { order: 2, title: "Later page" });
      const step1 = createTestStep(source.id, { order: 1, alias: "name", workflowId: workflow.id });
      const step2 = createTestStep(source.id, { order: 2, alias: null, workflowId: workflow.id });
      const rule = createTestLogicRule(workflow.id, {
        conditionStepId: step1.id,
        targetType: "step",
        targetStepId: step2.id,
        targetPageId: null,
      });

      mockPageRepo.findById.mockResolvedValue(source);
      mockPageRepo.findByWorkflowId.mockResolvedValue([source, sibling] as unknown as Page[]);
      mockStepRepo.findByPageId.mockResolvedValue([step1, step2] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1, step2] as unknown as Step[]);

      const newPage = createTestPage(workflow.id, { order: 2, title: "Original" });
      mockPageRepo.create.mockResolvedValue(newPage);
      const newStep1 = createTestStep(newPage.id, { order: 1, alias: "name_copy", workflowId: workflow.id });
      const newStep2 = createTestStep(newPage.id, { order: 2, alias: null, workflowId: workflow.id });
      mockStepRepo.create
        .mockResolvedValueOnce(newStep1)
        .mockResolvedValueOnce(newStep2);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);

      const result = await service.duplicatePage(source.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());

      // Later sibling shifts down by one to make room.
      expect(mockPageRepo.updateOrder).toHaveBeenCalledWith(
        sibling.id, workflow.id, sibling.order + 1, expect.anything()
      );

      // New page inserted immediately after the source.
      expect(mockPageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: source.order + 1 }),
        expect.anything()
      );

      // Each step copied with a fresh, non-colliding alias — never verbatim.
      expect(mockStepRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ pageId: newPage.id, alias: "name_copy", order: step1.order }),
        expect.anything()
      );
      expect(mockStepRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pageId: newPage.id, alias: null, order: step2.order }),
        expect.anything()
      );

      // The page-scoped rule is copied with both step ids remapped onto the copies.
      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: workflow.id,
          conditionStepId: newStep1.id,
          targetStepId: newStep2.id,
        }),
        expect.anything()
      );

      expect(result).toBe(newPage);
    });

    // DEBT-12: conditionStepId/targetStepId are remapped by direct idMap lookups,
    // but ids embedded *inside* `when` go through the shared remapJsonIds
    // walker. Nothing here covered that until now — the walker could be
    // neutered entirely and every test in this file still passed.
    it("remaps step ids embedded inside the rule's when jsonb", async () => {
      const workflow = createTestWorkflow();
      const source = createTestPage(workflow.id, { order: 1, title: "Original" });
      const step1 = createTestStep(source.id, { order: 1, alias: "name", workflowId: workflow.id });
      const step2 = createTestStep(source.id, { order: 2, alias: "email", workflowId: workflow.id });
      const rule = createTestLogicRule(workflow.id, {
        conditionStepId: step1.id,
        targetType: "step",
        targetStepId: step2.id,
        targetPageId: null,
        when: {
          stepId: step1.id,
          nested: { alsoAStep: step2.id, untouched: "not-an-id" },
          list: [step1.id, "literal"],
        },
      });

      mockPageRepo.findById.mockResolvedValue(source);
      mockPageRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Page[]);
      mockStepRepo.findByPageId.mockResolvedValue([step1, step2] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1, step2] as unknown as Step[]);

      const newPage = createTestPage(workflow.id, { order: 2, title: "Original" });
      mockPageRepo.create.mockResolvedValue(newPage);
      const newStep1 = createTestStep(newPage.id, { order: 1, alias: "name_copy", workflowId: workflow.id });
      const newStep2 = createTestStep(newPage.id, { order: 2, alias: "email_copy", workflowId: workflow.id });
      mockStepRepo.create
        .mockResolvedValueOnce(newStep1)
        .mockResolvedValueOnce(newStep2);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);

      await service.duplicatePage(source.id, "user-123");

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          when: {
            stepId: newStep1.id,
            nested: { alsoAStep: newStep2.id, untouched: "not-an-id" },
            list: [newStep1.id, "literal"],
          },
        }),
        expect.anything()
      );
    });

    it("skips a workflow rule whose condition step is outside the duplicated page", async () => {
      const workflow = createTestWorkflow();
      const source = createTestPage(workflow.id, { order: 1 });
      const step1 = createTestStep(source.id, { order: 1, alias: "q1", workflowId: workflow.id });
      const outsideRule = createTestLogicRule(workflow.id, {
        conditionStepId: "step-outside-the-page",
        targetType: "page",
        targetStepId: null,
        targetPageId: source.id,
      });

      mockPageRepo.findById.mockResolvedValue(source);
      mockPageRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Page[]);
      mockStepRepo.findByPageId.mockResolvedValue([step1] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(1);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1] as unknown as Step[]);

      const newPage = createTestPage(workflow.id, { order: 2 });
      mockPageRepo.create.mockResolvedValue(newPage);
      mockStepRepo.create.mockResolvedValue(
        createTestStep(newPage.id, { order: 1, alias: "q1_copy", workflowId: workflow.id })
      );
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([outsideRule]);

      await service.duplicatePage(source.id, "user-123");

      // conditionStepId has no entry in the id map (it wasn't duplicated) — skip, don't guess.
      expect(mockLogicRuleRepo.create).not.toHaveBeenCalled();
    });

    it("throws Page not found for a missing page", async () => {
      mockPageRepo.findById.mockResolvedValue(undefined);

      await expect(service.duplicatePage("missing", "user-123")).rejects.toThrow("Page not found");
      expect(mockWorkflowSvc.verifyAccess).not.toHaveBeenCalled();
    });

    it("rejects once the workflow page limit is reached", async () => {
      const workflow = createTestWorkflow();
      const source = createTestPage(workflow.id, { order: 1 });
      const existing = Array.from({ length: LIMITS.MAX_PAGES_PER_WORKFLOW }, (_, i) =>
        createTestPage(workflow.id, { order: i })
      );

      mockPageRepo.findById.mockResolvedValue(source);
      mockPageRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Page[]);

      await expect(service.duplicatePage(source.id, "user-123")).rejects.toThrow(/Page limit reached/);
      expect(mockPageRepo.create).not.toHaveBeenCalled();
    });

    it("rejects when copying the page's steps would exceed the workflow step cap", async () => {
      const workflow = createTestWorkflow();
      const source = createTestPage(workflow.id, { order: 1 });
      const steps = [
        createTestStep(source.id, { order: 1, workflowId: workflow.id }),
        createTestStep(source.id, { order: 2, workflowId: workflow.id }),
      ];

      mockPageRepo.findById.mockResolvedValue(source);
      mockPageRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Page[]);
      mockStepRepo.findByPageId.mockResolvedValue(steps as unknown as Step[]);
      // Already at the cap; duplicating 2 more steps must be rejected.
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW - 1);

      await expect(service.duplicatePage(source.id, "user-123")).rejects.toThrow(/Question limit reached/);
      expect(mockPageRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("reorderPages (MAP-B4)", () => {
    it("succeeds and reports the skip_to rule the reorder just turned backward", async () => {
      const workflow = createTestWorkflow();
      // Post-reorder state: the condition's page (A) now sits AFTER the
      // rule's target page (C) — a forward skip turned backward.
      const pageA = createTestPage(workflow.id, { id: "page-a", order: 2, title: "Page A" });
      const pageB = createTestPage(workflow.id, { id: "page-b", order: 1, title: "Page B" });
      const pageC = createTestPage(workflow.id, { id: "page-c", order: 0, title: "Page C" });
      const conditionStep = createTestStep(pageA.id, {
        id: "step-q1",
        workflowId: workflow.id,
        alias: "q1",
      });
      const rule = createTestLogicRule(workflow.id, {
        id: "rule-1",
        conditionStepId: conditionStep.id,
        action: "skip_to",
        targetType: "page",
        targetStepId: null,
        targetPageId: pageC.id,
      });

      mockPageRepo.findByWorkflowId.mockResolvedValue(
        [pageA, pageB, pageC] as unknown as Page[]
      );
      mockStepRepo.findByWorkflowId.mockResolvedValue([conditionStep] as unknown as Step[]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);

      const result = await service.reorderPages(workflow.id, "user-123", [
        { id: pageA.id, order: 2 },
        { id: pageB.id, order: 1 },
        { id: pageC.id, order: 0 },
      ]);

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      // The reorder itself is not gated by the finding — every order write happens.
      expect(mockPageRepo.updateOrder).toHaveBeenCalledWith(pageA.id, workflow.id, 2, expect.anything());
      expect(mockPageRepo.updateOrder).toHaveBeenCalledWith(pageB.id, workflow.id, 1, expect.anything());
      expect(mockPageRepo.updateOrder).toHaveBeenCalledWith(pageC.id, workflow.id, 0, expect.anything());

      expect(result.affectedSkipRules).toEqual([
        {
          ruleId: rule.id,
          conditionPageId: pageA.id,
          conditionPageTitle: "Page A",
          targetPageId: pageC.id,
          targetPageTitle: "Page C",
        },
      ]);
    });

    it("returns no warning when the reorder breaks nothing, even though a real skip_to rule exists", async () => {
      const workflow = createTestWorkflow();
      // Forward order preserved: condition page (A, order 0) comes before
      // the target (C, order 2) — the rule still fires.
      const pageA = createTestPage(workflow.id, { id: "page-a", order: 0, title: "Page A" });
      const pageB = createTestPage(workflow.id, { id: "page-b", order: 1, title: "Page B" });
      const pageC = createTestPage(workflow.id, { id: "page-c", order: 2, title: "Page C" });
      const conditionStep = createTestStep(pageA.id, {
        id: "step-q1",
        workflowId: workflow.id,
        alias: "q1",
      });
      const rule = createTestLogicRule(workflow.id, {
        id: "rule-1",
        conditionStepId: conditionStep.id,
        action: "skip_to",
        targetType: "page",
        targetStepId: null,
        targetPageId: pageC.id,
      });

      mockPageRepo.findByWorkflowId.mockResolvedValue(
        [pageA, pageB, pageC] as unknown as Page[]
      );
      mockStepRepo.findByWorkflowId.mockResolvedValue([conditionStep] as unknown as Step[]);
      // Sanity check: the fixture really does carry a skip_to rule — an empty
      // rules array would trivially pass this test for the wrong reason.
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);
      expect(rule.action).toBe("skip_to");

      const result = await service.reorderPages(workflow.id, "user-123", [
        { id: pageB.id, order: 1 },
        { id: pageC.id, order: 2 },
      ]);

      expect(result.affectedSkipRules).toEqual([]);
      expect(mockPageRepo.updateOrder).toHaveBeenCalled();
    });

    it("ignores rules that are not a page-targeting skip_to (show/hide/require, or targeting a step)", async () => {
      const workflow = createTestWorkflow();
      const pageA = createTestPage(workflow.id, { id: "page-a", order: 1, title: "Page A" });
      const pageB = createTestPage(workflow.id, { id: "page-b", order: 0, title: "Page B" });
      const conditionStep = createTestStep(pageA.id, { id: "step-q1", workflowId: workflow.id });
      const targetStep = createTestStep(pageB.id, { id: "step-q2", workflowId: workflow.id });

      const showRule = createTestLogicRule(workflow.id, {
        id: "rule-show",
        conditionStepId: conditionStep.id,
        action: "show",
        targetType: "step",
        targetStepId: targetStep.id,
        targetPageId: null,
      });
      const stepSkipRule = createTestLogicRule(workflow.id, {
        id: "rule-step-skip",
        conditionStepId: conditionStep.id,
        action: "skip_to",
        targetType: "step",
        targetStepId: targetStep.id,
        targetPageId: null,
      });

      mockPageRepo.findByWorkflowId.mockResolvedValue([pageA, pageB] as unknown as Page[]);
      mockStepRepo.findByWorkflowId.mockResolvedValue(
        [conditionStep, targetStep] as unknown as Step[]
      );
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([showRule, stepSkipRule]);

      const result = await service.reorderPages(workflow.id, "user-123", [
        { id: pageA.id, order: 1 },
        { id: pageB.id, order: 0 },
      ]);

      expect(result.affectedSkipRules).toEqual([]);
    });

    it("throws when the user lacks edit access, and never writes an order", async () => {
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.reorderPages("wf-1", "user-123", [{ id: "page-a", order: 0 }])
      ).rejects.toThrow("Access denied");
      expect(mockPageRepo.updateOrder).not.toHaveBeenCalled();
    });
  });
});
