import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { logicRules, type LogicRule, type InsertLogicRule } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { db } from "../db";

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
    return await database
      .select()
      .from(logicRules)
      .where(eq(logicRules.workflowId, workflowId))
      .orderBy(asc(logicRules.order));
  }
}

// Singleton instance
export const logicRuleRepository = new LogicRuleRepository();
