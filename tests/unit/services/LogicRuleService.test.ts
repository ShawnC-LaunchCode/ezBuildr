import { describe, it, expect, beforeEach, vi, type Mocked } from "vitest";

import {
  LogicRuleService,
  LogicRuleValidationError,
  type LogicRuleInput,
} from "../../../server/services/LogicRuleService";
import { logicRuleRepository, stepRepository, pageRepository } from "../../../server/repositories";
import { workflowService } from "../../../server/services/WorkflowService";
import {
  createTestWorkflow,
  createTestPage,
  createTestStep,
  createTestLogicRule,
} from "../../factories/workflowFactory";
import { buildTestWhen } from "../../helpers/conditionFixtures";

import type { LogicRule } from "@shared/schema";

// createRule/updateRule/reorderRules wrap their writes in db.transaction; the
// fake just invokes the callback with a stub tx (mocked repos ignore it).
vi.mock("../../../server/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));

vi.mock("../../../server/repositories", () => ({
  logicRuleRepository: {
    findByWorkflowId: vi.fn(),
    findByIdAndWorkflow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateOrder: vi.fn(),
  },
  stepRepository: {
    findByWorkflowIdWithAliases: vi.fn(),
  },
  pageRepository: {
    findByIdAndWorkflow: vi.fn(),
  },
}));

vi.mock("../../../server/services/WorkflowService", () => ({
  workflowService: {
    verifyAccess: vi.fn(),
  },
}));

describe("LogicRuleService", () => {
  let service: LogicRuleService;
  let mockLogicRuleRepo: Mocked<typeof logicRuleRepository>;
  let mockStepRepo: Mocked<typeof stepRepository>;
  let mockPageRepo: Mocked<typeof pageRepository>;
  let mockWorkflowSvc: Mocked<typeof workflowService>;

  const workflow = createTestWorkflow();
  const stepA = createTestStep(workflow.id, { id: "step-a", alias: "triggerAlias", workflowId: workflow.id });
  const stepB = createTestStep(workflow.id, { id: "step-b", alias: null, workflowId: workflow.id });
  const targetStep = createTestStep(workflow.id, { id: "step-target", alias: "targetAlias", workflowId: workflow.id });
  const page = createTestPage(workflow.id, { id: "page-1" });

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogicRuleRepo = logicRuleRepository as Mocked<typeof logicRuleRepository>;
    mockStepRepo = stepRepository as Mocked<typeof stepRepository>;
    mockPageRepo = pageRepository as Mocked<typeof pageRepository>;
    mockWorkflowSvc = workflowService as Mocked<typeof workflowService>;

    mockWorkflowSvc.verifyAccess.mockResolvedValue(workflow);
    mockStepRepo.findByWorkflowIdWithAliases.mockResolvedValue([stepA, stepB, targetStep]);
    mockPageRepo.findByIdAndWorkflow.mockResolvedValue(page);
    mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);
    mockLogicRuleRepo.create.mockImplementation(async (data) => ({
      id: "new-rule",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }) as unknown as LogicRule);
    mockLogicRuleRepo.update.mockImplementation(async (id, data) => ({
      id,
      workflowId: workflow.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }) as unknown as LogicRule);

    service = new LogicRuleService({
      logicRuleRepo: mockLogicRuleRepo,
      stepRepo: mockStepRepo,
      pageRepo: mockPageRepo,
      workflowSvc: mockWorkflowSvc,
    });
  });

  const stepTargetInput = (overrides?: Partial<LogicRuleInput>): LogicRuleInput => ({
    when: buildTestWhen("triggerAlias", "equals", "yes"),
    targetType: "step",
    targetStepId: targetStep.id,
    action: "show",
    ...overrides,
  });

  describe("createRule", () => {
    it("checks edit access with (workflowId, userId)", async () => {
      await service.createRule(workflow.id, "user-1", stepTargetInput());
      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-1", "edit");
    });

    it("O-7: derives conditionStepId from `when`'s operand (alias form) and writes both together", async () => {
      const input = stepTargetInput();
      await service.createRule(workflow.id, "user-1", input);

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conditionStepId: stepA.id, // resolved from the "triggerAlias" alias
          when: input.when,
        }),
        expect.anything()
      );
    });

    it("O-7: resolves conditionStepId when `when` references a raw step id (no alias)", async () => {
      await service.createRule(
        workflow.id,
        "user-1",
        stepTargetInput({ when: buildTestWhen(stepB.id, "equals", "x") })
      );

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ conditionStepId: stepB.id }),
        expect.anything()
      );
    });

    it("rejects a condition with no step reference", async () => {
      await expect(
        service.createRule(workflow.id, "user-1", stepTargetInput({ when: null }))
      ).rejects.toThrow(LogicRuleValidationError);
    });

    it("rejects a condition referencing an unknown step/alias", async () => {
      await expect(
        service.createRule(
          workflow.id,
          "user-1",
          stepTargetInput({ when: buildTestWhen("nonexistentAlias", "equals", "x") })
        )
      ).rejects.toThrow(/unknown step/);
    });

    it("rejects skip_to against a step target (only valid for pages)", async () => {
      await expect(
        service.createRule(workflow.id, "user-1", stepTargetInput({ action: "skip_to" }))
      ).rejects.toThrow(/not valid for a step target/);
    });

    it("rejects require/make_optional against a page target", async () => {
      await expect(
        service.createRule(workflow.id, "user-1", {
          when: buildTestWhen("triggerAlias", "equals", "yes"),
          targetType: "page",
          targetPageId: page.id,
          action: "require",
        })
      ).rejects.toThrow(/not valid for a page target/);
    });

    it("accepts skip_to against a page target", async () => {
      await service.createRule(workflow.id, "user-1", {
        when: buildTestWhen("triggerAlias", "equals", "yes"),
        targetType: "page",
        targetPageId: page.id,
        action: "skip_to",
      });

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: "page", targetPageId: page.id, action: "skip_to" }),
        expect.anything()
      );
    });

    it("rejects a target step that does not belong to the workflow", async () => {
      await expect(
        service.createRule(workflow.id, "user-1", stepTargetInput({ targetStepId: "some-other-workflows-step" }))
      ).rejects.toThrow(/target step not found/);
    });

    it("rejects a target page that does not belong to the workflow", async () => {
      mockPageRepo.findByIdAndWorkflow.mockResolvedValue(undefined);
      await expect(
        service.createRule(workflow.id, "user-1", {
          when: buildTestWhen("triggerAlias", "equals", "yes"),
          targetType: "page",
          targetPageId: "some-other-workflows-page",
          action: "show",
        })
      ).rejects.toThrow(/target page not found/);
    });

    it("auto-increments order past the current max", async () => {
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([
        createTestLogicRule(workflow.id, { order: 1 }),
        createTestLogicRule(workflow.id, { order: 5 }),
      ]);

      await service.createRule(workflow.id, "user-1", stepTargetInput());

      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order: 6 }),
        expect.anything()
      );
    });

    it("respects an explicit order when supplied", async () => {
      await service.createRule(workflow.id, "user-1", stepTargetInput({ order: 3 }));
      expect(mockLogicRuleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order: 3 }),
        expect.anything()
      );
    });
  });

  describe("updateRule", () => {
    const existingRule = createTestLogicRule(workflow.id, {
      id: "rule-1",
      conditionStepId: stepA.id,
      when: buildTestWhen("triggerAlias", "equals", "yes"),
      targetType: "step",
      targetStepId: targetStep.id,
      targetPageId: null,
      action: "show",
      order: 1,
    });

    beforeEach(() => {
      mockLogicRuleRepo.findByIdAndWorkflow.mockResolvedValue(existingRule);
    });

    it("checks edit access with (workflowId, userId)", async () => {
      await service.updateRule("rule-1", workflow.id, "user-1", { action: "hide" });
      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-1", "edit");
    });

    it("throws when the rule does not belong to the workflow", async () => {
      mockLogicRuleRepo.findByIdAndWorkflow.mockResolvedValue(undefined);
      await expect(
        service.updateRule("rule-1", workflow.id, "user-1", { action: "hide" })
      ).rejects.toThrow("Logic rule not found");
    });

    it("O-7: re-deriving conditionStepId when `when` changes to reference a DIFFERENT step", async () => {
      // Existing rule's condition references stepA (alias "triggerAlias").
      // Update its `when` to reference stepB (raw id, no alias) instead —
      // conditionStepId must follow to stepB, not remain stale at stepA.
      await service.updateRule("rule-1", workflow.id, "user-1", {
        when: buildTestWhen(stepB.id, "equals", "x"),
      });

      expect(mockLogicRuleRepo.update).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ conditionStepId: stepB.id }),
        expect.anything()
      );
    });

    it("a partial update that changes only `action` re-derives (and keeps) conditionStepId consistent with the unchanged `when`", async () => {
      await service.updateRule("rule-1", workflow.id, "user-1", { action: "hide" });

      expect(mockLogicRuleRepo.update).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ conditionStepId: stepA.id, action: "hide" }),
        expect.anything()
      );
    });

    it("rejects an update whose merged when/target/action combination is invalid (skip_to onto a step target)", async () => {
      await expect(
        service.updateRule("rule-1", workflow.id, "user-1", { action: "skip_to" })
      ).rejects.toThrow(/not valid for a step target/);
    });

    it("preserves the existing order when none is supplied", async () => {
      await service.updateRule("rule-1", workflow.id, "user-1", { action: "hide" });
      expect(mockLogicRuleRepo.update).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ order: existingRule.order }),
        expect.anything()
      );
    });
  });

  describe("deleteRule", () => {
    it("checks edit access, verifies workflow ownership, then deletes", async () => {
      const existingRule = createTestLogicRule(workflow.id, { id: "rule-1" });
      mockLogicRuleRepo.findByIdAndWorkflow.mockResolvedValue(existingRule);

      await service.deleteRule("rule-1", workflow.id, "user-1");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-1", "edit");
      expect(mockLogicRuleRepo.delete).toHaveBeenCalledWith("rule-1");
    });

    it("throws when the rule does not belong to the workflow", async () => {
      mockLogicRuleRepo.findByIdAndWorkflow.mockResolvedValue(undefined);
      await expect(service.deleteRule("rule-1", workflow.id, "user-1")).rejects.toThrow("Logic rule not found");
      expect(mockLogicRuleRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe("reorderRules", () => {
    it("checks edit access and updates each rule's order", async () => {
      await service.reorderRules(workflow.id, "user-1", [
        { id: "rule-1", order: 2 },
        { id: "rule-2", order: 1 },
      ]);

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-1", "edit");
      expect(mockLogicRuleRepo.updateOrder).toHaveBeenCalledWith("rule-1", workflow.id, 2, expect.anything());
      expect(mockLogicRuleRepo.updateOrder).toHaveBeenCalledWith("rule-2", workflow.id, 1, expect.anything());
    });
  });

  describe("listRules", () => {
    it("checks view access and returns the repository's list", async () => {
      const rules = [createTestLogicRule(workflow.id)];
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue(rules);

      const result = await service.listRules(workflow.id, "user-1");

      expect(mockWorkflowSvc.verifyAccess).toHaveBeenCalledWith(workflow.id, "user-1", "view");
      expect(result).toBe(rules);
    });
  });
});
