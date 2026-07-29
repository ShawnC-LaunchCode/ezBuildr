import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { SectionService } from "../../../server/services/SectionService";
import { sectionRepository, workflowRepository, stepRepository, stepValueRepository, logicRuleRepository } from "../../../server/repositories";
import { createTestSection, createTestStep, createTestLogicRule, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import { LIMITS } from "@shared/limits";

import type { Section, Step } from "@shared/schema";

// duplicateSection wraps its writes in db.transaction; the fake just invokes
// the callback with a stub tx (the mocked repos below ignore it).
vi.mock("../../../server/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
// Mock the repositories and services
vi.mock("../../../server/repositories", () => ({
  sectionRepository: {
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
    findBySectionId: vi.fn(),
    findByWorkflowIdWithAliases: vi.fn(),
    countByWorkflowId: vi.fn(),
    create: vi.fn(),
    softDeleteBySectionId: vi.fn(),
    restoreBySectionId: vi.fn(),
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

describe("SectionService", () => {
  let service: SectionService;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockStepValueRepo: Mocked<typeof stepValueRepository>;
  let mockLogicRuleRepo: Mocked<typeof logicRuleRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockStepValueRepo = stepValueRepository as Mocked<typeof stepValueRepository>;
    mockLogicRuleRepo = logicRuleRepository as Mocked<typeof logicRuleRepository>;

    mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });
    mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([]);
    mockStepRepo.countByWorkflowId.mockResolvedValue(0);
    mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

    service = new SectionService({
      sectionRepo: mockSectionRepo,
      workflowRepo: workflowRepository as Mocked<typeof workflowRepository>,
      stepRepo: mockStepRepo,
      workflowSvc: mockWorkflowSvc,
      stepValueRepo: mockStepValueRepo,
      logicRuleRepo: mockLogicRuleRepo,
    });
  });

  describe("createSection", () => {
    it("should create the section, return it, and check access with (workflowId, userId)", async () => {
      const workflow = createTestWorkflow();
      const created = createTestSection(workflow.id, { order: 1, title: "First Section" });

      mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
      mockSectionRepo.create.mockResolvedValue(created as unknown as Section);

      const result = await service.createSection(workflow.id, "user-123", {
        title: "First Section",
      });

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      // Empty workflow → first section gets order 1.
      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: 1 })
      );
      expect(result).toBe(created);
    });

    it("should create a section with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const existing = [
        createTestSection(workflow.id, { order: 1 }),
        createTestSection(workflow.id, { order: 2 }),
      ];
      const created = createTestSection(workflow.id, { order: 3 });

      mockSectionRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Section[]);
      mockSectionRepo.create.mockResolvedValue(created as unknown as Section);

      await service.createSection(workflow.id, "user-123", { title: "New Section" });

      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: 3 })
      );
    });

    it("should reject creation once the workflow section limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const existing = Array.from({ length: LIMITS.MAX_SECTIONS_PER_WORKFLOW }, (_, i) =>
        createTestSection(workflow.id, { order: i })
      );
      mockSectionRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Section[]);

      await expect(
        service.createSection(workflow.id, "user-123", { title: "One too many" })
      ).rejects.toThrow(/Section limit reached/);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it("should throw when the user lacks access", async () => {
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createSection("wf-1", "user-123", { title: "Nope" })
      ).rejects.toThrow("Access denied");
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it("should propagate a workflow-not-found error and not create anything", async () => {
      // verifyAccess is the single gate for both existence and authorization;
      // a missing workflow surfaces as its thrown "not found" error.
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Workflow not found"));

      await expect(
        service.createSection("missing-wf", "user-123", { title: "Orphan" })
      ).rejects.toThrow(/not found/);
      expect(mockSectionRepo.findByWorkflowId).not.toHaveBeenCalled();
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteSection (ICW2-B1)", () => {
    it("soft-deletes the section and cascades to its steps instead of a hard DELETE", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);

      await service.deleteSection(section.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      expect(mockStepRepo.softDeleteBySectionId).toHaveBeenCalledWith(section.id, expect.anything());
      expect(mockSectionRepo.softDelete).toHaveBeenCalledWith(section.id, expect.anything());
      expect(mockSectionRepo.delete).not.toHaveBeenCalled();
    });

    it("throws if the section is not found", async () => {
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.deleteSection("missing-section", "workflow-1", "user-123")
      ).rejects.toThrow("Section not found");
      expect(mockSectionRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("restoreSection (ICW2-B1)", () => {
    it("restores the section and cascades restore to its steps under edit access", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id, { deletedAt: new Date() });

      mockSectionRepo.findByIdIncludingDeleted.mockResolvedValue(section as unknown as Section);
      mockSectionRepo.restore.mockResolvedValue({ ...section, deletedAt: null } as unknown as Section);

      const restored = await service.restoreSection(section.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      expect(mockStepRepo.restoreBySectionId).toHaveBeenCalledWith(section.id, expect.anything());
      expect(mockSectionRepo.restore).toHaveBeenCalledWith(section.id, expect.anything());
      expect(restored.deletedAt).toBeNull();
    });

    it("throws if the section does not exist at all", async () => {
      mockSectionRepo.findByIdIncludingDeleted.mockResolvedValue(undefined);

      await expect(service.restoreSection("nonexistent", "user-123")).rejects.toThrow("Section not found");
    });
  });

  describe("getSectionDeleteImpact (ICW2-13)", () => {
    it("should aggregate the answer/run counts across every step in the section (AC3)", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const steps = [
        createTestStep(section.id, { order: 1 }),
        createTestStep(section.id, { order: 2 }),
        createTestStep(section.id, { order: 3 }),
      ];

      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue(steps as unknown as Step[]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 9, runCount: 4 });

      const result = await service.getSectionDeleteImpact(section.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      // Aggregation is delegated to the repo, but it must be given every step id
      // in the section (including virtual/computed steps, which cascade too).
      expect(mockStepRepo.findBySectionId).toHaveBeenCalledWith(section.id, undefined, true);
      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith(
        steps.map((s) => s.id)
      );
      expect(result).toEqual({ answerCount: 9, runCount: 4 });
    });

    it("should return zero counts for a section with no steps", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

      const result = await service.getSectionDeleteImpact(section.id, workflow.id, "user-123");

      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith([]);
      expect(result).toEqual({ answerCount: 0, runCount: 0 });
    });

    it("should throw if the section is not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.getSectionDeleteImpact("missing-section", "workflow-1", "user-123")
      ).rejects.toThrow("Section not found");
      expect(mockStepValueRepo.countImpactForSteps).not.toHaveBeenCalled();
    });
  });

  describe("getSectionDeleteImpactById (ICW2-13)", () => {
    it("should look up the workflow from the section and delegate to getSectionDeleteImpact", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const steps = [createTestStep(section.id, { order: 1 })];

      mockSectionRepo.findById.mockResolvedValue(section);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.findBySectionId.mockResolvedValue(steps as unknown as Step[]);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 3, runCount: 2 });

      const result = await service.getSectionDeleteImpactById(section.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(section.workflowId, "user-123", "edit");
      expect(result).toEqual({ answerCount: 3, runCount: 2 });
    });

    it("should throw when the section does not exist", async () => {
      mockSectionRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.getSectionDeleteImpactById("nonexistent", "user-123")
      ).rejects.toThrow("Section not found");
    });
  });

  describe("duplicateSection (ICW2-B5)", () => {
    it("duplicates the section, its steps (fresh aliases), and its section-scoped logic rules", async () => {
      const workflow = createTestWorkflow();
      const source = createTestSection(workflow.id, { order: 1, title: "Original" });
      const sibling = createTestSection(workflow.id, { order: 2, title: "Later page" });
      const step1 = createTestStep(source.id, { order: 1, alias: "name", workflowId: workflow.id });
      const step2 = createTestStep(source.id, { order: 2, alias: null, workflowId: workflow.id });
      const rule = createTestLogicRule(workflow.id, {
        conditionStepId: step1.id,
        targetType: "step",
        targetStepId: step2.id,
        targetSectionId: null,
      });

      mockSectionRepo.findById.mockResolvedValue(source);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([source, sibling] as unknown as Section[]);
      mockStepRepo.findBySectionId.mockResolvedValue([step1, step2] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1, step2] as unknown as Step[]);

      const newSection = createTestSection(workflow.id, { order: 2, title: "Original" });
      mockSectionRepo.create.mockResolvedValue(newSection);
      const newStep1 = createTestStep(newSection.id, { order: 1, alias: "name_copy", workflowId: workflow.id });
      const newStep2 = createTestStep(newSection.id, { order: 2, alias: null, workflowId: workflow.id });
      mockStepRepo.create
        .mockResolvedValueOnce(newStep1)
        .mockResolvedValueOnce(newStep2);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);

      const result = await service.duplicateSection(source.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");

      // Later sibling shifts down by one to make room.
      expect(mockSectionRepo.updateOrder).toHaveBeenCalledWith(
        sibling.id, workflow.id, sibling.order + 1, expect.anything()
      );

      // New section inserted immediately after the source.
      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: workflow.id, order: source.order + 1 }),
        expect.anything()
      );

      // Each step copied with a fresh, non-colliding alias — never verbatim.
      expect(mockStepRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sectionId: newSection.id, alias: "name_copy", order: step1.order }),
        expect.anything()
      );
      expect(mockStepRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ sectionId: newSection.id, alias: null, order: step2.order }),
        expect.anything()
      );

      // The section-scoped rule is copied with both step ids remapped onto the copies.
      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: workflow.id,
          conditionStepId: newStep1.id,
          targetStepId: newStep2.id,
        }),
        expect.anything()
      );

      expect(result).toBe(newSection);
    });

    // DEBT-12: conditionStepId/targetStepId are remapped by direct idMap lookups,
    // but ids embedded *inside* conditionValue go through the shared
    // remapJsonIds walker. Nothing here covered that until now — the walker
    // could be neutered entirely and every test in this file still passed.
    it("remaps step ids embedded inside the rule's conditionValue jsonb", async () => {
      const workflow = createTestWorkflow();
      const source = createTestSection(workflow.id, { order: 1, title: "Original" });
      const step1 = createTestStep(source.id, { order: 1, alias: "name", workflowId: workflow.id });
      const step2 = createTestStep(source.id, { order: 2, alias: "email", workflowId: workflow.id });
      const rule = createTestLogicRule(workflow.id, {
        conditionStepId: step1.id,
        targetType: "step",
        targetStepId: step2.id,
        targetSectionId: null,
        conditionValue: {
          stepId: step1.id,
          nested: { alsoAStep: step2.id, untouched: "not-an-id" },
          list: [step1.id, "literal"],
        },
      });

      mockSectionRepo.findById.mockResolvedValue(source);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Section[]);
      mockStepRepo.findBySectionId.mockResolvedValue([step1, step2] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1, step2] as unknown as Step[]);

      const newSection = createTestSection(workflow.id, { order: 2, title: "Original" });
      mockSectionRepo.create.mockResolvedValue(newSection);
      const newStep1 = createTestStep(newSection.id, { order: 1, alias: "name_copy", workflowId: workflow.id });
      const newStep2 = createTestStep(newSection.id, { order: 2, alias: "email_copy", workflowId: workflow.id });
      mockStepRepo.create
        .mockResolvedValueOnce(newStep1)
        .mockResolvedValueOnce(newStep2);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([rule]);

      await service.duplicateSection(source.id, "user-123");

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conditionValue: {
            stepId: newStep1.id,
            nested: { alsoAStep: newStep2.id, untouched: "not-an-id" },
            list: [newStep1.id, "literal"],
          },
        }),
        expect.anything()
      );
    });

    it("skips a workflow rule whose condition step is outside the duplicated section", async () => {
      const workflow = createTestWorkflow();
      const source = createTestSection(workflow.id, { order: 1 });
      const step1 = createTestStep(source.id, { order: 1, alias: "q1", workflowId: workflow.id });
      const outsideRule = createTestLogicRule(workflow.id, {
        conditionStepId: "step-outside-the-section",
        targetType: "section",
        targetStepId: null,
        targetSectionId: source.id,
      });

      mockSectionRepo.findById.mockResolvedValue(source);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Section[]);
      mockStepRepo.findBySectionId.mockResolvedValue([step1] as unknown as Step[]);
      mockStepRepo.countByWorkflowId.mockResolvedValue(1);
      mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([step1] as unknown as Step[]);

      const newSection = createTestSection(workflow.id, { order: 2 });
      mockSectionRepo.create.mockResolvedValue(newSection);
      mockStepRepo.create.mockResolvedValue(
        createTestStep(newSection.id, { order: 1, alias: "q1_copy", workflowId: workflow.id })
      );
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([outsideRule]);

      await service.duplicateSection(source.id, "user-123");

      // conditionStepId has no entry in the id map (it wasn't duplicated) — skip, don't guess.
      expect(mockLogicRuleRepo.create).not.toHaveBeenCalled();
    });

    it("throws Section not found for a missing section", async () => {
      mockSectionRepo.findById.mockResolvedValue(undefined);

      await expect(service.duplicateSection("missing", "user-123")).rejects.toThrow("Section not found");
      expect(mockWorkflowSvc.verifyAccess).not.toHaveBeenCalled();
    });

    it("rejects once the workflow section limit is reached", async () => {
      const workflow = createTestWorkflow();
      const source = createTestSection(workflow.id, { order: 1 });
      const existing = Array.from({ length: LIMITS.MAX_SECTIONS_PER_WORKFLOW }, (_, i) =>
        createTestSection(workflow.id, { order: i })
      );

      mockSectionRepo.findById.mockResolvedValue(source);
      mockSectionRepo.findByWorkflowId.mockResolvedValue(existing as unknown as Section[]);

      await expect(service.duplicateSection(source.id, "user-123")).rejects.toThrow(/Section limit reached/);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });

    it("rejects when copying the section's steps would exceed the workflow step cap", async () => {
      const workflow = createTestWorkflow();
      const source = createTestSection(workflow.id, { order: 1 });
      const steps = [
        createTestStep(source.id, { order: 1, workflowId: workflow.id }),
        createTestStep(source.id, { order: 2, workflowId: workflow.id }),
      ];

      mockSectionRepo.findById.mockResolvedValue(source);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([source] as unknown as Section[]);
      mockStepRepo.findBySectionId.mockResolvedValue(steps as unknown as Step[]);
      // Already at the cap; duplicating 2 more steps must be rejected.
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW - 1);

      await expect(service.duplicateSection(source.id, "user-123")).rejects.toThrow(/Question limit reached/);
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });
  });
});
