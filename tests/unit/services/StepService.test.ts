import { describe, it, expect, beforeEach, vi } from "vitest";
import { StepService } from "../../../server/services/StepService";
import { createTestStep, createTestSection, createTestWorkflow } from "../../factories/workflowFactory";
import type { InsertStep } from "../../../shared/schema";

describe("StepService", () => {
  let service: StepService;
  let mockStepRepo: any;
  let mockSectionRepo: any;
  let mockWorkflowSvc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStepRepo = {
      findById: vi.fn(),
      findBySectionId: vi.fn(),
      findBySectionIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockSectionRepo = {
      findById: vi.fn(),
      findByIdAndWorkflow: vi.fn(),
      findByWorkflowId: vi.fn(),
    };

    mockWorkflowSvc = {
      verifyOwnership: vi.fn(),
      verifyAccess: vi.fn(),
    };

    service = new StepService(mockStepRepo, mockSectionRepo, mockWorkflowSvc);
  });

  describe("createStep", () => {
    it("should create a step with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const existingSteps = [
        createTestStep(section.id, { order: 1 }),
        createTestStep(section.id, { order: 2 }),
      ];

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "New Step",
        required: false,
        options: {},
        order: 1,
      };

      const createdStep = createTestStep(section.id, { ...newStepData, order: 3 });

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue(existingSteps);
      mockStepRepo.create.mockResolvedValue(createdStep);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(result.order).toBe(3);
      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: section.id,
          order: 3,
        })
      );
    });

    it("should create step with order 1 if section is empty", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "First Step",
        required: false,
        options: {},
        order: 1,
      };

      const createdStep = createTestStep(section.id, { ...newStepData, order: 1 });

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(result.order).toBe(1);
    });

    it("should validate alias uniqueness before creating", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const existingSteps = [
        createTestStep(section.id, { alias: "firstName" }),
      ];

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "Duplicate Alias",
        alias: "firstName",
        required: false,
        options: {},
        order: 1,
      };

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", newStepData)
      ).rejects.toThrow("Alias \"firstName\" is already in use");
    });

    it("should allow creating step with null alias", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "No Alias Step",
        alias: null,
        required: false,
        options: {},
        order: 1,
      };

      const createdStep = createTestStep(section.id, { ...newStepData });

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(result.alias).toBeNull();
    });

    it("should throw error if section not found", async () => {
      const workflow = createTestWorkflow();

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "New Step",
        required: false,
        options: {},
        order: 1,
      };

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(null);

      await expect(
        service.createStep(workflow.id, "nonexistent-section", "user-123", newStepData)
      ).rejects.toThrow("Section not found");
    });

    it("should verify workflow ownership", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId"> = {
        type: "short_text",
        title: "New Step",
        required: false,
        options: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createStep(workflow.id, section.id, "other-user", newStepData)
      ).rejects.toThrow("Access denied");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "other-user");
    });
  });

  describe("updateStep", () => {
    it("should update step successfully", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);
      const updatedStep = { ...step, title: "Updated Title" };

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.update.mockResolvedValue(updatedStep);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      expect(mockStepRepo.update).toHaveBeenCalledWith(step.id, { title: "Updated Title" });
    });

    it("should validate alias uniqueness when updating alias", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { alias: "oldAlias" });
      const existingSteps = [
        step,
        createTestStep(section.id, { alias: "newAlias" }),
      ];

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { alias: "newAlias" })
      ).rejects.toThrow("Alias \"newAlias\" is already in use");
    });

    it("should allow updating step without changing alias", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { alias: "myAlias" });
      const updatedStep = { ...step, title: "Updated" };

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.update.mockResolvedValue(updatedStep);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated",
      });

      expect(result.title).toBe("Updated");
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyOwnership.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateStep("nonexistent", "workflow-123", "user-123", { title: "Updated" })
      ).rejects.toThrow("Step not found");
    });

    it("should throw error if step does not belong to workflow", async () => {
      const workflow = createTestWorkflow();
      const otherWorkflow = createTestWorkflow();
      const section = createTestSection(otherWorkflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { title: "Updated" })
      ).rejects.toThrow("Step not found in this workflow");
    });
  });

  describe("deleteStep", () => {
    it("should delete step successfully", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.delete.mockResolvedValue(undefined);

      await service.deleteStep(step.id, workflow.id, "user-123");

      expect(mockStepRepo.delete).toHaveBeenCalledWith(step.id);
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyOwnership.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteStep("nonexistent", "workflow-123", "user-123")
      ).rejects.toThrow("Step not found");
    });

    it("should throw error if step does not belong to workflow", async () => {
      const workflow = createTestWorkflow();
      const otherWorkflow = createTestWorkflow();
      const section = createTestSection(otherWorkflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyOwnership.mockResolvedValue(workflow);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

      await expect(
        service.deleteStep(step.id, workflow.id, "user-123")
      ).rejects.toThrow("Step not found in this workflow");
    });
  });
});
