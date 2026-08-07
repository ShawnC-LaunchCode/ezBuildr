import { eq, and, asc } from "drizzle-orm";

import { logicRules, type LogicRule, type InsertLogicRule } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for logic rule data access
 */
export class LogicRuleRepository extends BaseRepository<
  typeof logicRules,
  LogicRule,
  InsertLogicRule
> {
  constructor(dbInstance?: typeof db) {
    super(logicRules, dbInstance);
  }

  /**
   * Find rules by workflow ID (ordered by order field)
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<LogicRule[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(logicRules)
      .where(eq(logicRules.workflowId, workflowId))
      .orderBy(asc(logicRules.order));
  }

  /**
   * Find rules by conditionStepId
   */
  async findByConditionStepId(conditionStepId: string, tx?: DbTransaction): Promise<LogicRule[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(logicRules)
      .where(eq(logicRules.conditionStepId, conditionStepId))
      .orderBy(asc(logicRules.order));
  }

  /**
   * Find a rule by ID, scoped to a workflow (LU-6b). Mirrors
   * `SectionRepository.findByIdAndWorkflow` — used so update/delete can
   * confirm a rule belongs to the workflow the caller already has `edit`
   * access to, rather than trusting a bare `ruleId`.
   */
  async findByIdAndWorkflow(
    ruleId: string,
    workflowId: string,
    tx?: DbTransaction
  ): Promise<LogicRule | undefined> {
    const database = this.getDb(tx);
    const [rule] = await database
      .select()
      .from(logicRules)
      .where(and(eq(logicRules.id, ruleId), eq(logicRules.workflowId, workflowId)));
    return rule;
  }

  /**
   * Update a rule's order, scoped to a workflow (LU-6b). Ordering is
   * author-visible: `evaluateRules` sorts section-targeted rules by `order`
   * and the first firing `skip_to` wins, so reordering must be a first-class
   * operation, not an implementation detail.
   */
  async updateOrder(ruleId: string, workflowId: string, order: number, tx?: DbTransaction): Promise<LogicRule> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(logicRules)
      .set({ order, updatedAt: new Date() })
      .where(and(eq(logicRules.id, ruleId), eq(logicRules.workflowId, workflowId)))
      .returning();
    if (updated == null) { throw new Error("Logic rule not found"); }
    return updated;
  }
}

// Singleton instance
export const logicRuleRepository = new LogicRuleRepository();
