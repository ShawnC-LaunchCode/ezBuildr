/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { StepService } from "../../../server/services/StepService";
import { stepRepository, sectionRepository } from "../../../server/repositories";
import { createTestStep, createTestSection, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import type { InsertStep } from "@shared/schema";

// Mock the repositories and services
vi.mock("../../../server/repositories");
vi.mock("../../../server/services/WorkflowService");

describe("StepService", () => {
  let service: StepService;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStepRepo = stepRepository;
    mockSectionRepo = sectionRepository;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;

    // Setup default mock implementations
    mockStepRepo.findById.mockResolvedValue(null);
    mockStepRepo.findBySectionId.mockResolvedValue([]);
    mockStepRepo.findBySectionIds.mockResolvedValue([]);

    mockSectionRepo.findById.mockResolvedValue(null);
    mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(null);
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);

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

      const newStepData: Omit<InsertStep, 'sectionId'> = {
        type: "short_text",
        title: "New Step",
        required: false,
        options: {},
      };

      const createdStep = createTestStep(section.id, { ...newStepData, order: 3 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined); // void return
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue(existingSteps as unknown as Step[]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData as InsertStep);

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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps as unknown as Step[]);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", newStepData as InsertStep)
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData as InsertStep);

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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(null);

      await expect(
        service.createStep(workflow.id, "nonexistent-section", "user-123", newStepData as InsertStep)
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
        service.createStep(workflow.id, section.id, "other-user", newStepData as InsertStep)
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.update.mockResolvedValue(updatedStep as unknown as Step);

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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps as unknown as Step[]);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { alias: "newAlias" })
      ).rejects.toThrow("Alias \"newAlias\" is already in use");
    });

    it("should allow updating step without changing alias", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { alias: "myAlias" });
      const updatedStep = { ...step, title: "Updated" };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.update.mockResolvedValue(updatedStep as unknown as Step);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated",
      });

      expect(result.title).toBe("Updated");
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.delete.mockResolvedValue(undefined);
      mockStepRepo.delete.mockResolvedValue(undefined);

      await service.deleteStep(step.id, workflow.id, "user-123");

      expect(mockStepRepo.delete).toHaveBeenCalledWith(step.id);
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(undefined);
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

      await expect(
        service.deleteStep(step.id, workflow.id, "user-123")
      ).rejects.toThrow("Step not found in this workflow");
    });
  });
});
