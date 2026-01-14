import { eq, asc } from "drizzle-orm";

import { sections, type Section, type InsertSection } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for section data access
 */
export class SectionRepository extends BaseRepository<typeof sections, Section, InsertSection> {
  constructor(dbInstance?: typeof db) {
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

    if (section && section.workflowId === workflowId) {
      return section;
    }
    return undefined;
  }

  /**
   * Update section order
   */
  async updateOrder(sectionId: string, order: number, tx?: DbTransaction): Promise<Section> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(sections)
      .set({ order })
      .where(eq(sections.id, sectionId))
      .returning();
    return updated;
  }
}

// Singleton instance
export const sectionRepository = new SectionRepository();
