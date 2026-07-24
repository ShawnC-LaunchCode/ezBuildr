import { eq, asc, sql, and, isNull } from "drizzle-orm";

import { sections, type Section, type InsertSection } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for section data access
 */
export class SectionRepository extends BaseRepository<typeof sections, Section, InsertSection> {
  constructor(dbInstance?: typeof db) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- runtime guard for schema import
    if (!sections) { logger.error("CRITICAL: sections schema undefined in SectionRepository — schema import may have failed"); }
    super(sections, dbInstance);
  }

  /**
   * Find a section by ID, excluding soft-deleted rows (ICW2-B1). Overrides
   * the generic `BaseRepository.findById` so every existing caller (services,
   * routes, middleware) automatically stops seeing deleted sections without
   * having to touch each call site.
   */
  async findById(id: string, tx?: DbTransaction): Promise<Section | undefined> {
    const section = await super.findById(id, tx);
    return section && section.deletedAt === null ? section : undefined;
  }

  /**
   * Find a section by ID regardless of soft-delete status. Used only by
   * restore flows, which need to locate an already soft-deleted row.
   */
  async findByIdIncludingDeleted(id: string, tx?: DbTransaction): Promise<Section | undefined> {
    return super.findById(id, tx);
  }

  /** Soft-delete a section by setting `deletedAt` (ICW2-B1). */
  async softDelete(id: string, tx?: DbTransaction): Promise<Section | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(sections)
      .set({ deletedAt: new Date() })
      .where(eq(sections.id, id))
      .returning();
    return updated;
  }

  /** Restore a soft-deleted section by clearing `deletedAt` (ICW2-B1). Idempotent. */
  async restore(id: string, tx?: DbTransaction): Promise<Section | undefined> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(sections)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(sections.id, id))
      .returning();
    return updated;
  }

  /**
   * Find sections by workflow ID (ordered by order field), excluding
   * soft-deleted rows (ICW2-B1)
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Section[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(sections)
      .where(and(eq(sections.workflowId, workflowId), isNull(sections.deletedAt)))
      .orderBy(asc(sections.order));
  }

  /**
   * Find a section by ID and verify it belongs to the workflow, excluding
   * soft-deleted rows (ICW2-B1)
   */
  async findByIdAndWorkflow(
    sectionId: string,
    workflowId: string,
    tx?: DbTransaction
  ): Promise<Section | undefined> {
    const database = this.getDb(tx);
    const [section] = await database
      .select()
      .from(sections)
      .where(and(eq(sections.id, sectionId), isNull(sections.deletedAt)));

    if (section !== undefined && section.workflowId === workflowId) {
      return section;
    }
    return undefined;
  }

  /**
   * Update section order
   */
  async updateOrder(sectionId: string, workflowId: string, order: number, tx?: DbTransaction): Promise<Section> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(sections)
      .set({ order })
      .where(and(eq(sections.id, sectionId), eq(sections.workflowId, workflowId)))
      .returning();
    if (updated == null) {throw new Error("Section not found");}
    return updated;
  }

  /**
   * Count sections by workflow ID, excluding soft-deleted rows (ICW2-B1)
   */
  async countByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select({ count: sql`count(*)` })
      .from(sections)
      .where(and(eq(sections.workflowId, workflowId), isNull(sections.deletedAt)));
    return Number(result[0]?.count ?? 0);
  }
}

// Singleton instance
export const sectionRepository = new SectionRepository();
