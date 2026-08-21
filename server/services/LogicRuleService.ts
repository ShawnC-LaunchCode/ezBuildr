import { extractConditionReferences } from "@shared/conditionGraph";
import type { LogicRule, InsertLogicRule } from "@shared/schema";
import { conditionExpressionSchema } from "@shared/types/conditions";
import type { ConditionExpression } from "@shared/types/conditions";

import {
  logicRuleRepository,
  stepRepository,
  sectionRepository,
  type DbTransaction,
} from "../repositories";

import { AliasResolver } from "./AliasResolver";
import { workflowService } from "./WorkflowService";
import { withCurrentTenant } from "../utils/rlsContext";

const RULE_NOT_FOUND = "Logic rule not found";

/**
 * Domain-validation failure for a rule's when/target/action combination.
 * `statusCode` is read by `classifyRouteError` (see server/utils/routeErrors.ts)
 * so these surface as 400s with their real message, the same idiom
 * `LimitExceededError` uses — this is invalid input, not a 404/403.
 */
export class LogicRuleValidationError extends Error {
  readonly statusCode = 400;
}

export type LogicRuleTargetType = "section" | "step";
export type LogicRuleAction = "show" | "hide" | "require" | "make_optional" | "skip_to";

/**
 * Client-authorable fields of a rule. `conditionStepId` is deliberately
 * absent — LU-6a kept it as a plain FK for clone/portability/alias-rename
 * remapping, but it is now denormalized against the operand inside `when`
 * (O-7). Every create/update derives it server-side from `when` in the same
 * pass that validates `when`, so the two can never independently drift the
 * way they would if a client could set `conditionStepId` directly.
 */
export interface LogicRuleInput {
  when: ConditionExpression;
  targetType: LogicRuleTargetType;
  targetStepId?: string | null;
  targetSectionId?: string | null;
  action: LogicRuleAction;
  order?: number;
}

/** Actions `evaluateRules` (shared/workflowLogic.ts) applies to section targets. */
const SECTION_ACTIONS = new Set<LogicRuleAction>(["show", "hide", "skip_to"]);
/** Actions `evaluateRules` applies to step targets. `skip_to` only makes
 * sense against a section (it is a navigation target), and `require`/
 * `make_optional` only make sense against a step's own requiredness. */
const STEP_ACTIONS = new Set<LogicRuleAction>(["show", "hide", "require", "make_optional"]);

type RuleWriteFields = Pick<
  InsertLogicRule,
  "when" | "conditionStepId" | "targetType" | "targetStepId" | "targetSectionId" | "action"
>;

export interface LogicRuleServiceDeps {
  logicRuleRepo?: typeof logicRuleRepository;
  stepRepo?: typeof stepRepository;
  sectionRepo?: typeof sectionRepository;
  workflowSvc?: typeof workflowService;
}

export class LogicRuleService {
  private logicRuleRepo: typeof logicRuleRepository;
  private stepRepo: typeof stepRepository;
  private sectionRepo: typeof sectionRepository;
  private workflowSvc: typeof workflowService;

  constructor(deps: LogicRuleServiceDeps = {}) {
    this.logicRuleRepo = deps.logicRuleRepo ?? logicRuleRepository;
    this.stepRepo = deps.stepRepo ?? stepRepository;
    this.sectionRepo = deps.sectionRepo ?? sectionRepository;
    this.workflowSvc = deps.workflowSvc ?? workflowService;
  }

  /**
   * Validates a rule's `when` + target + action, and derives
   * `conditionStepId` from `when`'s first step reference in the same pass
   * (O-7) — the single source of truth both fields are written from, so a
   * create or update can never write a `when` that names one step while
   * `conditionStepId` names another.
   */
  private async buildRuleFields(
    workflowId: string,
    input: LogicRuleInput,
    tx?: DbTransaction
  ): Promise<RuleWriteFields> {
    const parsedWhen = conditionExpressionSchema.safeParse(input.when ?? null);
    if (!parsedWhen.success) {
      throw new LogicRuleValidationError("Invalid rule condition");
    }
    const when = parsedWhen.data;

    const [firstReference] = extractConditionReferences(when);
    if (!firstReference) {
      throw new LogicRuleValidationError(
        "A rule's condition must reference at least one step"
      );
    }

    const steps = await this.stepRepo.findByWorkflowIdWithAliases(workflowId, tx);
    const resolver = AliasResolver.fromSteps(steps);
    const conditionStepId = resolver.resolve(firstReference);
    if (!conditionStepId) {
      throw new LogicRuleValidationError(
        `Rule condition references an unknown step: "${firstReference}"`
      );
    }

    if (input.targetType === "section") {
      if (!input.targetSectionId) {
        throw new LogicRuleValidationError("A section-target rule requires targetSectionId");
      }
      const section = await this.sectionRepo.findByIdAndWorkflow(input.targetSectionId, workflowId, tx);
      if (!section) {
        throw new LogicRuleValidationError("Rule target section not found in this workflow");
      }
      if (!SECTION_ACTIONS.has(input.action)) {
        throw new LogicRuleValidationError(`Action "${input.action}" is not valid for a section target`);
      }
      return {
        when,
        conditionStepId,
        targetType: "section",
        targetSectionId: input.targetSectionId,
        targetStepId: null,
        action: input.action,
      };
    }

    if (!input.targetStepId) {
      throw new LogicRuleValidationError("A step-target rule requires targetStepId");
    }
    const targetStep = steps.find((step) => step.id === input.targetStepId);
    if (!targetStep) {
      throw new LogicRuleValidationError("Rule target step not found in this workflow");
    }
    if (!STEP_ACTIONS.has(input.action)) {
      throw new LogicRuleValidationError(`Action "${input.action}" is not valid for a step target`);
    }
    return {
      when,
      conditionStepId,
      targetType: "step",
      targetStepId: input.targetStepId,
      targetSectionId: null,
      action: input.action,
    };
  }

  async listRules(workflowId: string, userId: string): Promise<LogicRule[]> {
    await this.workflowSvc.verifyAccess(workflowId, userId, "view");
    return this.logicRuleRepo.findByWorkflowId(workflowId);
  }

  async createRule(workflowId: string, userId: string, input: LogicRuleInput): Promise<LogicRule> {
    await this.workflowSvc.verifyAccess(workflowId, userId, "edit");

    return withCurrentTenant(async (tx) => {
      const fields = await this.buildRuleFields(workflowId, input, tx);
      const existing = await this.logicRuleRepo.findByWorkflowId(workflowId, tx);
      const nextOrder = existing.length > 0 ? Math.max(...existing.map((rule) => rule.order)) + 1 : 1;
      return this.logicRuleRepo.create(
        {
          workflowId,
          order: input.order ?? nextOrder,
          ...fields,
        },
        tx
      );
    });
  }

  async updateRule(
    ruleId: string,
    workflowId: string,
    userId: string,
    input: Partial<LogicRuleInput>
  ): Promise<LogicRule> {
    await this.workflowSvc.verifyAccess(workflowId, userId, "edit");

    return withCurrentTenant(async (tx) => {
      const existingRule = await this.logicRuleRepo.findByIdAndWorkflow(ruleId, workflowId, tx);
      if (!existingRule) {
        throw new Error(RULE_NOT_FOUND);
      }

      // Merge onto the existing row first so a partial PATCH-style update
      // still re-validates (and re-derives conditionStepId from) the FULL
      // resulting when/target/action combination, not just the changed keys.
      const merged: LogicRuleInput = {
        when: input.when !== undefined ? input.when : (existingRule.when as ConditionExpression),
        targetType: input.targetType ?? existingRule.targetType,
        targetStepId: input.targetStepId !== undefined ? input.targetStepId : existingRule.targetStepId,
        targetSectionId: input.targetSectionId !== undefined ? input.targetSectionId : existingRule.targetSectionId,
        action: input.action ?? existingRule.action,
      };

      const fields = await this.buildRuleFields(workflowId, merged, tx);
      const order = input.order ?? existingRule.order;

      return this.logicRuleRepo.update(ruleId, { ...fields, order }, tx);
    });
  }

  async deleteRule(ruleId: string, workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, "edit");
    const existingRule = await this.logicRuleRepo.findByIdAndWorkflow(ruleId, workflowId);
    if (!existingRule) {
      throw new Error(RULE_NOT_FOUND);
    }
    await this.logicRuleRepo.delete(ruleId);
  }

  /**
   * Reorder rules. Author-visible, not cosmetic: `evaluateRules` sorts
   * section-targeted rules by `order` and the first firing `skip_to` wins,
   * so without this an author has no way to express which skip takes
   * precedence.
   */
  async reorderRules(
    workflowId: string,
    userId: string,
    orders: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, "edit");
    await withCurrentTenant(async (tx) => {
      for (const { id, order } of orders) {
        await this.logicRuleRepo.updateOrder(id, workflowId, order, tx);
      }
    });
  }
}

export const logicRuleService = new LogicRuleService();
