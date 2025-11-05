import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { stepValues, type StepValue, type InsertStepValue } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "../db";

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
    return await database.select().from(stepValues).where(eq(stepValues.runId, runId));
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
   */
  async upsert(data: InsertStepValue, tx?: DbTransaction): Promise<StepValue> {
    const database = this.getDb(tx);

    // Check if value already exists
    const existing = await this.findByRunAndStep(data.runId, data.stepId, tx);

    if (existing) {
      // Update existing
      const [updated] = await database
        .update(stepValues)
        .set({
          value: data.value,
          updatedAt: new Date(),
        })
        .where(eq(stepValues.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new
      const [created] = await database.insert(stepValues).values(data).returning();
      return created;
    }
  }
}

// Singleton instance
export const stepValueRepository = new StepValueRepository();
