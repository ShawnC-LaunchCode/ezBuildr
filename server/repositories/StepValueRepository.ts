import { eq, and } from "drizzle-orm";

import { stepValues, type StepValue, type InsertStepValue } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for step value data access
 */
export class StepValueRepository extends BaseRepository<
  typeof stepValues,
  StepValue,
  InsertStepValue
> {
  constructor(dbInstance?: typeof db) {
    super(stepValues, dbInstance);
  }

  /**
   * Find values by run ID
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<StepValue[]> {
    const database = this.getDb(tx);
    return database.select().from(stepValues).where(eq(stepValues.runId, runId));
  }

  /**
   * Find a specific value by run ID and step ID
   */
  async findByRunAndStep(
    runId: string,
    stepId: string,
    tx?: DbTransaction
  ): Promise<StepValue | undefined> {
    const database = this.getDb(tx);
    const [value] = await database
      .select()
      .from(stepValues)
      .where(and(eq(stepValues.runId, runId), eq(stepValues.stepId, stepId)));
    return value;
  }

  /**
   * Upsert a step value (insert or update)
   *
   * PERFORMANCE OPTIMIZED (Dec 2025):
   * Uses PostgreSQL's native onConflictDoUpdate for atomic single-query upsert.
   * Replaces inefficient 2-3 query pattern (check + insert/update) with 1 query.
   *
   * Requires unique constraint: step_values_run_step_unique (run_id, step_id)
   */
  async upsert(data: InsertStepValue, tx?: DbTransaction): Promise<StepValue> {
    const database = this.getDb(tx);

    // Single atomic upsert operation
    const [result] = await database
      .insert(stepValues)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stepValues.runId, stepValues.stepId],
        set: {
          value: data.value,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  }
}

// Singleton instance
export const stepValueRepository = new StepValueRepository();
