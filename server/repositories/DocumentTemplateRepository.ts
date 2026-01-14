import { eq, and, desc, sql } from "drizzle-orm";

import { templates, type Template, type InsertTemplate } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Stage 21: Document Template Repository
 *
 * Repository for workflow document templates (DOCX/HTML templates for document generation)
 * NOT to be confused with TemplateRepository (for survey templates)
 */
export class DocumentTemplateRepository extends BaseRepository<
  typeof templates,
  Template,
  InsertTemplate
> {
  constructor(dbInstance?: typeof db) {
    super(templates, dbInstance);
  }

  /**
   * Find templates by project ID
   */
  async findByProjectId(projectId: string, tx?: DbTransaction): Promise<Template[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(templates)
      .where(eq(templates.projectId, projectId))
      .orderBy(desc(templates.updatedAt));
  }

  /**
   * Find templates by type
   */
  async findByType(
    projectId: string,
    type: "docx" | "html",
    tx?: DbTransaction
  ): Promise<Template[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(templates)
      .where(and(eq(templates.projectId, projectId), eq(templates.type, type)))
      .orderBy(desc(templates.updatedAt));
  }

  /**
   * Find template by ID and project ID (for authorization)
   */
  async findByIdAndProjectId(
    id: string,
    projectId: string,
    tx?: DbTransaction
  ): Promise<Template | undefined> {
    const database = this.getDb(tx);
    const [template] = await database
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.projectId, projectId)));
    return template;
  }

  /**
   * Update template metadata (name, description)
   */
  async updateMetadata(
    id: string,
    projectId: string,
    updates: { name?: string; description?: string },
    tx?: DbTransaction
  ): Promise<Template | undefined> {
    const database = this.getDb(tx);
    const [template] = await database
      .update(templates)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(templates.id, id), eq(templates.projectId, projectId)))
      .returning();
    return template;
  }

  /**
   * Update template file reference
   */
  async updateFileRef(
    id: string,
    projectId: string,
    fileRef: string,
    tx?: DbTransaction
  ): Promise<Template | undefined> {
    const database = this.getDb(tx);
    const [template] = await database
      .update(templates)
      .set({
        fileRef,
        updatedAt: new Date(),
      })
      .where(and(eq(templates.id, id), eq(templates.projectId, projectId)))
      .returning();
    return template;
  }

  /**
   * Delete template by ID and project ID (for authorization)
   */
  async deleteByIdAndProjectId(
    id: string,
    projectId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);
    const result = await database
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.projectId, projectId)))
      .returning({ id: templates.id });
    return result.length > 0;
  }

  /**
   * Check if template exists by name in project
   */
  async existsByNameInProject(
    name: string,
    projectId: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    const conditions = excludeId
      ? and(
          eq(templates.projectId, projectId),
          eq(templates.name, name),
          // @ts-ignore - drizzle typing issue with ne operator
          sql`${templates.id} != ${excludeId}`
        )
      : and(eq(templates.projectId, projectId), eq(templates.name, name));

    const [result] = await database
      .select({ id: templates.id })
      .from(templates)
      .where(conditions)
      .limit(1);

    return !!result;
  }
}

// Singleton instance
export const documentTemplateRepository = new DocumentTemplateRepository();
