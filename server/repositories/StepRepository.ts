import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { steps, type Step, type InsertStep } from "@shared/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for step data access
 */
export class StepRepository extends BaseRepository<typeof steps, Step, InsertStep> {
  constructor(dbInstance?: typeof db) {
    super(steps, dbInstance);
  }

  /**
   * Find steps by section ID (ordered by order field)
   */
  async findBySectionId(sectionId: string, tx?: DbTransaction): Promise<Step[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(steps)
      .where(eq(steps.sectionId, sectionId))
      .orderBy(asc(steps.order));
  }

  /**
   * Find steps by multiple section IDs
   */
  async findBySectionIds(sectionIds: string[], tx?: DbTransaction): Promise<Step[]> {
    const database = this.getDb(tx);
    if (sectionIds.length === 0) return [];

    return await database
      .select()
      .from(steps)
      .where(inArray(steps.sectionId, sectionIds))
      .orderBy(asc(steps.order));
  }

  /**
   * Find a step by ID and verify it belongs to the section
   */
  async findByIdAndSection(
    stepId: string,
    sectionId: string,
    tx?: DbTransaction
  ): Promise<Step | undefined> {
    const database = this.getDb(tx);
    const [step] = await database
      .select()
      .from(steps)
      .where(eq(steps.id, stepId));

    if (step && step.sectionId === sectionId) {
      return step;
    }
    return undefined;
  }

  /**
   * Update step order
   */
  async updateOrder(stepId: string, order: number, tx?: DbTransaction): Promise<Step> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(steps)
      .set({ order })
      .where(eq(steps.id, stepId))
      .returning();
    return updated;
  }
}

// Singleton instance
export const stepRepository = new StepRepository();
