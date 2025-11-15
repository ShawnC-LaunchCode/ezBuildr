import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkflowService } from "../../../server/services/WorkflowService";
import { createTestWorkflow, createTestSection, createTestStep, createTestLogicRule } from "../../factories/workflowFactory";
import type { InsertWorkflow } from "@shared/schema";

describe("WorkflowService", () => {
  let service: WorkflowService;
  let mockWorkflowRepo: any;
  let mockSectionRepo: any;
  let mockStepRepo: any;
  let mockLogicRuleRepo: any;
  let mockWorkflowAccessRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock repositories
    mockWorkflowRepo = {
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn((callback) => callback({})),
    };

    mockSectionRepo = {
      findByWorkflowId: vi.fn(),
      create: vi.fn(),
    };

    mockStepRepo = {
      findBySectionIds: vi.fn(),
    };

    mockLogicRuleRepo = {
      findByWorkflowId: vi.fn(),
    };

    mockWorkflowAccessRepo = {
      hasAccess: vi.fn(),
    };

    service = new WorkflowService(
      mockWorkflowRepo,
      mockSectionRepo,
      mockStepRepo,
      mockLogicRuleRepo,
      mockWorkflowAccessRepo
    );
  });

  describe("verifyOwnership", () => {
    it("should return workflow if user is the creator", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      const result = await service.verifyOwnership(workflow.id, "user-123");

      expect(result).toEqual(workflow);
      expect(mockWorkflowRepo.findById).toHaveBeenCalledWith(workflow.id);
    });

    it("should throw error if workflow not found", async () => {
      mockWorkflowRepo.findById.mockResolvedValue(null);

      await expect(service.verifyOwnership("workflow-123", "user-123")).rejects.toThrow(
        "Workflow not found"
      );
    });

    it("should throw error if user is not the creator", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      await expect(service.verifyOwnership(workflow.id, "other-user")).rejects.toThrow(
        "Access denied - you do not own this workflow"
      );
    });
  });

  describe("createWorkflow", () => {
    it("should create workflow with default first section", async () => {
      const workflowData: InsertWorkflow = {
        projectId: "project-123",
        name: "My Workflow",
        title: "My Workflow",
        description: "Test workflow",
        tenantId: "tenant-123",
      };

      const createdWorkflow = createTestWorkflow({
        ...workflowData,
        creatorId: "user-123",
        ownerId: "user-123",
        status: "draft",
      });

      const createdSection = createTestSection(createdWorkflow.id, {
        title: "Section 1",
        order: 1,
      });

      mockWorkflowRepo.create.mockResolvedValue(createdWorkflow);
      mockSectionRepo.create.mockResolvedValue(createdSection);

      const result = await service.createWorkflow(workflowData, "user-123");

      expect(result).toEqual(createdWorkflow);
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...workflowData,
          creatorId: "user-123",
          ownerId: "user-123",
          status: "draft",
        }),
        {}
      );
      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        {
          workflowId: createdWorkflow.id,
          title: "Section 1",
          order: 1,
        },
        {}
      );
    });
  });

  describe("getWorkflowWithDetails", () => {
    it("should return workflow with sections, steps, and logic rules", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const sections = [
        createTestSection(workflow.id, { title: "Section 1", order: 1 }),
        createTestSection(workflow.id, { title: "Section 2", order: 2 }),
      ];
      const steps = [
        createTestStep(sections[0].id, { title: "Step 1", order: 1 }),
        createTestStep(sections[0].id, { title: "Step 2", order: 2 }),
        createTestStep(sections[1].id, { title: "Step 3", order: 1 }),
      ];
      const logicRules = [createTestLogicRule(workflow.id)];

      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockSectionRepo.findByWorkflowId.mockResolvedValue(sections);
      mockStepRepo.findBySectionIds.mockResolvedValue(steps);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue(logicRules);

      const result = await service.getWorkflowWithDetails(workflow.id, "user-123");

      expect(result.id).toBe(workflow.id);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].steps).toHaveLength(2);
      expect(result.sections[1].steps).toHaveLength(1);
      expect(result.logicRules).toHaveLength(1);
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      await expect(service.getWorkflowWithDetails(workflow.id, "other-user")).rejects.toThrow(
        "Access denied"
      );
    });
  });

  describe("listWorkflows", () => {
    it("should return all workflows for a user", async () => {
      const workflows = [
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 1" }),
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 2" }),
      ];

      mockWorkflowRepo.findByCreatorId.mockResolvedValue(workflows);

      const result = await service.listWorkflows("user-123");

      expect(result).toEqual(workflows);
      expect(result).toHaveLength(2);
      expect(mockWorkflowRepo.findByCreatorId).toHaveBeenCalledWith("user-123");
    });

    it("should return empty array if user has no workflows", async () => {
      mockWorkflowRepo.findByCreatorId.mockResolvedValue([]);

      const result = await service.listWorkflows("user-123");

      expect(result).toEqual([]);
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow if user is the owner", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const updatedWorkflow = { ...workflow, title: "Updated Title" };

      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.updateWorkflow(workflow.id, "user-123", {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(workflow.id, {
        title: "Updated Title",
      });
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      await expect(
        service.updateWorkflow(workflow.id, "other-user", { title: "Updated" })
      ).rejects.toThrow("Access denied");
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete workflow if user is the owner", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });

      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.delete.mockResolvedValue(undefined);

      await service.deleteWorkflow(workflow.id, "user-123");

      expect(mockWorkflowRepo.delete).toHaveBeenCalledWith(workflow.id);
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      await expect(service.deleteWorkflow(workflow.id, "other-user")).rejects.toThrow(
        "Access denied"
      );
    });
  });

  describe("changeStatus", () => {
    it("should change workflow status to open", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "draft" });
      const updatedWorkflow = { ...workflow, status: "open" as const };

      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.changeStatus(workflow.id, "user-123", "open");

      expect(result.status).toBe("open");
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(workflow.id, { status: "open" });
    });

    it("should change workflow status to closed", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "open" });
      const updatedWorkflow = { ...workflow, status: "closed" as const };

      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.changeStatus(workflow.id, "user-123", "closed");

      expect(result.status).toBe("closed");
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findById.mockResolvedValue(workflow);

      await expect(service.changeStatus(workflow.id, "other-user", "open")).rejects.toThrow(
        "Access denied"
      );
    });
  });
});
