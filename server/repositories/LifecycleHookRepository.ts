import { BaseRepository, type DbTransaction } from "./BaseRepository";
import {
  lifecycleHooks,
  type LifecycleHook,
  type InsertLifecycleHook,
} from "@shared/schema";
import type { LifecycleHookPhase } from "@shared/types/scripting";
import { eq, and, asc, isNull, or } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for lifecycle hook data access
 */
export class LifecycleHookRepository extends BaseRepository<
  typeof lifecycleHooks,
  LifecycleHook,
  InsertLifecycleHook
> {
  constructor(dbInstance?: typeof db) {
    super(lifecycleHooks, dbInstance);
  }

  /**
   * Find lifecycle hooks by workflow ID, ordered by execution order
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<LifecycleHook[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(lifecycleHooks)
      .where(eq(lifecycleHooks.workflowId, workflowId))
      .orderBy(asc(lifecycleHooks.order));
  }

  /**
   * Find enabled lifecycle hooks by workflow ID, ordered by execution order
   */
  async findEnabledByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<LifecycleHook[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(lifecycleHooks)
      .where(and(eq(lifecycleHooks.workflowId, workflowId), eq(lifecycleHooks.enabled, true)))
      .orderBy(asc(lifecycleHooks.order));
  }

  /**
   * Find enabled lifecycle hooks by workflow ID and phase, ordered by execution order
   * Includes both section-specific and workflow-level hooks
   */
  async findEnabledByPhase(
    workflowId: string,
    phase: LifecycleHookPhase,
    sectionId?: string | null,
    tx?: DbTransaction
  ): Promise<LifecycleHook[]> {
    const database = this.getDb(tx);

    // Build conditions
    const conditions = [
      eq(lifecycleHooks.workflowId, workflowId),
      eq(lifecycleHooks.phase, phase),
      eq(lifecycleHooks.enabled, true),
    ];

    // If sectionId is provided, include both section-specific AND workflow-level hooks
    // If sectionId is null, only include workflow-level hooks
    if (sectionId) {
      // Include hooks that match the section OR are workflow-level (null sectionId)
      return await database
        .select()
        .from(lifecycleHooks)
        .where(
          and(
            ...conditions,
            or(
              eq(lifecycleHooks.sectionId, sectionId),
              isNull(lifecycleHooks.sectionId)
            )
          )
        )
        .orderBy(asc(lifecycleHooks.order));
    } else {
      // Only workflow-level hooks
      conditions.push(isNull(lifecycleHooks.sectionId));
      return await database
        .select()
        .from(lifecycleHooks)
        .where(and(...conditions))
        .orderBy(asc(lifecycleHooks.order));
    }
  }

  /**
   * Delete lifecycle hooks by workflow ID
   */
  async deleteByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(lifecycleHooks).where(eq(lifecycleHooks.workflowId, workflowId));
  }

  /**
   * Find lifecycle hook by ID and verify ownership
   */
  async findByIdWithWorkflow(hookId: string, tx?: DbTransaction): Promise<LifecycleHook | null> {
    const database = this.getDb(tx);
    const hooks = await database
      .select()
      .from(lifecycleHooks)
      .where(eq(lifecycleHooks.id, hookId))
      .limit(1);

    return hooks[0] || null;
  }
}

// Singleton instance
export const lifecycleHookRepository = new LifecycleHookRepository();
