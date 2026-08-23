import { eq, asc, sql, and, isNull } from "drizzle-orm";

import { pages, type Page, type InsertPage } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for page data access
 */
export class PageRepository extends BaseRepository<typeof pages, Page, InsertPage> {
  constructor(dbInstance?: typeof db) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- runtime guard for schema import
    if (!pages) { logger.error("CRITICAL: pages schema undefined in PageRepository — schema import may have failed"); }
    super(pages, dbInstance);
  }

  /**
   * Find a page by ID, excluding soft-deleted rows (ICW2-B1). Overrides
   * the generic `BaseRepository.findById` so every existing caller (services,
   * routes, middleware) automatically stops seeing deleted pages without
   * having to touch each call site.
   */
  async findById(id: string, tx?: DbTransaction): Promise<Page | undefined> {
    const page = await super.findById(id, tx);
    return page && page.deletedAt === null ? page : undefined;
  }

  /**
   * Find a page by ID regardless of soft-delete status. Used only by
   * restore flows, which need to locate an already soft-deleted row.
   */
  async findByIdIncludingDeleted(id: string, tx?: DbTransaction): Promise<Page | undefined> {
    return super.findById(id, tx);
  }

  /** Soft-delete a page by setting `deletedAt` (ICW2-B1). */
  async softDelete(id: string, tx?: DbTransaction): Promise<Page | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(pages)
      .set({ deletedAt: new Date() })
      .where(eq(pages.id, id))
      .returning();
    return updated;
  }

  /** Restore a soft-deleted page by clearing `deletedAt` (ICW2-B1). Idempotent. */
  async restore(id: string, tx?: DbTransaction): Promise<Page | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(pages)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(pages.id, id))
      .returning();
    return updated;
  }

  /**
   * Find pages by workflow ID (ordered by order field), excluding
   * soft-deleted rows (ICW2-B1)
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Page[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(pages)
      .where(and(eq(pages.workflowId, workflowId), isNull(pages.deletedAt)))
      .orderBy(asc(pages.order));
  }

  /**
   * Find a page by ID and verify it belongs to the workflow, excluding
   * soft-deleted rows (ICW2-B1)
   */
  async findByIdAndWorkflow(
    pageId: string,
    workflowId: string,
    tx?: DbTransaction
  ): Promise<Page | undefined> {
    const database = this.getDb(tx);
    const [page] = await database
      .select()
      .from(pages)
      .where(and(eq(pages.id, pageId), isNull(pages.deletedAt)));

    if (page !== undefined && page.workflowId === workflowId) {
      return page;
    }
    return undefined;
  }

  /**
   * Update page order
   */
  async updateOrder(pageId: string, workflowId: string, order: number, tx?: DbTransaction): Promise<Page> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(pages)
      .set({ order })
      .where(and(eq(pages.id, pageId), eq(pages.workflowId, workflowId)))
      .returning();
    if (updated == null) {throw new Error("Page not found");}
    return updated;
  }

  /**
   * Count pages by workflow ID, excluding soft-deleted rows (ICW2-B1)
   */
  async countByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select({ count: sql`count(*)` })
      .from(pages)
      .where(and(eq(pages.workflowId, workflowId), isNull(pages.deletedAt)));
    return Number(result[0]?.count ?? 0);
  }
}

// Singleton instance
export const pageRepository = new PageRepository();
