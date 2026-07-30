
import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import { StepService, generateAliasFromLabel } from "../../../server/services/StepService";
import { stepRepository, sectionRepository, stepValueRepository } from "../../../server/repositories";
import { createTestStep, createTestSection, createTestWorkflow } from "../../factories/workflowFactory";
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
    findBySectionId: vi.fn(),
    findBySectionIds: vi.fn(),
    countByWorkflowId: vi.fn(),
    updateOrder: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
  sectionRepository: {
    findById: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    findByWorkflowId: vi.fn(),
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

describe("StepService", () => {
  let service: StepService;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockSectionRepo: Mocked<typeof sectionRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;
  let mockStepValueRepo: Mocked<typeof stepValueRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockSectionRepo = sectionRepository as Mocked<typeof sectionRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;
    mockStepValueRepo = stepValueRepository as Mocked<typeof stepValueRepository>;

    // Setup default mock implementations
    mockStepRepo.findById.mockResolvedValue(undefined);
    mockStepRepo.findBySectionId.mockResolvedValue([]);
    mockStepRepo.findBySectionIds.mockResolvedValue([]);
    mockStepRepo.countByWorkflowId.mockResolvedValue(0);

    mockSectionRepo.findById.mockResolvedValue(undefined);
    mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(undefined);
    mockSectionRepo.findByWorkflowId.mockResolvedValue([]);

    mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 0, runCount: 0 });

    service = new StepService(mockStepRepo, mockSectionRepo, mockWorkflowSvc, mockStepValueRepo);
  });

  describe("createStep", () => {
    it("should create a step with auto-incrementing order", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const existingSteps = [
        createTestStep(section.id, { order: 1 }),
        createTestStep(section.id, { order: 2 }),
      ];

      // Intentionally omit `order` to exercise the service's auto-increment.
      const newStepData: Omit<InsertStep, 'sectionId' | 'workflowId' | 'order'> = {
        type: "short_text",
        title: "New Step",
        required: false,
        config: {},
      };

      const createdStep = createTestStep(section.id, { ...newStepData, order: 3 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow()); // void return
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

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "First Step",
        required: false,
        config: {},
        order: 1,
      };

      const createdStep = createTestStep(section.id, { ...newStepData, order: 1 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      const result = await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(result.order).toBe(1);
    });

    it("should reject creation once the workflow question limit is reached (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", {
          type: "short_text",
          title: "One too many",
          required: false,
          config: {},
        })
      ).rejects.toThrow(/Question limit reached/);
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });

    it("should allow creation just below the workflow question limit (ICW-11)", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const createdStep = createTestStep(section.id, { order: 1 });

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW - 1);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockResolvedValue(createdStep as unknown as Step);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", {
          type: "short_text",
          title: "Last one in",
          required: false,
          config: {},
        })
      ).resolves.toBeDefined();
    });

    it("should validate alias uniqueness before creating", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const existingSteps = [
        createTestStep(section.id, { alias: "firstName" }),
      ];

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "Duplicate Alias",
        alias: "firstName",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps as unknown as Step[]);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", newStepData)
      ).rejects.toThrow("Alias \"firstName\" is already in use");
    });

    it("should auto-generate an alias from the label when none is provided", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "What is your first name?",
        alias: null,
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockImplementation(async (data) => data as unknown as Step);

      await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ alias: "whatIsYourFirstName" })
      );
    });

    it("should suffix the auto-generated alias when the name is taken", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const existingSteps = [createTestStep(section.id, { alias: "email" })];

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "email",
        title: "Email",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue(existingSteps as unknown as Step[]);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.create.mockImplementation(async (data) => data as unknown as Step);

      await service.createStep(workflow.id, section.id, "user-123", newStepData);

      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ alias: "email2" })
      );
    });

    it("should reject aliases with invalid characters", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "Dotted",
        alias: "client.name",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(section);

      await expect(
        service.createStep(workflow.id, section.id, "user-123", newStepData)
      ).rejects.toThrow(/letters, numbers, and underscores/);
    });

    it("should throw error if section not found", async () => {
      const workflow = createTestWorkflow();

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "New Step",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockSectionRepo.findByIdAndWorkflow.mockResolvedValue(undefined);

      await expect(
        service.createStep(workflow.id, "nonexistent-section", "user-123", newStepData)
      ).rejects.toThrow("Section not found");
    });

    it("should verify workflow ownership", async () => {
      const workflow = createTestWorkflow({ creatorId: "user-123" });
      const section = createTestSection(workflow.id);

      const newStepData: Omit<InsertStep, "sectionId" | "workflowId"> = {
        type: "short_text",
        title: "New Step",
        required: false,
        config: {},
        order: 1,
      };

      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied"));

      await expect(
        service.createStep(workflow.id, section.id, "other-user", newStepData)
      ).rejects.toThrow("Access denied");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "other-user", "edit");
    });
  });

  describe("updateStep", () => {
    it("should update step successfully", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);
      const updatedStep = { ...step, title: "Updated Title" };

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      // findById is a shared BaseRepository mock; dispatch by id for step vs section
      mockStepRepo.findById.mockImplementation(
        (async (id: string) => (id === step.id ? step : section)) as never
      );
      mockSectionRepo.findById.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue([step as unknown as Step]);
      mockStepRepo.update.mockResolvedValue(updatedStep as unknown as Step);

      const result = await service.updateStep(step.id, workflow.id, "user-123", {
        title: "Updated Title",
      });

      expect(result.title).toBe("Updated Title");
      // The step had no custom alias, so the label change also fills the alias
      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ title: "Updated Title", alias: "updatedTitle" })
      );
    });

    it("should validate alias uniqueness when updating alias", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { alias: "oldAlias" });
      const existingSteps = [
        step,
        createTestStep(section.id, { alias: "newAlias" }),
      ];

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
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

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
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
      const section = createTestSection(otherWorkflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

      await expect(
        service.updateStep(step.id, workflow.id, "user-123", { title: "Updated" })
      ).rejects.toThrow("Step not found in this workflow");
    });
  });

  describe("deleteStep", () => {
    it("should soft-delete step successfully (ICW2-B1)", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepRepo.softDelete.mockResolvedValue({ ...step, deletedAt: new Date() } as unknown as Step);

      await service.deleteStep(step.id, workflow.id, "user-123");

      expect(mockStepRepo.softDelete).toHaveBeenCalledWith(step.id);
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
      const section = createTestSection(otherWorkflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

      await expect(
        service.deleteStep(step.id, workflow.id, "user-123")
      ).rejects.toThrow("Step not found in this workflow");
    });
  });

  describe("restoreStep (ICW2-B1)", () => {
    it("restores a soft-deleted step under edit access", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { workflowId: workflow.id, deletedAt: new Date() });

      mockStepRepo.findByIdIncludingDeleted.mockResolvedValue(step as unknown as Step);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.restore.mockResolvedValue({ ...step, deletedAt: null } as unknown as Step);

      const restored = await service.restoreStep(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      expect(mockStepRepo.restore).toHaveBeenCalledWith(step.id);
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
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 5, runCount: 3 });

      const result = await service.getStepDeleteImpact(step.id, workflow.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");
      expect(mockStepValueRepo.countImpactForSteps).toHaveBeenCalledWith([step.id]);
      expect(result).toEqual({ answerCount: 5, runCount: 3 });
    });

    it("should return zero counts for a step with no stored answers", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
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
      const section = createTestSection(otherWorkflow.id);
      const step = createTestStep(section.id);

      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);

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
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id);

      mockStepRepo.findById.mockResolvedValue(step as unknown as Step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepValueRepo.countImpactForSteps.mockResolvedValue({ answerCount: 2, runCount: 1 });

      const result = await service.getStepDeleteImpactById(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(section.workflowId, "user-123", "edit");
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
    function setupUpdate(step: Step, section: ReturnType<typeof createTestSection>): void {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue([step]);
      mockStepRepo.update.mockImplementation(async (_id, data) => ({ ...step, ...data }) as Step);
    }

    it("should regenerate an auto-derived alias when the label changes", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, {
        title: "Untitled",
        alias: "untitled",
      }) as unknown as Step;
      setupUpdate(step, section);

      await service.updateStep(step.id, section.workflowId, "user-123", {
        title: "What is your email?",
      });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ alias: "whatIsYourEmail" })
      );
    });

    it("should fill in an alias when the label changes and none is set", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { title: "Untitled", alias: null }) as unknown as Step;
      setupUpdate(step, section);

      await service.updateStep(step.id, section.workflowId, "user-123", {
        title: "Company name",
      });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ alias: "companyName" })
      );
    });

    it("should never touch a customized alias on label change", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, {
        title: "Untitled",
        alias: "clientEmail",
      }) as unknown as Step;
      setupUpdate(step, section);

      await service.updateStep(step.id, section.workflowId, "user-123", {
        title: "Totally new label",
      });

      const updatePayload = mockStepRepo.update.mock.calls[0][1];
      expect(updatePayload).not.toHaveProperty("alias");
    });
  });

  describe("updateStep cross-section move", () => {
    function setupMove(step: Step, srcSection: ReturnType<typeof createTestSection>, destSection: ReturnType<typeof createTestSection>): void {
      mockWorkflowSvc.verifyAccess.mockResolvedValue(createTestWorkflow());
      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockImplementation(async (id) => id === srcSection.id ? srcSection : (id === destSection.id ? destSection : undefined) as unknown as ReturnType<typeof createTestSection>);
      mockStepRepo.update.mockImplementation(async (_id, data) => ({ ...step, ...data }) as Step);
    }

    it("should append to the end of the destination section if order is not provided", async () => {
      const workflow = createTestWorkflow();
      const srcSection = createTestSection(workflow.id);
      const destSection = createTestSection(workflow.id);
      
      const step = createTestStep(srcSection.id, { order: 2 }) as unknown as Step;
      setupMove(step, srcSection, destSection);

      // Destination has 2 steps currently
      mockStepRepo.findBySectionId.mockResolvedValue([
        createTestStep(destSection.id, { order: 1 }) as unknown as Step,
        createTestStep(destSection.id, { order: 2 }) as unknown as Step,
      ]);

      await service.updateStep(step.id, workflow.id, "user-123", { sectionId: destSection.id });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ sectionId: destSection.id, order: 3 })
      );
    });

    it("should respect explicit order if provided during cross-section move", async () => {
      const workflow = createTestWorkflow();
      const srcSection = createTestSection(workflow.id);
      const destSection = createTestSection(workflow.id);
      
      const step = createTestStep(srcSection.id, { order: 2 }) as unknown as Step;
      setupMove(step, srcSection, destSection);

      await service.updateStep(step.id, workflow.id, "user-123", { sectionId: destSection.id, order: 5 });

      expect(mockStepRepo.update).toHaveBeenCalledWith(
        step.id,
        expect.objectContaining({ sectionId: destSection.id, order: 5 })
      );
    });
  });

  describe("duplicateStep (ICW2-B5)", () => {
    it("copies the step into the same section with a fresh alias, positioned after the source", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { order: 1, alias: "clientName", workflowId: workflow.id });
      const laterSibling = createTestStep(section.id, { order: 2, alias: "otherField", workflowId: workflow.id });

      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(2);
      // getWorkflowAliases: every alias currently in the workflow (for uniqueness).
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue([step, laterSibling]);
      // Sibling shift: everything in the section, including the source itself.
      mockStepRepo.findBySectionId.mockResolvedValue([step, laterSibling]);

      const created = createTestStep(section.id, { order: 2, alias: "clientName_copy", workflowId: workflow.id });
      mockStepRepo.create.mockResolvedValue(created);

      const result = await service.duplicateStep(step.id, "user-123");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-123", "edit");

      // The later sibling shifts down by one to make room for the copy.
      expect(mockStepRepo.updateOrder).toHaveBeenCalledWith(
        laterSibling.id, section.id, laterSibling.order + 1, expect.anything()
      );

      // Copy is inserted at source.order + 1, same section, config carried over,
      // and — unlike the whole-workflow cloner — a fresh alias, never verbatim.
      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: section.id,
          workflowId: section.workflowId,
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
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { order: 1, alias: null, workflowId: workflow.id });

      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(1);
      mockSectionRepo.findByWorkflowId.mockResolvedValue([section]);
      mockStepRepo.findBySectionIds.mockResolvedValue([step]);
      mockStepRepo.findBySectionId.mockResolvedValue([step]);
      mockStepRepo.create.mockResolvedValue(
        createTestStep(section.id, { order: 2, alias: null, workflowId: workflow.id })
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
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { order: 1 });

      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
      mockStepRepo.countByWorkflowId.mockResolvedValue(LIMITS.MAX_STEPS_PER_WORKFLOW);

      await expect(service.duplicateStep(step.id, "user-123")).rejects.toThrow(/Question limit reached/);
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });

    it("propagates access-denied errors without creating a copy", async () => {
      const workflow = createTestWorkflow();
      const section = createTestSection(workflow.id);
      const step = createTestStep(section.id, { order: 1 });

      mockStepRepo.findById.mockResolvedValue(step);
      mockSectionRepo.findById.mockResolvedValue(section);
      mockWorkflowSvc.verifyAccess.mockRejectedValue(new Error("Access denied - insufficient permissions for this workflow"));

      await expect(service.duplicateStep(step.id, "user-123")).rejects.toThrow("Access denied");
      expect(mockStepRepo.create).not.toHaveBeenCalled();
    });
  });
});
