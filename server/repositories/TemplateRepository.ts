import { and, eq, or, sql } from "drizzle-orm";

import { surveyTemplates } from "@shared/schema";

import { db } from "../db";

import type { DbTransaction } from "./BaseRepository";

export class TemplateRepository {
  /**
   * Create a new survey template
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, max-params
  async create(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any, // JSONB template structure - flexible schema
    creatorId: string,
    description?: string,
    isSystem: boolean = false,
    tags: string[] = [],
    tx?: DbTransaction
  ) {
    const database = tx ?? db;
    const [row] = await database
      .insert(surveyTemplates)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .values({
        name,
        description: description ?? null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        content,
        creatorId,
        isSystem,
        tags,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any) // Drizzle type assertion for flexible values
      .returning();
    return row;
  }

  /**
   * Find all templates created by a specific user
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async findAllByCreator(creatorId: string, tx?: DbTransaction) {
    const database = tx ?? db;
    return database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.creatorId, creatorId))
      .orderBy(sql`${surveyTemplates.createdAt} DESC`);
  }

  /**
   * Find all system templates (created by admins and marked as system)
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async findSystemTemplates(tx?: DbTransaction) {
    const database = tx ?? db;
    return database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.isSystem, true))
      .orderBy(sql`${surveyTemplates.createdAt} DESC`);
  }

  /**
   * Find all templates accessible to a user (their own + system templates)
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async findAllAccessible(creatorId: string, tx?: DbTransaction) {
    const database = tx ?? db;
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async findById(id: string, tx?: DbTransaction) {
    const database = tx ?? db;
    const [tpl] = await database
      .select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.id, id));
    return tpl;
  }

  /**
   * Update a template (name, description, content, or tags)
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async update(
    id: string,
    creatorId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patch: { name?: string; description?: string; content?: any; tags?: string[] }, // JSONB content - flexible schema
    tx?: DbTransaction
  ) {
    const database = tx ?? db;
    const [row] = await database
      .update(surveyTemplates)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      .set({ ...patch, updatedAt: sql`now()` } as any) // Drizzle type assertion for flexible values
      .where(and(eq(surveyTemplates.id, id), eq(surveyTemplates.creatorId, creatorId)))
      .returning();
    return row;
  }

  /**
   * Delete a template
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async delete(id: string, creatorId: string, tx?: DbTransaction) {
    const database = tx ?? db;
    const res = await database
      .delete(surveyTemplates)
      .where(and(eq(surveyTemplates.id, id), eq(surveyTemplates.creatorId, creatorId)))
      .returning({ id: surveyTemplates.id });
    return res.length > 0;
  }
}

export const templateRepository = new TemplateRepository();
