import { eq, and, inArray, sql } from "drizzle-orm";

import { stepValues, workflowRuns, type StepValue, type InsertStepValue } from "@shared/schema";

import { db } from "../db";
import { createError } from "../utils/errors";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/** Answers + distinct runs affected by deleting a set of steps (ICW2-13). */
export interface DeleteImpact {
  answerCount: number;
  runCount: number;
}

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
    if (!tx) {
      return this.transaction(transaction => this.upsert(data, transaction));
    }
    const database = this.getDb(tx);
    await this.assertRunsMutable([data.runId], tx);

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
    if (!tx) {
      return this.transaction(transaction => this.upsertMany(dataList, transaction));
    }
    const database = this.getDb(tx);
    await this.assertRunsMutable(dataList.map(data => data.runId), tx);
    
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

  /**
   * Count answers (step_values rows) and distinct runs that would be
   * permanently destroyed if the given steps were deleted — step_values
   * cascades on `steps.id` deletion (shared/schema/run.ts). Read-only;
   * used to gate the destructive-confirm dialog before a step/section
   * delete (ICW2-13). Reusable by ICW2-B1 (soft-delete) impact preview.
   */
  async countImpactForSteps(stepIds: string[], tx?: DbTransaction): Promise<DeleteImpact> {
    if (stepIds.length === 0) { return { answerCount: 0, runCount: 0 }; }
    const database = this.getDb(tx);
    const [result] = await database
      .select({
        answerCount: sql<number>`count(*)`,
        runCount: sql<number>`count(distinct ${stepValues.runId})`,
      })
      .from(stepValues)
      .where(inArray(stepValues.stepId, stepIds));
    return {
      answerCount: Number(result?.answerCount ?? 0),
      runCount: Number(result?.runCount ?? 0),
    };
  }

  /** Delete selected answers only while their run remains incomplete. */
  async deleteByIdsForRun(runId: string, valueIds: string[], tx?: DbTransaction): Promise<void> {
    if (valueIds.length === 0) {return;}
    if (!tx) {
      return this.transaction(transaction => this.deleteByIdsForRun(runId, valueIds, transaction));
    }

    await this.assertRunsMutable([runId], tx);
    await tx
      .delete(stepValues)
      .where(and(eq(stepValues.runId, runId), inArray(stepValues.id, valueIds)));
  }

  /**
   * Lock each owning run before an answer write. The lock serializes value
   * persistence with WorkflowRunRepository.markComplete(), making completion
   * the database-enforced boundary instead of a route-level best-effort check.
   */
  private async assertRunsMutable(runIds: string[], tx: DbTransaction): Promise<void> {
    const uniqueRunIds = [...new Set(runIds)].sort();
    const runs = await tx
      .select({ id: workflowRuns.id, completed: workflowRuns.completed })
      .from(workflowRuns)
      .where(inArray(workflowRuns.id, uniqueRunIds))
      .orderBy(workflowRuns.id)
      .for('update');

    const runsById = new Map(runs.map(run => [run.id, run]));
    for (const runId of uniqueRunIds) {
      const run = runsById.get(runId);
      if (!run) {throw createError.notFound('Run', runId);}
      if (run.completed) {throw createError.runCompleted();}
    }
  }
}

// Singleton instance
export const stepValueRepository = new StepValueRepository();
