import { eq, and, sql } from "drizzle-orm";

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
   * Get all run values as a flattened JSON object keyed by stepId
   */
  async getRunDataAsJson(runId: string, tx?: DbTransaction): Promise<Record<string, unknown>> {
    const values = await this.findByRunId(runId, tx);
    const dataMap: Record<string, unknown> = {};
    for (const v of values) {
      dataMap[v.stepId] = v.value;
    }
    return dataMap;
  }

  /**
   * Get all run values mapped to their aliases (or stepIds if no alias)
   */
  async getRunDataWithAliases(runId: string, steps: { id: string, alias?: string | null }[], tx?: DbTransaction): Promise<Record<string, unknown>> {
    const values = await this.findByRunId(runId, tx);
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const dataMap: Record<string, unknown> = {};
    for (const v of values) {
      const step = stepMap.get(v.stepId);
      if (step) {
        const key = step.alias ?? step.id;
        dataMap[key] = v.value;
      }
    }
    return dataMap;
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

    if (result == null) {throw new Error("Failed to upsert step value");}
    return result;
  }

  /**
   * Bulk upsert multiple step values
   */
  async upsertMany(dataList: InsertStepValue[], tx?: DbTransaction): Promise<StepValue[]> {
    if (dataList.length === 0) {return [];}
    const database = this.getDb(tx);
    
    // Add timestamps to all items
    const values = dataList.map(data => ({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return database
      .insert(stepValues)
      .values(values)
      .onConflictDoUpdate({
        target: [stepValues.runId, stepValues.stepId],
        set: {
          value: sql`excluded.value`,
          updatedAt: new Date(),
        },
      })
      .returning();
  }
}

// Singleton instance
export const stepValueRepository = new StepValueRepository();
