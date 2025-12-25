import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
// Use dynamic import for service to ensure mocks apply
// import { WorkflowService } from "../../../server/services/WorkflowService";
import { aclService } from "../../../server/services/AclService";
import { createTestWorkflow, createTestSection, createTestStep, createTestLogicRule } from "../../factories/workflowFactory";
import type { InsertWorkflow } from "../../../shared/schema";

const validUUID = "123e4567-e89b-12d3-a456-426614174000";

vi.mock("../../../server/db", () => ({
  db: {
    query: {
      workflowVersions: {
        findFirst: vi.fn(),
      },
    },
  },
  initializeDatabase: vi.fn(),
}));

vi.mock("../../../server/services/AclService", () => ({
  aclService: {
    hasWorkflowRole: vi.fn().mockResolvedValue(true),
    hasProjectRole: vi.fn().mockResolvedValue(true),
  },
}));

describe("WorkflowService", () => {
  let service: any;
  let WorkflowServiceClass: any;
  let mockWorkflowRepo: any;
  let mockSectionRepo: any;
  let mockStepRepo: any;
  let mockLogicRuleRepo: any;
  let mockWorkflowAccessRepo: any;
  let mockProjectRepo: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-mock DB for this test context to avoid setup.ts pollution
    vi.mock("../../../server/db", () => ({
      db: {
        query: {
          workflowVersions: {
            findFirst: vi.fn(),
          },
        },
      },
    }));

    // Setup AclService Mocks
    (aclService.hasWorkflowRole as Mock).mockResolvedValue(true);
    (aclService.hasProjectRole as Mock).mockResolvedValue(true);

    mockWorkflowRepo = {
      findById: vi.fn(),
      findByIdOrSlug: vi.fn(),
      findByCreatorId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByUserAccess: vi.fn(),
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

    mockProjectRepo = {
      findById: vi.fn(),
    };

    // Dynamic import to pick up mocks
    const module = await import("../../../server/services/WorkflowService");
    WorkflowServiceClass = module.WorkflowService;

    service = new WorkflowServiceClass(
      mockWorkflowRepo,
      mockSectionRepo,
      mockStepRepo,
      mockLogicRuleRepo,
      mockWorkflowAccessRepo,
      mockProjectRepo
    );
  });

  describe("verifyOwnership", () => {
    it("should return workflow if user is the creator", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);

      const result = await service.verifyOwnership(workflow.id, "user-123");

      expect(result).toEqual(workflow);
      expect(mockWorkflowRepo.findByIdOrSlug).toHaveBeenCalledWith(workflow.id);
    });

    it("should throw error if workflow not found", async () => {
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(null);

      await expect(service.verifyOwnership("workflow-123", "user-123")).rejects.toThrow(
        "Workflow not found"
      );
    });

    it("should throw error if user is not the creator", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);

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
        creatorId: "user-123",
        ownerId: "user-123",
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
        createTestSection(validUUID),
        createTestSection(validUUID),
      ];
      const logicRules = [createTestLogicRule(validUUID)];

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockSectionRepo.findByWorkflowId.mockResolvedValue(sections);
      mockStepRepo.findBySectionIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue(logicRules);

      const result = await service.getWorkflowWithDetails(validUUID, "user-123");

      expect(result.id).toBe(workflow.id);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].steps).toHaveLength(0);
      expect(result.sections[1].steps).toHaveLength(0);
      expect(result.logicRules).toHaveLength(1);
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);

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

      // mockWorkflowRepo.findByUserAccess.mockResolvedValue(workflows);
      // Force mock on instance to avoid reference disconnects
      vi.spyOn((service as any).workflowRepo, 'findByUserAccess').mockResolvedValue(workflows);


      const result = await service.listWorkflows("user-123");

      expect(result).toEqual(workflows);
      expect(result).toHaveLength(2);
      expect(mockWorkflowRepo.findByUserAccess).toHaveBeenCalledWith("user-123");
    });

    it("should return empty array if user has no workflows", async () => {
      // mockWorkflowRepo.findByUserAccess.mockResolvedValue([]);
      vi.spyOn((service as any).workflowRepo, 'findByUserAccess').mockResolvedValue([]);

      const result = await service.listWorkflows("user-123");

      expect(result).toEqual([]);
    });
  });

  describe("updateWorkflow", () => {
    it("should update workflow if user is the owner", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const updatedWorkflow = { ...workflow, title: "Updated Title" };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
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
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);

      await expect(
        service.updateWorkflow(workflow.id, "other-user", { title: "Updated" })
      ).rejects.toThrow("Access denied");
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete workflow if user is the owner", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.delete.mockResolvedValue(undefined);

      await service.deleteWorkflow(workflow.id, "user-123");

      expect(mockWorkflowRepo.delete).toHaveBeenCalledWith(workflow.id);
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);

      await expect(service.deleteWorkflow(workflow.id, "other-user")).rejects.toThrow(
        "Access denied"
      );
    });
  });

  describe("changeStatus", () => {
    it("should change workflow status to active", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "draft" });
      const updatedWorkflow = { ...workflow, status: "active" as const };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.changeStatus(workflow.id, "user-123", "active");

      expect(result.status).toBe("active");
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(workflow.id, { status: "active" });
    });

    it("should change workflow status to archived", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "active" });
      const updatedWorkflow = { ...workflow, status: "archived" as const };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.changeStatus(workflow.id, "user-123", "archived");

      expect(result.status).toBe("archived");
    });

    it("should throw error if user does not own workflow", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);

      await expect(service.changeStatus(workflow.id, "other-user", "active")).rejects.toThrow(
        "Access denied"
      );
    });
  });
});
