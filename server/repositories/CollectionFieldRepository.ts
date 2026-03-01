import { eq, and, asc, inArray, sql } from "drizzle-orm";

import { collectionFields, type CollectionField, type InsertCollectionField } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for collection field data access
 * Fields define the schema (columns) for each collection
 */
export class CollectionFieldRepository extends BaseRepository<typeof collectionFields, CollectionField, InsertCollectionField> {
  constructor(dbInstance?: typeof db) {
    super(collectionFields, dbInstance);
  }

  /**
   * Find fields by collection ID (ordered for display)
   */
  async findByCollectionId(collectionId: string, tx?: DbTransaction): Promise<CollectionField[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(collectionFields)
      .where(eq(collectionFields.collectionId, collectionId))
      .orderBy(asc(collectionFields.createdAt));
  }

  /**
   * Find field by collection ID and slug
   */
  async findByCollectionAndSlug(
    collectionId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<CollectionField | undefined> {
    const database = this.getDb(tx);
    const [field] = await database
      .select()
      .from(collectionFields)
      .where(and(eq(collectionFields.collectionId, collectionId), eq(collectionFields.slug, slug)));

    return field;
  }

  /**
   * Check if field slug exists in collection
   */
  async slugExists(
    collectionId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const database = this.getDb(tx);

    let whereCondition = and(
      eq(collectionFields.collectionId, collectionId),
      eq(collectionFields.slug, slug)
    );

    if (excludeId) {
      whereCondition = and(
        whereCondition,
        // @ts-expect-error - Drizzle type inference limitation
        eq(collectionFields.id, excludeId) === false
      );
    }

    const [result] = await database
      .select({ id: collectionFields.id })
      .from(collectionFields)
      .where(whereCondition)
      .limit(1);

    return result !== undefined;
  }

  /**
   * Count fields for multiple collections in a single query
   */
  async countByCollectionIds(collectionIds: string[], tx?: DbTransaction): Promise<Map<string, number>> {
    if (collectionIds.length === 0) return new Map();
    const database = this.getDb(tx);
    const results = await database
      .select({ collectionId: collectionFields.collectionId, count: sql<number>`count(*)::int` })
      .from(collectionFields)
      .where(inArray(collectionFields.collectionId, collectionIds))
      .groupBy(collectionFields.collectionId);
    const map = new Map<string, number>(collectionIds.map(id => [id, 0]));
    for (const r of results) {
      map.set(r.collectionId, r.count);
    }
    return map;
  }

  /**
   * Fetch all slugs for a collection (used for in-memory uniqueness deduplication)
   */
  async findSlugsByCollectionId(collectionId: string, tx?: DbTransaction): Promise<Set<string>> {
    const database = this.getDb(tx);
    const results = await database
      .select({ slug: collectionFields.slug })
      .from(collectionFields)
      .where(eq(collectionFields.collectionId, collectionId));
    return new Set(results.map(r => r.slug));
  }

  /**
   * Batch insert multiple fields
   */
  async createMany(fields: InsertCollectionField[], tx?: DbTransaction): Promise<CollectionField[]> {
    if (fields.length === 0) return [];
    const database = this.getDb(tx);
    return database.insert(collectionFields).values(fields).returning();
  }

  /**
   * Delete all fields for a collection
   */
  async deleteByCollectionId(collectionId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(collectionFields)
      .where(eq(collectionFields.collectionId, collectionId));
  }

  /**
   * Update field with timestamp
   */
  async update(
    id: string,
    updates: Partial<InsertCollectionField>,
    tx?: DbTransaction
  ): Promise<CollectionField> {
    return super.update(id, updates, tx);
  }
}

// Singleton instance
export const collectionFieldRepository = new CollectionFieldRepository();
