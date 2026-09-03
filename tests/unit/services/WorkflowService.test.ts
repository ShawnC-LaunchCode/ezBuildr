import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from "vitest";

// Use dynamic import for service to ensure mocks apply
// import { WorkflowService } from "../../../server/services/WorkflowService";
import { aclService } from "../../../server/services/AclService";
import { createTestWorkflow, createTestPage, createTestLogicRule } from "../../factories/workflowFactory";
import { DEFAULT_RESOLVED_BRANDING } from "../../../shared/types/branding";
import { enterTenantContextForTests } from "../../../server/utils/rlsContext";
import { db } from "../../../server/db";

import type { InsertWorkflow, Project } from "../../../shared/schema";
import type { WorkflowService } from "../../../server/services/WorkflowService";
import type {
  WorkflowRepository,
  PageRepository,
  StepRepository,
  LogicRuleRepository,
  ProjectRepository,
  WorkflowAccessRepository,
  DbTransaction
} from "../../../server/repositories";

const validUUID = "123e4567-e89b-12d3-a456-426614174000";

// RLS-2e: WorkflowService now opens a tenant-scoped transaction via
// `withCurrentTenant`/`withTenant` (server/utils/rlsContext.ts), which
// internally calls the real `db.transaction`. This suite calls WorkflowService
// directly (not through HTTP), so — per the RLS rollout's measured hazard —
// `enterTenantContextForTests` must be called INSIDE each test body
// (beforeEach does not propagate through AsyncLocalStorage into the test).
// The mocked `db.transaction` below must hand back a stub `tx` with a working
// `execute` (used by `applyTenantToTransaction` to set the GUC) or the whole
// chain throws "tx.execute is not a function".
const TEST_TENANT_ID = "tenant-workflow-service-test";

vi.mock("../../../server/db", () => {
  // RLS-2e: getWorkflowWithDetails now reads via `scopedTx.query...`, not
  // `db.query...` — the same `query` object is exposed on both the plain
  // `db` mock AND the stub `tx` handed to db.transaction's callback, so
  // either access path resolves.
  const query = {
    workflowVersions: {
      findFirst: vi.fn(),
    },
    transformBlocks: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return {
    db: {
      query,
      // syncWithGraph's soft-delete cascade (ICW2-B11) and
      // getWorkflowWithDetails's transaction both run inside db.transaction;
      // the fake invokes the callback with a stub tx exposing `execute`
      // (applyTenantToTransaction's GUC set) and the same `query` object.
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ execute: vi.fn().mockResolvedValue(undefined), query })
      ),
    },
    initializeDatabase: vi.fn(),
  };
});

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
    pageRepo: PageRepository,
    stepRepo: StepRepository,
    logicRuleRepo: LogicRuleRepository,
    workflowAccessRepo: WorkflowAccessRepository,
    projectRepo: ProjectRepository,
    brandingSvc: { resolveForWorkflow: Mock }
  ) => WorkflowService;

  let mockWorkflowRepo: Mocked<WorkflowRepository>;
  let mockPageRepo: Mocked<PageRepository>;
  let mockStepRepo: Mocked<StepRepository>;
  let mockLogicRuleRepo: Mocked<LogicRuleRepository>;
  let mockWorkflowAccessRepo: Mocked<WorkflowAccessRepository>;
  let mockProjectRepo: Mocked<ProjectRepository>;
  let mockBrandingSvc: { resolveForWorkflow: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-mock DB for this test context to avoid setup.ts pollution
    vi.mock("../../../server/db", () => {
      const query = {
        workflowVersions: {
          findFirst: vi.fn(),
        },
        transformBlocks: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      return {
        db: {
          query,
          transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({ execute: vi.fn().mockResolvedValue(undefined), query })
          ),
        },
      };
    });

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
      findPublicLinksByPrefix: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (callback: (tx: DbTransaction) => Promise<unknown>) => callback({} as DbTransaction)),
      moveToProject: vi.fn(),
      findUnfiledByCreatorId: vi.fn(),
      countByCreatorId: vi.fn(),
      findAll: vi.fn(),
    } as unknown as Mocked<WorkflowRepository>;

    mockPageRepo = {
      findByWorkflowId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
      findById: vi.fn(),
    } as unknown as Mocked<PageRepository>;

    mockStepRepo = {
      findByPageIds: vi.fn(),
      softDeleteByPageId: vi.fn(),
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
      pageRepo: PageRepository,
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
      mockPageRepo,
      mockStepRepo,
      mockLogicRuleRepo,
      mockWorkflowAccessRepo,
      mockProjectRepo,
      mockBrandingSvc
    );
  });

  describe("verifyOwnership", () => {
    it("should return workflow if user is the creator", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      const result = await service.verifyOwnership(workflow.id, "user-123");
      expect(result).toEqual(workflow);
      expect(mockWorkflowRepo.findByIdOrSlug).toHaveBeenCalledWith(workflow.id, expect.any(Object));
    });
    it("should throw error if workflow not found", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(null);
      await expect(service.verifyOwnership("workflow-123", "user-123")).rejects.toThrow(
        "Workflow not found"
      );
    });
    it("should throw error if user is not the creator", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      await expect(service.verifyOwnership(workflow.id, "other-user")).rejects.toThrow(
        "Access denied - you do not own this workflow"
      );
    });
  });
  describe("createWorkflow", () => {
    it("should create workflow with default first page", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
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
      const createdPage = createTestPage(createdWorkflow.id, {
        title: "Page 1",
        order: 1,
      });
      mockProjectRepo.findById.mockResolvedValue({ id: "project-123", ownerType: "user", ownerUuid: "user-123" } as unknown as Project);
      mockWorkflowRepo.create.mockResolvedValue(createdWorkflow);
      mockPageRepo.create.mockResolvedValue(createdPage);
      const result = await service.createWorkflow(workflowData, "user-123");
      expect(result).toEqual(createdWorkflow);
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...workflowData,
          creatorId: "user-123",
          ownerId: "user-123",
          status: "draft",
        }),
        expect.any(Object)
      );
      expect(mockPageRepo.create).toHaveBeenCalledWith(
        {
          workflowId: createdWorkflow.id,
          title: "Page 1",
          order: 1,
        },
        expect.any(Object)
      );
      // AC5: one transaction at the service boundary, shared by both
      // repositories — not merely two calls each scoped to "some" tx.
      const workflowCreateTx = mockWorkflowRepo.create.mock.calls[0][1];
      const pageCreateTx = mockPageRepo.create.mock.calls[0][1];
      expect(workflowCreateTx).toBeDefined();
      expect(workflowCreateTx).toBe(pageCreateTx);
    });
  });
  describe("getWorkflowWithDetails", () => {
    // RLS-4 precondition 4 (closed). `getWorkflowWithDetails` now threads its
    // own `tx` parameter straight into `BrandingService.resolveForWorkflow`
    // instead of branching on whether it opened its own transaction.
    // `BrandingService` itself decides how to run: reuse the caller's tx
    // (VersionService.serializeWorkflowInTx's case — this is what used to
    // deadlock the size-1 pool) or open its own short transaction against
    // the ambient tenant (the top-level, no-tx case). Either way branding
    // resolution is real, not a synchronous workflow-only fallback.
    //
    // These two tests are what stands between that and a silent
    // customer-visible bug: if `tx` ever stopped being threaded through, the
    // builder (or the nested VersionService path) would silently render
    // default branding and every other assertion in this file would still
    // pass.
    it("resolves REAL branding on the top-level path (no caller tx)", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockPageRepo.findByWorkflowId.mockResolvedValue([]);
      mockStepRepo.findByPageIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

      await service.getWorkflowWithDetails(validUUID, "user-123");

      expect(mockBrandingSvc.resolveForWorkflow).toHaveBeenCalledTimes(1);
      expect(mockBrandingSvc.resolveForWorkflow).toHaveBeenCalledWith(validUUID, workflow.settings, undefined);
    });

    it("resolves REAL branding through the caller's transaction when nested inside one", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockPageRepo.findByWorkflowId.mockResolvedValue([]);
      mockStepRepo.findByPageIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

      // A caller-supplied tx is what VersionService.serializeWorkflowInTx
      // passes; the pool read here is what used to deadlock. The fake only
      // needs the one drizzle accessor the nested path touches.
      const callerTx = {
        query: {
          transformBlocks: { findMany: vi.fn().mockResolvedValue([]) },
          workflowVersions: { findFirst: vi.fn().mockResolvedValue(null) },
        },
      } as never;
      await service.getWorkflowWithDetails(validUUID, "user-123", callerTx);

      expect(mockBrandingSvc.resolveForWorkflow).toHaveBeenCalledWith(validUUID, workflow.settings, callerTx);
    });

    it("should return workflow with pages, steps, and logic rules", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const pages = [
        createTestPage(validUUID),
        createTestPage(validUUID),
      ];
      const logicRules = [createTestLogicRule(validUUID)];
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockPageRepo.findByWorkflowId.mockResolvedValue(pages);
      mockStepRepo.findByPageIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue(logicRules);
      const result = await service.getWorkflowWithDetails(validUUID, "user-123");
      expect(result.id).toBe(workflow.id);
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].steps).toHaveLength(0);
      expect(result.pages[1].steps).toHaveLength(0);
      expect(result.logicRules).toHaveLength(1);
    });
    it("should throw error if user does not own workflow", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);
      await expect(service.getWorkflowWithDetails(workflow.id, "other-user")).rejects.toThrow(
        "Access denied"
      );
    });
    // The top-level, no-`tx` call (every caller except VersionService) must
    // resolve REAL tenant-aware branding through BrandingService. This test
    // asserts `mockBrandingSvc.resolveForWorkflow` was called with the real
    // values and returned; a regression that stopped threading `tx` through
    // or reintroduced a synchronous fallback would turn it red.
    it("returns server-resolved branding so preview matches production (GH-158 O-9)", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
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
      mockPageRepo.findByWorkflowId.mockResolvedValue([]);
      mockStepRepo.findByPageIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

      const result = await service.getWorkflowWithDetails(validUUID, "user-123");

      expect(result.branding).toEqual(tenantResolved);
      expect(mockBrandingSvc.resolveForWorkflow).toHaveBeenCalledWith(validUUID, workflow.settings, undefined);
    });
  });
  describe("listWorkflows", () => {
    it("should return all workflows for a user", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflows = [
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 1" }),
        createTestWorkflow({ creatorId: "user-123", title: "Workflow 2" }),
      ];
      mockWorkflowRepo.findByUserAccess.mockResolvedValue(workflows);
      const result = await service.listWorkflows("user-123");
      expect(result).toEqual(workflows);
      expect(result).toHaveLength(2);
      expect(mockWorkflowRepo.findByUserAccess).toHaveBeenCalledWith("user-123", undefined, expect.any(Object));
    });
    it("should return empty array if user has no workflows", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      mockWorkflowRepo.findByUserAccess.mockResolvedValue([]);
      const result = await service.listWorkflows("user-123");
      expect(result).toEqual([]);
    });
  });
  describe("updateWorkflow", () => {
    it("should update workflow if user is the owner", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const updatedWorkflow = { ...workflow, title: "Updated Title" };
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);
      const result = await service.updateWorkflow(workflow.id, "user-123", {
        title: "Updated Title",
      });
      expect(result.title).toBe("Updated Title");
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(
        workflow.id,
        { title: "Updated Title" },
        expect.any(Object)
      );
    });
    it("should throw error if user does not own workflow", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
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
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.delete.mockResolvedValue(undefined);
      await service.deleteWorkflow(workflow.id, "user-123");
      expect(mockWorkflowRepo.delete).toHaveBeenCalledWith(workflow.id, expect.any(Object));
    });
    it("should throw error if user does not own workflow", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
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
      enterTenantContextForTests(TEST_TENANT_ID);
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
      // RLS-2e: moveToProject now opens its transaction via
      // withCurrentTenant -> db.transaction (not workflowRepo.transaction,
      // which it no longer calls), and its `scopedTx.update(workflowRuns)`
      // call needs `update` on the stub tx alongside `execute` (used by
      // applyTenantToTransaction to set the GUC).
      const mockTx = { update: updateMock, execute: vi.fn().mockResolvedValue(undefined) } as unknown as DbTransaction;
      vi.mocked(db.transaction).mockImplementationOnce(
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
      enterTenantContextForTests(TEST_TENANT_ID);
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
      const mockTx = { update: updateMock, execute: vi.fn().mockResolvedValue(undefined) } as unknown as DbTransaction;
      vi.mocked(db.transaction).mockImplementationOnce(
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
      enterTenantContextForTests(TEST_TENANT_ID);
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
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "draft" });
      const updatedWorkflow = { ...workflow, status: "active" as const };
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);
      const result = await service.changeStatus(workflow.id, "user-123", "active");
      expect(result.status).toBe("active");
      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(
        workflow.id,
        {
          status: "active",
          currentVersionId: "version-1",
          // Publishing is what makes the workflow reachable, so it turns on
          // public access and mints the participant link in the same write.
          isPublic: true,
          publicLink: expect.any(String) as unknown as string,
        },
        expect.any(Object)
      );
      // Uniqueness is checked against public_link, not the slug column.
      expect(mockWorkflowRepo.findPublicLinksByPrefix).toHaveBeenCalled();
    });
    it("should reuse an existing public link rather than minting a second one", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({
        creatorId: "user-123",
        status: "draft",
        publicLink: "already-shared",
      });
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue({ ...workflow, status: "active" as const });

      await service.changeStatus(workflow.id, "user-123", "active");

      expect(mockWorkflowRepo.update).toHaveBeenCalledWith(
        workflow.id,
        expect.objectContaining({ isPublic: true, publicLink: "already-shared" }),
        expect.any(Object)
      );
      // A link already in circulation must never be regenerated — that would
      // silently break every copy of it participants already hold.
      expect(mockWorkflowRepo.findPublicLinksByPrefix).not.toHaveBeenCalled();
    });
    it("should change workflow status to archived", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const workflow = createTestWorkflow({ creatorId: "user-123", status: "active" });
      const updatedWorkflow = { ...workflow, status: "archived" as const };
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(workflow);
      mockWorkflowRepo.findById.mockResolvedValue(workflow);
      mockWorkflowRepo.update.mockResolvedValue(updatedWorkflow);
      const result = await service.changeStatus(workflow.id, "user-123", "archived");
      expect(result.status).toBe("archived");
    });
    it("should throw error if user does not own workflow", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
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

    it("soft-deletes the removed final page AND cascades to its steps instead of hard-deleting either", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      const finalPage = createTestPage("wf-1", {
        id: "final-page-1",
        config: { finalBlock: true },
      });
      mockPageRepo.findByWorkflowId.mockResolvedValue([finalPage]);

      // No 'final' node in the graph anymore — the page should be removed.
      const graphJson: SyncGraphJson = { nodes: [{ type: "question" }] };

      await service.syncWithGraph("wf-1", graphJson, "user-1");

      expect(mockStepRepo.softDeleteByPageId).toHaveBeenCalledWith(
        "final-page-1",
        expect.anything()
      );
      expect(mockPageRepo.softDelete).toHaveBeenCalledWith("final-page-1", expect.anything());
      expect(mockPageRepo.delete).not.toHaveBeenCalled();
    });

    it("does nothing when there is no existing final page to remove", async () => {
      enterTenantContextForTests(TEST_TENANT_ID);
      mockPageRepo.findByWorkflowId.mockResolvedValue([]);

      const graphJson: SyncGraphJson = { nodes: [{ type: "question" }] };

      await service.syncWithGraph("wf-1", graphJson, "user-1");

      expect(mockPageRepo.softDelete).not.toHaveBeenCalled();
      expect(mockStepRepo.softDeleteByPageId).not.toHaveBeenCalled();
    });
  });
});