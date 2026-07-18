import { eq, asc, sql, and } from "drizzle-orm";

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
   * Find sections by workflow ID (ordered by order field)
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Section[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(sections)
      .where(eq(sections.workflowId, workflowId))
      .orderBy(asc(sections.order));
  }

  /**
   * Find a section by ID and verify it belongs to the workflow
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
      .where(eq(sections.id, sectionId));

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
   * Count sections by workflow ID
   */
  async countByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .select({ count: sql`count(*)` })
      .from(sections)
      .where(eq(sections.workflowId, workflowId));
    return Number(result[0]?.count ?? 0);
  }
}

// Singleton instance
export const sectionRepository = new SectionRepository();
