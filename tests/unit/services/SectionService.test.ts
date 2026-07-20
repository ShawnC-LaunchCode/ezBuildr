/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { SectionService } from "../../../server/services/SectionService";
import { sectionRepository, workflowRepository, stepRepository, stepValueRepository } from "../../../server/repositories";
import { createTestSection, createTestStep, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import { LIMITS } from "@shared/limits";

import type { Section, Step } from "@shared/schema";

// Mock the repositories and services
vi.mock("../../../server/repositories", () => ({
  sectionRepository: {
    findById: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    findByWorkflowId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateOrder: vi.fn(),
  },
  workflowRepository: {
    findById: vi.fn(),
  },
  stepRepository: {
    findBySectionId: vi.fn(),
  },
  stepValueRepository: {
    countImpactForSteps: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();

    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockStepValueRepo = stepValueRepository as Mocked<typeof stepValueRepository>;

    mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
    mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

    service = new SectionService(
      mockSectionRepo,
      workflowRepository as Mocked<typeof workflowRepository>,
      mockStepRepo,
      mockWorkflowSvc,
      mockStepValueRepo
    );
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
});
