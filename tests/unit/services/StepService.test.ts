
import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { StepService, generateAliasFromLabel } from "../../../server/services/StepService";
import {
  stepRepository,
  pageRepository,
  stepValueRepository,
  transformBlockRepository,
  documentHookRepository,
  lifecycleHookRepository,
} from "../../../server/repositories";
import { createTestStep, createTestPage, createTestWorkflow } from "../../factories/workflowFactory";
import { workflowService } from "../../../server/services/WorkflowService";

import { LIMITS } from "@shared/limits";

import type { InsertStep, Step } from "@shared/schema";

// duplicateStep wraps its writes in db.transaction; the fake just invokes
// the callback with a stub tx (the mocked repo below ignores it).
vi.mock("../../../server/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
// Mock the repositories and services
vi.mock("../../../server/repositories", () => ({
  stepRepository: {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findByPageId: vi.fn(),
    findByPageIds: vi.fn(),
    countByWorkflowId: vi.fn(),
    updateOrder: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
  pageRepository: {
    findById: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    findByWorkflowId: vi.fn(),
  },
  stepValueRepository: {
    countImpactForSteps: vi.fn(),
  },
  // Exercised for real (not stubbed at the AliasRenameService boundary) by
  // the "follow-the-label" alias-regenerate test below, since propagateRename
  // now runs atomically and un-mocked repos would reject instead of no-op.
  transformBlockRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  documentHookRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  lifecycleHookRepository: {
    findByWorkflowId: vi.fn(),
    update: vi.fn(),
  },
  sectionRepository: {
    findByWorkflowId: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  },
}));
vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: {
    verifyAccess: vi.fn(),
  },
}));

describe("StepService", () => {
  let service: StepService;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockPageRepo: Mocked<typeof pageRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;
  let mockStepValueRepo: Mocked<typeof stepValueRepository>;
  let mockTransformRepo: Mocked<typeof transformBlockRepository>;
  let mockDocHookRepo: Mocked<typeof documentHookRepository>;
  let mockLifecycleRepo: Mocked<typeof lifecycleHookRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockPageRepo = pageRepository as Mocked<typeof pageRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;
    mockStepValueRepo = stepValueRepository as Mocked<typeof stepValueRepository>;
    mockTransformRepo = transformBlockRepository as Mocked<typeof transformBlockRepository>;
    mockDocHookRepo = documentHookRepository as Mocked<typeof documentHookRepository>;
    mockLifecycleRepo = lifecycleHookRepository as Mocked<typeof lifecycleHookRepository>;

    // Setup default mock implementations
    mockStepRepo.findById.mockResolvedValue(undefined);
    mockStepRepo.findByPageId.mockResolvedValue([]);
    mockStepRepo.findByPageIds.mockResolvedValue([]);
    mockStepRepo.countByWorkflowId.mockResolvedValue(0);

    mockPageRepo.findById.mockResolvedValue(undefined);
    mockPageRepo.findByIdAndWorkflow.mockResolvedValue(undefined);
    mockPageRepo.findByWorkflowId.mockResolvedValue([]);

    mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

    // propagateRename (atomic since DEBT-16) runs for real whenever a test
    // triggers an alias change — these default to a no-op so it doesn't
    // reject on an un-mocked repository.
    mockTransformRepo.findByWorkflowId.mockResolvedValue([]);
    mockDocHookRepo.findByWorkflowId.mockResolvedValue([]);
    mockLifecycleRepo.findByWorkflowId.mockResolvedValue([]);

    service = new StepService(mockStepRepo, mockPageRepo, mockWorkflowSvc, mockStepValueRepo);
  });

  describe("createStep", () => {
    it("should create a step with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const existingSteps = [
        createTestStep(page.id, { order: 1 }),
        createTestStep(page.id, { order: 2 }),
      ];

      // Intentionally omit `order` to exercise the service's auto-increment.
      const newStepData: Omit<InsertStep, 'pageId' | 'workflowId' | 'order'> = {
        type: "text",
        title: "New Step",
        required: false,
        config: { variant: "short" },
      };

      const createdStep = createTestStep(page.id, { ...newStepData, order: 3 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow()); // void return
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.findByPageId.mockResolvedValue(existingSteps as unknown as Step[]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      const result = await service.createStep(workflow.id, page.id, "user-123", newStepData);

      expect(result.order).toBe(3);
      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: page.id,
          order: 3,
        }),
      expect.anything()
      );
    });

    it("should create step with order 1 if page is empty", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "First Step",
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      const createdStep = createTestStep(page.id, { ...newStepData, order: 1 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.findByPageId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      const result = await service.createStep(workflow.id, page.id, "user-123", newStepData);

      expect(result.order).toBe(1);
    });

    it("should reject creation once the workflow question limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW);

      await expect(
        service.createStep(workflow.id, page.id, "user-123", {
          type: "text",
          title: "One too many",
          required: false,
          config: { variant: "short" },
        })
      ).rejects.toThrow(/Question limit reached/);
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });

    it("should allow creation just below the workflow question limit (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const createdStep = createTestStep(page.id, { order: 1 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW - 1);
      mockStepRepo.findByPageId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      await expect(
        service.createStep(workflow.id, page.id, "user-123", {
          type: "text",
          title: "Last one in",
          required: false,
          config: { variant: "short" },
        })
      ).resolves.toBeDefined();
    });

    it("should validate alias uniqueness before creating", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const existingSteps = [
        createTestStep(page.id, { alias: "firstName" }),
      ];

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "Duplicate Alias",
        alias: "firstName",
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue(existingSteps as unknown as Step[]);

      await expect(
        service.createStep(workflow.id, page.id, "user-123", newStepData)
      ).rejects.toThrow("Alias \"firstName\" is already in use");
    });

    it("should auto-generate an alias from the label when none is provided", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "What is your first name?",
        alias: null,
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageId.mockResolvedValue([]);
      mockStepRepo.create.mockImplementation(async (data) => data as unknown as Step);

      await service.createStep(workflow.id, page.id, "user-123", newStepData);

      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ alias: "whatIsYourFirstName" }),
      expect.anything()
      );
    });

    it("should suffix the auto-generated alias when the name is taken", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const existingSteps = [createTestStep(page.id, { alias: "email" })];

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "email",
        title: "Email",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue(existingSteps as unknown as Step[]);
      mockStepRepo.findByPageId.mockResolvedValue([]);
      mockStepRepo.create.mockImplementation(async (data) => data as unknown as Step);

      await service.createStep(workflow.id, page.id, "user-123", newStepData);

      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ alias: "email2" }),
      expect.anything()
      );
    });

    it("should reject aliases with invalid characters", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "Dotted",
        alias: "client.name",
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);

      await expect(
        service.createStep(workflow.id, page.id, "user-123", newStepData)
      ).rejects.toThrow(/letters, numbers, and underscores/);
    });

    it("should throw error if page not found", async () => {
      const workflow = createTestWorkflow();

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "New Step",
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.createStep(workflow.id, "nonexistent-page", "user-123", newStepData)
      ).rejects.toThrow("Page not found");
    });

    it("should verify workflow ownership", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const page = createTestPage(workflow.id);

      const newStepData: Omit<InsertStep, "pageId" | "workflowId"> = {
        type: "text",
        title: "New Step",
        required: false,
        config: { variant: "short" },
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createStep(workflow.id, page.id, "other-user", newStepData)
      ).rejects.toThrow("Access denied");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "other-user", "edit", expect.anything());
    });
  });

  describe("updateStep", () => {
    it("should update step successfully", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id);
      const updatedStep = { ...step, title: "Updated Title" };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      // findById is a shared BaseRepository mock; dispatch by id for step vs page
      mockStepRepo.findById.mockImplementation(
        (async (id: string) => (id === step.id ? step : page)) as never
      );
      mockPageRepo.findById.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue([step as unknown as Step]);
      mockStepRepo.update.mockResolvedValue(updatedStep as unknown as Step);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      // The step had no custom alias, so the label change also fills the alias
      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ title: "Updated Title", alias: "updatedTitle" }),
        expect.anything()
      );
    });

    it("should validate alias uniqueness when updating alias", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { alias: "oldAlias" });
      const existingSteps = [
        step,
        createTestStep(page.id, { alias: "newAlias" }),
      ];

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue(existingSteps as unknown as Step[]);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { alias: "newAlias" })
      ).rejects.toThrow("Alias \"newAlias\" is already in use");
    });

    it("should allow updating step without changing alias", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { alias: "myAlias" });
      const updatedStep = { ...step, title: "Updated" };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockStepRepo.update.mockResolvedValue(updatedStep as unknown as Step);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated",
      });

      expect(result.title).toBe("Updated");
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.updateStep("nonexistent", "workflow-123", "user-123", { title: "Updated" })
      ).rejects.toThrow("Step not found");
    });

    it("should throw error if step does not belong to workflow", async () => {
      const workflow = createTestWorkflow();
      const otherWorkflow = createTestWorkflow();
      const page = createTestPage(otherWorkflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { title: "Updated" })
      ).rejects.toThrow("Step not found in this workflow");
    });
  });

  describe("deleteStep", () => {
    it("should soft-delete step successfully (ICW2-B1)", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockStepRepo.softDelete.mockResolvedValue({ ...step, deletedAt: new Date() } as unknown as Step);

      await service.deleteStep(step.id, workflow.id, "user-123");

      expect(mockStepRepo.softDelete).toHaveBeenCalledWith(step.id, expect.anything());
      expect(mockStepRepo.delete).not.toHaveBeenCalled();
    });

    it("should throw error if step not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.deleteStep("nonexistent", "workflow-123", "user-123")
      ).rejects.toThrow("Step not found");
    });

    it("should throw error if step does not belong to workflow", async () => {
      const workflow = createTestWorkflow();
      const otherWorkflow = createTestWorkflow();
      const page = createTestPage(otherWorkflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);

      await expect(
        service.deleteStep(step.id, workflow.id, "user-123")
      ).rejects.toThrow("Step not found in this workflow");
    });
  });

  describe("restoreStep (ICW2-B1)", () => {
    it("restores a soft-deleted step under edit access", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { workflowId: workflow.id, deletedAt: new Date() });

      mockStepRepo.findByIdIncludingDeleted.mockResolvedValue(step as unknown as Step);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.restore.mockResolvedValue({ ...step, deletedAt: null } as unknown as Step);

      const restored = await service.restoreStep(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      expect(mockStepRepo.restore).toHaveBeenCalledWith(step.id, expect.anything());
      expect(restored.deletedAt).toBeNull();
    });

    it("throws if the step does not exist at all", async () => {
      mockStepRepo.findByIdIncludingDeleted.mockResolvedValue(undefined);

      await expect(service.restoreStep("nonexistent", "user-123")).rejects.toThrow("Step not found");
    });
  });

  describe("getStepDeleteImpact (ICW2-13)", () => {
    it("should return the answer/run counts for the step from stepValueRepo", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 5, runCount: 3 });

      const result = await service.getStepDeleteImpact(step.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());
      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith([step.id], expect.anything());
      expect(result).toEqual({ answerCount: 5, runCount: 3 });
    });

    it("should return zero counts for a step with no stored answers", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

      const result = await service.getStepDeleteImpact(step.id, workflow.id, "user-123");

      expect(result).toEqual({ answerCount: 0, runCount: 0 });
    });

    it("should throw if the step is not found", async () => {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.getStepDeleteImpact("nonexistent", "workflow-123", "user-123")
      ).rejects.toThrow("Step not found");
      expect(mockStepValueRepo.countImpactForSteps).not.toHaveBeenCalled();
    });

    it("should throw if the step does not belong to the workflow", async () => {
      const workflow = createTestWorkflow();
      const otherWorkflow = createTestWorkflow();
      const page = createTestPage(otherWorkflow.id);
      const step = createTestStep(page.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);

      await expect(
        service.getStepDeleteImpact(step.id, workflow.id, "user-123")
      ).rejects.toThrow("Step not found in this workflow");
      expect(mockStepValueRepo.countImpactForSteps).not.toHaveBeenCalled();
    });

    it("should propagate access-denied errors without leaking counts", async () => {
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied - insufficient permissions for this workflow"));

      await expect(
        service.getStepDeleteImpact("step-1", "workflow-1", "user-123")
      ).rejects.toThrow("Access denied");
      expect(mockStepValueRepo.countImpactForSteps).not.toHaveBeenCalled();
    });
  });

  describe("getStepDeleteImpactById (ICW2-13)", () => {
    it("should look up the workflow from the step and delegate to getStepDeleteImpact", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id);

      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 2, runCount: 1 });

      const result = await service.getStepDeleteImpactById(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(page.workflowId, "user-123", "edit", expect.anything());
      expect(result).toEqual({ answerCount: 2, runCount: 1 });
    });

    it("should throw when the step does not exist", async () => {
      mockStepRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.getStepDeleteImpactById("nonexistent", "user-123")
      ).rejects.toThrow("Step not found");
    });
  });

  describe("generateAliasFromLabel", () => {
    it("should camelCase question labels", () => {
      expect(generateAliasFromLabel("What is your first name?")).toBe("whatIsYourFirstName");
      expect(generateAliasFromLabel("Email")).toBe("email");
      expect(generateAliasFromLabel("Client Name")).toBe("clientName");
    });

    it("should prefix labels that start with a digit", () => {
      expect(generateAliasFromLabel("2nd Address Line")).toBe("_2ndAddressLine");
    });

    it("should return null for labels without usable characters", () => {
      expect(generateAliasFromLabel("???")).toBeNull();
      expect(generateAliasFromLabel("")).toBeNull();
    });
  });

  describe("updateStep alias follow-the-label", () => {
    function setupUpdate(step: Step, page: ReturnType<typeof createTestPage>): void {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue([step]);
      mockStepRepo.update.mockImplementation(async (_id, data) => ({ ...step, ...data }) as Step);
    }

    it("should regenerate an auto-derived alias when the label changes", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, {
        title: "Untitled",
        alias: "untitled",
      }) as unknown as Step;
      setupUpdate(step, page);

      await service.updateStep(step.id, page.workflowId, "user-123", {
        title: "What is your email?",
      });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ alias: "whatIsYourEmail" }),
        expect.anything()
      );
    });

    it("should fill in an alias when the label changes and none is set", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { title: "Untitled", alias: null }) as unknown as Step;
      setupUpdate(step, page);

      await service.updateStep(step.id, page.workflowId, "user-123", {
        title: "Company name",
      });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ alias: "companyName" }),
        expect.anything()
      );
    });

    it("should never touch a customized alias on label change", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, {
        title: "Untitled",
        alias: "clientEmail",
      }) as unknown as Step;
      setupUpdate(step, page);

      await service.updateStep(step.id, page.workflowId, "user-123", {
        title: "Totally new label",
      });

      const updatePayload = mockStepRepo.update.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty("alias");
    });
  });

  describe("updateStep cross-page move", () => {
    function setupMove(step: Step, srcPage: ReturnType<typeof createTestPage>, destPage: ReturnType<typeof createTestPage>): void {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockImplementation(async (id) => id === srcPage.id ? srcPage : (id === destPage.id ? destPage : undefined) as unknown as ReturnType<typeof createTestPage>);
      mockStepRepo.update.mockImplementation(async (_id, data) => ({ ...step, ...data }) as Step);
    }

    it("should append to the end of the destination page if order is not provided", async () => {
      const workflow = createTestWorkflow();
      const srcPage = createTestPage(workflow.id);
      const destPage = createTestPage(workflow.id);
      
      const step = createTestStep(srcPage.id, { order: 2 }) as unknown as Step;
      setupMove(step, srcPage, destPage);

      // Destination has 2 steps currently
      mockStepRepo.findByPageId.mockResolvedValue([
        createTestStep(destPage.id, { order: 1 }) as unknown as Step,
        createTestStep(destPage.id, { order: 2 }) as unknown as Step,
      ]);

      await service.updateStep(step.id, workflow.id, "user-123", { pageId: destPage.id });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ pageId: destPage.id, order: 3 }),
        expect.anything()
      );
    });

    it("should respect explicit order if provided during cross-page move", async () => {
      const workflow = createTestWorkflow();
      const srcPage = createTestPage(workflow.id);
      const destPage = createTestPage(workflow.id);
      
      const step = createTestStep(srcPage.id, { order: 2 }) as unknown as Step;
      setupMove(step, srcPage, destPage);

      await service.updateStep(step.id, workflow.id, "user-123", { pageId: destPage.id, order: 5 });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ pageId: destPage.id, order: 5 }),
        expect.anything()
      );
    });
  });

  describe("duplicateStep (ICW2-B5)", () => {
    it("copies the step into the same page with a fresh alias, positioned after the source", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { order: 1, alias: "clientName", workflowId: workflow.id });
      const laterSibling = createTestStep(page.id, { order: 2, alias: "otherField", workflowId: workflow.id });

      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      // getWorkflowAliases: every alias currently in the workflow (for uniqueness).
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue([step, laterSibling]);
      // Sibling shift: everything in the page, including the source itself.
      mockStepRepo.findByPageId.mockResolvedValue([step, laterSibling]);

      const created = createTestStep(page.id, { order: 2, alias: "clientName_copy", workflowId: workflow.id });
      mockStepRepo.create.mockResolvedValue(created);

      const result = await service.duplicateStep(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit", expect.anything());

      // The later sibling shifts down by one to make room for the copy.
      expect(mockStepRepo.updateOrder).toHaveBeenCalledWith(
        laterSibling.id, page.id, laterSibling.order + 1, expect.anything()
      );

      // Copy is inserted at source.order + 1, same page, config carried over,
      // and — unlike the whole-workflow cloner — a fresh alias, never verbatim.
      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: page.id,
          workflowId: page.workflowId,
          order: step.order + 1,
          alias: "clientName_copy",
          type: step.type,
          title: step.title,
        }),
        expect.anything()
      );
      expect(result).toBe(created);
    });

    it("leaves the alias null when the source step has none", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { order: 1, alias: null, workflowId: workflow.id });

      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(1);
      mockPageRepo.findByWorkflowId.mockResolvedValue([page]);
      mockStepRepo.findByPageIds.mockResolvedValue([step]);
      mockStepRepo.findByPageId.mockResolvedValue([step]);
      mockStepRepo.create.mockResolvedValue(
        createTestStep(page.id, { order: 2, alias: null, workflowId: workflow.id })
      );

      await service.duplicateStep(step.id, "user-123");

      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ alias: null }),
        expect.anything()
      );
    });

    it("throws Step not found for a missing step", async () => {
      mockStepRepo.findById.mockResolvedValue(undefined);

      await expect(service.duplicateStep("missing", "user-123")).rejects.toThrow("Step not found");
      expect(mockWorkflowSvc.verifyAccess).not.toHaveBeenCalled();
    });

    it("rejects once the workflow step limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { order: 1 });

      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW);

      await expect(service.duplicateStep(step.id, "user-123")).rejects.toThrow(/Question limit reached/);
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });

    it("propagates access-denied errors without creating a copy", async () => {
      const workflow = createTestWorkflow();
      const page = createTestPage(workflow.id);
      const step = createTestStep(page.id, { order: 1 });

      mockStepRepo.findById.mockResolvedValue(step);
      mockPageRepo.findById.mockResolvedValue(page);
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied - insufficient permissions for this workflow"));

      await expect(service.duplicateStep(step.id, "user-123")).rejects.toThrow("Access denied");
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });
  });
});
