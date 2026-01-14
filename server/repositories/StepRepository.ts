import { eq, asc, inArray, and } from "drizzle-orm";

import { steps, sections, type Step, type InsertStep } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for step data access
 */
export class StepRepository extends BaseRepository<typeof steps, Step, InsertStep> {
  constructor(dbInstance?: typeof db) {
    super(steps, dbInstance);
  }

  /**
   * Find steps by section ID (ordered by order field)
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findBySectionId(
    sectionId: string,
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    const conditions = [eq(steps.sectionId, sectionId)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    return database
      .select()
      .from(steps)
      .where(and(...conditions))
      .orderBy(asc(steps.order));
  }

  /**
   * Find steps by multiple section IDs
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findBySectionIds(
    sectionIds: string[],
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);
    if (sectionIds.length === 0) {return [];}

    const conditions = [inArray(steps.sectionId, sectionIds)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    return database
      .select()
      .from(steps)
      .where(and(...conditions))
      .orderBy(asc(steps.order));
  }

  /**
   * Find all steps for a workflow (by joining with sections)
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findByWorkflowId(
    workflowId: string,
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    const conditions = [eq(sections.workflowId, workflowId)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    return database
      .select({
        id: steps.id,
        sectionId: steps.sectionId,
        type: steps.type,
        title: steps.title,
        description: steps.description,
        required: steps.required,
        options: steps.options,
        alias: steps.alias,
        defaultValue: steps.defaultValue,
        order: steps.order,
        isVirtual: steps.isVirtual,
        visibleIf: steps.visibleIf,
        repeaterConfig: steps.repeaterConfig,
        createdAt: steps.createdAt,
        updatedAt: steps.updatedAt,
      })
      .from(steps)
      .innerJoin(sections, eq(steps.sectionId, sections.id))
      .where(and(...conditions))
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

  /**
   * Find all steps for a workflow (by joining with sections)
   * Includes aliases for easy reference
   * By default, includes virtual steps
   */
  async findByWorkflowIdWithAliases(
    workflowId: string,
    tx?: DbTransaction,
    includeVirtual = true
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    // Join steps with sections to filter by workflowId
    const conditions = [eq(sections.workflowId, workflowId)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    const result = await database
      .select()
      .from(steps)
      .innerJoin(sections, eq(steps.sectionId, sections.id))
      .where(and(...conditions))
      .orderBy(asc(steps.order));

    // Extract just the steps from the join result
    return result.map((row: { steps: Step }) => row.steps);
  }
}

// Singleton instance
export const stepRepository = new StepRepository();
