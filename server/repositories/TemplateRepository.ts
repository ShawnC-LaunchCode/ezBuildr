import { and, eq, or, sql } from "drizzle-orm";

import { surveyTemplates } from "@shared/schema";

import { db } from "../db";

import type { DbTransaction } from "./BaseRepository";

export class TemplateRepository {
  /**
   * Create a new survey template
   */
  async create(
    name: string,
    content: any,
    creatorId: string,
    description?: string,
    isSystem: boolean = false,
    tags: string[] = [],
    tx?: DbTransaction
  ) {
    const database = tx || db;
    const [row] = await database
      .insert(surveyTemplates)
      .values({
        name,
        description: description || null,
        content,
        creatorId,
        isSystem,
        tags,
      } as any)
      .returning();
    return row;
  }

  /**
   * Find all templates created by a specific user
   */
  async findAllByCreator(creatorId: string, tx?: DbTransaction) {
    const database = tx || db;
    return database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.creatorId, creatorId))
      .orderBy(sql`${surveyTemplates.createdAt} DESC`);
  }

  /**
   * Find all system templates (created by admins and marked as system)
   */
  async findSystemTemplates(tx?: DbTransaction) {
    const database = tx || db;
    return database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.isSystem, true))
      .orderBy(sql`${surveyTemplates.createdAt} DESC`);
  }

  /**
   * Find all templates accessible to a user (their own + system templates)
   */
  async findAllAccessible(creatorId: string, tx?: DbTransaction) {
    const database = tx || db;
    return database
      .select()
      .from(surveyTemplates)
      .where(
        or(
          eq(surveyTemplates.creatorId, creatorId),
          eq(surveyTemplates.isSystem, true)
        )
      )
      .orderBy(sql`${surveyTemplates.isSystem} DESC, ${surveyTemplates.createdAt} DESC`);
  }

  /**
   * Find a template by ID
   */
  async findById(id: string, tx?: DbTransaction) {
    const database = tx || db;
    const [tpl] = await database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.id, id));
    return tpl;
  }

  /**
   * Update a template (name, description, content, or tags)
   */
  async update(
    id: string,
    creatorId: string,
    patch: { name?: string; description?: string; content?: any; tags?: string[] },
    tx?: DbTransaction
  ) {
    const database = tx || db;
    const [row] = await database
      .update(surveyTemplates)
      .set({ ...patch, updatedAt: sql`now()` } as any)
      .where(and(eq(surveyTemplates.id, id), eq(surveyTemplates.creatorId, creatorId)))
      .returning();
    return row;
  }

  /**
   * Delete a template
   */
  async delete(id: string, creatorId: string, tx?: DbTransaction) {
    const database = tx || db;
    const res = await database
      .delete(surveyTemplates)
      .where(and(eq(surveyTemplates.id, id), eq(surveyTemplates.creatorId, creatorId)))
      .returning({ id: surveyTemplates.id });
    return res.length > 0;
  }
}

export const templateRepository = new TemplateRepository();
