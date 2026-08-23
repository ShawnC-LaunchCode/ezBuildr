import { eq, asc, inArray, and, sql, isNull } from "drizzle-orm";

import { steps, pages, type Step, type InsertStep } from "@shared/schema";

import { db } from "../db";
import { protectFinalBlockDeliverySecrets } from "../utils/documentDeliverySecrets";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for step data access
 */
export class StepRepository extends BaseRepository<typeof steps, Step, InsertStep> {
  constructor(dbInstance?: typeof db) {
    super(steps, dbInstance);
  }

  async create(data: InsertStep, tx?: DbTransaction): Promise<Step> {
    const protectedData = data.type === 'final_documents' || data.type === 'final'
      ? { ...data, config: protectFinalBlockDeliverySecrets(data.config) }
      : data;
    return super.create(protectedData, tx);
  }

  async update(id: string, updates: Partial<InsertStep>, tx?: DbTransaction): Promise<Step> {
    if (updates.config === undefined) {
      return super.update(id, updates, tx);
    }

    const existing = await this.findById(id, tx);
    if (!existing) {
      throw new Error('Step not found');
    }
    const type = updates.type ?? existing.type;
    const protectedUpdates = type === 'final_documents' || type === 'final'
      ? { ...updates, config: protectFinalBlockDeliverySecrets(updates.config) }
      : updates;
    return super.update(id, protectedUpdates, tx);
  }

  /**
   * Find a step by ID, excluding soft-deleted rows (ICW2-B1). Overrides the
   * generic `BaseRepository.findById` so every existing caller (services,
   * routes, middleware) automatically stops seeing deleted steps without
   * having to touch each call site.
   */
  async findById(id: string, tx?: DbTransaction): Promise<Step | undefined> {
    const step = await super.findById(id, tx);
    return step && step.deletedAt === null ? step : undefined;
  }

  /**
   * Find a step by ID regardless of soft-delete status. Used only by
   * restore flows, which need to locate an already soft-deleted row.
   */
  async findByIdIncludingDeleted(id: string, tx?: DbTransaction): Promise<Step | undefined> {
    return super.findById(id, tx);
  }

  /** Soft-delete a step by setting `deletedAt` (ICW2-B1). */
  async softDelete(id: string, tx?: DbTransaction): Promise<Step | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(steps)
      .set({ deletedAt: new Date() })
      .where(eq(steps.id, id))
      .returning();
    return updated;
  }

  /**
   * Soft-delete every step under a page (used when soft-deleting the
   * page itself, so its steps disappear too — ICW2-B1).
   */
  async softDeleteByPageId(pageId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(steps)
      .set({ deletedAt: new Date() })
      .where(and(eq(steps.pageId, pageId), isNull(steps.deletedAt)));
  }

  /** Restore a soft-deleted step by clearing `deletedAt` (ICW2-B1). Idempotent. */
  async restore(id: string, tx?: DbTransaction): Promise<Step | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(steps)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(steps.id, id))
      .returning();
    return updated;
  }

  /**
   * Restore every step under a page (used when restoring the page
   * itself, mirroring the soft-delete cascade — ICW2-B1). Idempotent for
   * steps that are not currently deleted.
   */
  async restoreByPageId(pageId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(steps)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(steps.pageId, pageId));
  }

  /**
   * Find steps by page ID (ordered by order field), excluding
   * soft-deleted rows (ICW2-B1).
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findByPageId(
    pageId: string,
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    const conditions = [eq(steps.pageId, pageId), isNull(steps.deletedAt)];
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
   * Find steps by multiple page IDs, excluding soft-deleted rows (ICW2-B1).
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findByPageIds(
    pageIds: string[],
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);
    if (pageIds.length === 0) { return []; }

    const conditions = [inArray(steps.pageId, pageIds), isNull(steps.deletedAt)];
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
   * Find all steps for a workflow (by joining with pages), excluding
   * soft-deleted rows (ICW2-B1).
   * By default, excludes virtual steps (computed steps from transform blocks)
   * Set includeVirtual=true to include virtual steps
   */
  async findByWorkflowId(
    workflowId: string,
    tx?: DbTransaction,
    includeVirtual = false
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    const conditions = [eq(pages.workflowId, workflowId), isNull(steps.deletedAt)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    return database
      .select({
        id: steps.id,
        workflowId: steps.workflowId,
        pageId: steps.pageId,
        type: steps.type,
        title: steps.title,
        description: steps.description,
        required: steps.required,
        config: steps.config,
        alias: steps.alias,
        defaultValue: steps.defaultValue,
        order: steps.order,
        isVirtual: steps.isVirtual,
        visibleIf: steps.visibleIf,
        deletedAt: steps.deletedAt,
        createdAt: steps.createdAt,
        updatedAt: steps.updatedAt,
      })
      .from(steps)
      .innerJoin(pages, eq(steps.pageId, pages.id))
      .where(and(...conditions))
      .orderBy(asc(steps.order));
  }

  /**
   * Find a step by ID and verify it belongs to the page, excluding
   * soft-deleted rows (ICW2-B1)
   */
  async findByIdAndPage(
    stepId: string,
    pageId: string,
    tx?: DbTransaction
  ): Promise<Step | undefined> {
    const database = this.getDb(tx);
    const [step] = await database
      .select()
      .from(steps)
      .where(and(eq(steps.id, stepId), isNull(steps.deletedAt)));

    if (step !== undefined && step.pageId === pageId) {
      return step;
    }
    return undefined;
  }

  /**
   * Update step order
   */
  async updateOrder(stepId: string, pageId: string, order: number, tx?: DbTransaction): Promise<Step> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(steps)
      .set({ order })
      .where(and(eq(steps.id, stepId), eq(steps.pageId, pageId)))
      .returning();
    if (updated == null) {throw new Error("Step not found");}
    return updated;
  }

  /**
   * Find all steps for a workflow (by joining with pages), excluding
   * soft-deleted rows (ICW2-B1)
   * Includes aliases for easy reference
   * By default, includes virtual steps
   */
  async findByWorkflowIdWithAliases(
    workflowId: string,
    tx?: DbTransaction,
    includeVirtual = true
  ): Promise<Step[]> {
    const database = this.getDb(tx);

    // Join steps with pages to filter by workflowId
    const conditions = [eq(pages.workflowId, workflowId), isNull(steps.deletedAt)];
    if (!includeVirtual) {
      conditions.push(eq(steps.isVirtual, false));
    }

    const result = await database
      .select()
      .from(steps)
      .innerJoin(pages, eq(steps.pageId, pages.id))
      .where(and(...conditions))
      .orderBy(asc(steps.order));

    // Extract just the steps from the join result
    return result.map((row: { steps: Step }) => row.steps);
  }

  /**
   * Get a Map of stepId -> alias for a workflow.
   * Results are cached with a 5-second TTL to avoid repeated DB hits within the same
   * request lifecycle (e.g. navigation and document generation both call this).
   * Cache is bypassed inside transactions to ensure consistency.
   */
  async getAliasMap(workflowId: string, tx?: DbTransaction): Promise<Map<string, string>> {
    // Skip cache inside transactions for consistency
    if (!tx) {
      const cached = aliasMapCache.get(workflowId);
      if (cached !== undefined && Date.now() < cached.expiresAt) { return cached.map; }
    }
    const allSteps = await this.findByWorkflowIdWithAliases(workflowId, tx);
    const map = new Map<string, string>();
    for (const step of allSteps) {
      if (step.alias) { map.set(step.id, step.alias); }
    }
    if (!tx) {
      aliasMapCache.set(workflowId, { map, expiresAt: Date.now() + ALIAS_CACHE_TTL_MS });
    }
    return map;
  }

  /**
   * Count steps by workflow ID, excluding soft-deleted rows (ICW2-B1)
   */
  async countByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select({ count: sql`count(*)` })
      .from(steps)
      .where(and(eq(steps.workflowId, workflowId), isNull(steps.deletedAt)));
    return Number(result[0]?.count ?? 0);
  }
}

// Module-level TTL cache for alias maps — avoids repeated DB loads within the same request lifecycle
const ALIAS_CACHE_TTL_MS = 5_000;
const aliasMapCache = new Map<string, { map: Map<string, string>; expiresAt: number }>();

// Singleton instance
export const stepRepository = new StepRepository();
