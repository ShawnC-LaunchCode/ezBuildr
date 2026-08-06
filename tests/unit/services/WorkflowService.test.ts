import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from "vitest";

// Use dynamic import for service to ensure mocks apply
// import { WorkflowService } from "../../../server/services/WorkflowService";
import { aclService } from "../../../server/services/AclService";
import { createTestWorkflow, createTestSection, createTestLogicRule } from "../../factories/workflowFactory";
import { DEFAULT_RESOLVED_BRANDING } from "../../../shared/types/branding";

import type { InsertWorkflow, Project } from "../../../shared/schema";
import type { WorkflowService } from "../../../server/services/WorkflowService";
import type {
  WorkflowRepository,
  SectionRepository,
  StepRepository,
  LogicRuleRepository,
  ProjectRepository,
  WorkflowAccessRepository,
  DbTransaction
} from "../../../server/repositories";

const validUUID = "123e4567-e89b-12d3-a456-426614174000";

vi.mock("../../../server/db", () => ({
  db: {
    query: {
      workflowVersions: {
        findFirst: vi.fn(),
      },
      transformBlocks: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    // syncWithGraph's soft-delete cascade (ICW2-B11) runs inside
    // db.transaction; the fake just invokes the callback with a stub tx.
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
  initializeDatabase: vi.fn(),
}));

vi.mock("../../../server/services/VersionService", () => ({
  versionService: {
    publishVersion: vi.fn().mockResolvedValue({ id: "version-1" }),
    createDraftVersion: vi.fn().mockResolvedValue({ id: "version-1" }),
    serializeWorkflow: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../../server/services/AclService", () => ({
  aclService: {
    hasWorkflowRole: vi.fn().mockResolvedValue(true),
    hasProjectRole: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../../../server/utils/ownershipAccess", () => ({
  canAccessAsset: vi.fn().mockResolvedValue(false),
  requireAssetAccess: vi.fn(),
  canCreateWithOwnership: vi.fn().mockResolvedValue(true),
}));

describe("WorkflowService", () => {
  let service: WorkflowService;
  let WorkflowServiceClass: new (
    workflowRepo: WorkflowRepository,
    sectionRepo: SectionRepository,
    stepRepo: StepRepository,
    logicRuleRepo: LogicRuleRepository,
    workflowAccessRepo: WorkflowAccessRepository,
    projectRepo: ProjectRepository,
    brandingSvc: { resolveForWorkflow: Mock }
  ) => WorkflowService;

  let mockWorkflowRepo: Mocked<WorkflowRepository>;
  let mockSectionRepo: Mocked<SectionRepository>;
  let mockStepRepo: Mocked<StepRepository>;
  let mockLogicRuleRepo: Mocked<LogicRuleRepository>;
  let mockWorkflowAccessRepo: Mocked<WorkflowAccessRepository>;
  let mockProjectRepo: Mocked<ProjectRepository>;
  let mockBrandingSvc: { resolveForWorkflow: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-mock DB for this test context to avoid setup.ts pollution
    vi.mock("../../../server/db", () => ({
      db: {
        query: {
          workflowVersions: {
            findFirst: vi.fn(),
          },
          transformBlocks: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
      },
    }));

    // Setup AclService Mocks
    (aclService.hasWorkflowRole as Mock).mockResolvedValue(true);
    (aclService.hasProjectRole as Mock).mockResolvedValue(true);

    mockWorkflowRepo = {
      findById: vi.fn(),
      findByIdOrSlug: vi.fn(),
      findBySlug: vi.fn(),
      findByCreatorId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByUserAccess: vi.fn(),
      transaction: vi.fn(async (callback: (tx: DbTransaction) => Promise<unknown>) => callback({} as DbTransaction)),
      moveToProject: vi.fn(),
      findUnfiledByCreatorId: vi.fn(),
      countByCreatorId: vi.fn(),
      findAll: vi.fn(),
    } as unknown as Mocked<WorkflowRepository>;

    mockSectionRepo = {
      findByWorkflowId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
      findById: vi.fn(),
    } as unknown as Mocked<SectionRepository>;

    mockStepRepo = {
      findBySectionIds: vi.fn(),
      softDeleteBySectionId: vi.fn(),
    } as unknown as Mocked<StepRepository>;

    mockLogicRuleRepo = {
      findByWorkflowId: vi.fn(),
    } as unknown as Mocked<LogicRuleRepository>;

    mockWorkflowAccessRepo = {
      hasAccess: vi.fn(),
      findByWorkflowId: vi.fn(),
      upsert: vi.fn(),
      deleteByPrincipal: vi.fn(),
    } as unknown as Mocked<WorkflowAccessRepository>;

    mockProjectRepo = {
      findById: vi.fn(),
    } as unknown as Mocked<ProjectRepository>;

    // Dynamic import to pick up mocks
    const module = await import("../../../server/services/WorkflowService");
    WorkflowServiceClass = module.WorkflowService as unknown as new (
      workflowRepo: WorkflowRepository,
      sectionRepo: SectionRepository,
      stepRepo: StepRepository,
      logicRuleRepo: LogicRuleRepository,
      workflowAccessRepo: WorkflowAccessRepository,
      projectRepo: ProjectRepository,
      brandingSvc: { resolveForWorkflow: Mock }
    ) => WorkflowService;

    // GH-158/O-9: getWorkflowWithDetails resolves branding for the builder
    // preview. Injected so this no-DB suite never reaches the real service.
    mockBrandingSvc = { resolveForWorkflow: vi.fn().mockResolvedValue(DEFAULT_RESOLVED_BRANDING) };

    service = new WorkflowServiceClass(
      mockWorkflowRepo,
      mockSectionRepo,
      mockStepRepo,
      mockLogicRuleRepo,
      mockWorkflowAccessRepo,
      mockProjectRepo,
      mockBrandingSvc
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
      mockProjectRepo.findById.mockResolvedValue({ id: "project-123", ownerType: "user", ownerUuid: "user-123" } as unknown as Project);
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
    it("returns server-resolved branding so preview matches production (GH-158 O-9)", async () => {
      // The builder preview renders from this payload and has no run. Resolving
      // server-side is what lets it show tenant-level branding the workflow's
      // own settings do not carry — previously invisible in preview.
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const tenantResolved = {
        logoUrl: "https://cdn.example/tenant-logo.png",
        faviconUrl: null,
        organizationName: "Tenant Fallback Co",
        primaryColor: "#1D4ED8",
        accentColor: null,
        whiteLabel: false,
      };
      mockBrandingSvc.resolveForWorkflow.mockResolvedValue(tenantResolved);
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
      mockStepRepo.findBySectionIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

      const result = await service.getWorkflowWithDetails(validUUID, "user-123");

      expect(result.branding).toEqual(tenantResolved);
      expect(mockBrandingSvc.resolveForWorkflow).toHaveBeenCalledWith(validUUID, workflow.settings);
    });
  });
  describe("listWorkflows", () => {
    it("should return all workflows for a user", async () => {
      const workflows = [
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 1" }),
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 2" }),
      ];
      mockWorkflowRepo.findByUserAccess.mockResolvedValue(workflows);
      const result = await service.listWorkflows("user-123");
      expect(result).toEqual(workflows);
      expect(result).toHaveLength(2);
      expect(mockWorkflowRepo.findByUserAccess).toHaveBeenCalledWith("user-123");
    });
    it("should return empty array if user has no workflows", async () => {
      mockWorkflowRepo.findByUserAccess.mockResolvedValue([]);
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
  describe("moveToProject", () => {
    it("should reset ownership to the project's owner and update workflow runs in the same transaction", async () => {
      const workflow = createTestWorkflow({
        creatorId: "user-123",
        projectId: null,
        ownerType: "user",
        ownerUuid: "user-123",
      });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockProjectRepo.findById.mockResolvedValue({
        id: "project-123",
        ownerType: "org",
        ownerUuid: "org-456",
      } as unknown as Project);

      const whereMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      const updateMock = vi.fn().mockReturnValue({ set: setMock });
      const mockTx = { update: updateMock } as unknown as DbTransaction;
      mockWorkflowRepo.transaction.mockImplementationOnce(
        async (callback: (tx: DbTransaction) => Promise<unknown>) => callback(mockTx)
      );

      const updatedWorkflow = {
        ...workflow,
        projectId: "project-123",
        ownerType: "org" as const,
        ownerUuid: "org-456",
      };
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.moveToProject(workflow.id, "user-123", "project-123");

      expect(result).toEqual(updatedWorkflow);
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(
        workflow.id,
        { projectId: "project-123", ownerType: "org", ownerUuid: "org-456" },
        mockTx
      );
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith({ ownerType: "org", ownerUuid: "org-456" });
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    // ICW2-17 AC2: moving to unfiled resets ownership to the personal/user model
    // (mirroring createWorkflow's no-projectId branch) and propagates it to
    // workflowRuns, in the same transaction as the workflow update.
    it("should reset ownership to the personal/user model and update workflow runs when moving to unfiled", async () => {
      const workflow = createTestWorkflow({
        creatorId: "user-123",
        projectId: "project-123",
        ownerType: "org",
        ownerUuid: "org-456",
      });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);

      const whereMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      const updateMock = vi.fn().mockReturnValue({ set: setMock });
      const mockTx = { update: updateMock } as unknown as DbTransaction;
      mockWorkflowRepo.transaction.mockImplementationOnce(
        async (callback: (tx: DbTransaction) => Promise<unknown>) => callback(mockTx)
      );

      const updatedWorkflow = {
        ...workflow,
        projectId: null,
        ownerType: "user" as const,
        ownerUuid: "user-123",
      };
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);

      const result = await service.moveToProject(workflow.id, "user-123", null);

      expect(result).toEqual(updatedWorkflow);
      // Unfiled means no target project to resolve access/ownership from.
      expect(mockProjectRepo.findById).not.toHaveBeenCalled();
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(
        workflow.id,
        { projectId: null, ownerType: "user", ownerUuid: "user-123" },
        mockTx
      );
      expect(setMock).toHaveBeenCalledWith({ ownerType: "user", ownerUuid: "user-123" });
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    it("should throw error if user does not have owner access", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);
      await expect(
        service.moveToProject(workflow.id, "other-user", null)
      ).rejects.toThrow("Access denied");
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
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(workflow.id, {
        status: "active",
        currentVersionId: "version-1"
      });
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
  describe("syncWithGraph (ICW2-B11 soft-delete)", () => {
    // Untyped/exported by WorkflowService.ts — mirror its shape here rather
    // than reaching into module internals.
    type SyncGraphJson = Parameters<WorkflowService["syncWithGraph"]>[1];

    it("soft-deletes the removed final section AND cascades to its steps instead of hard-deleting either", async () => {
      const finalSection = createTestSection("wf-1", {
        id: "final-section-1",
        config: { finalBlock: true },
      });
      mockSectionRepo.findByWorkflowId.mockResolvedValue([finalSection]);

      // No 'final' node in the graph anymore — the section should be removed.
      const graphJson: SyncGraphJson = { nodes: [{ type: "question" }] };

      await service.syncWithGraph("wf-1", graphJson, "user-1");

      expect(mockStepRepo.softDeleteBySectionId).toHaveBeenCalledWith(
        "final-section-1",
        expect.anything()
      );
      expect(mockSectionRepo.softDelete).toHaveBeenCalledWith("final-section-1", expect.anything());
      expect(mockSectionRepo.delete).not.toHaveBeenCalled();
    });

    it("does nothing when there is no existing final section to remove", async () => {
      mockSectionRepo.findByWorkflowId.mockResolvedValue([]);

      const graphJson: SyncGraphJson = { nodes: [{ type: "question" }] };

      await service.syncWithGraph("wf-1", graphJson, "user-1");

      expect(mockSectionRepo.softDelete).not.toHaveBeenCalled();
      expect(mockStepRepo.softDeleteBySectionId).not.toHaveBeenCalled();
    });
  });
});