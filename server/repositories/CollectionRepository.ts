import { eq, and, desc } from "drizzle-orm";

import { collections, type Collection, type InsertCollection } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for collection data access
 * Collections are tenant-scoped data tables similar to Airtable bases
 */
export class CollectionRepository extends BaseRepository<typeof collections, Collection, InsertCollection> {
  constructor(dbInstance?: typeof db) {
    super(collections, dbInstance);
  }

  /**
   * Find collections by tenant ID
   */
  async findByTenantId(tenantId: string, tx?: DbTransaction): Promise<Collection[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(collections)
      .where(eq(collections.tenantId, tenantId))
      .orderBy(desc(collections.createdAt));
  }

  /**
   * Find collection by tenant ID and slug
   */
  async findByTenantAndSlug(tenantId: string, slug: string, tx?: DbTransaction): Promise<Collection | undefined> {
    const database = this.getDb(tx);
    const [collection] = await database
      .select()
      .from(collections)
      .where(and(eq(collections.tenantId, tenantId), eq(collections.slug, slug)));

    return collection;
  }

  /**
   * Check if slug exists for tenant
   */
  async slugExists(tenantId: string, slug: string, excludeId?: string, tx?: DbTransaction): Promise<boolean> {
    const database = this.getDb(tx);

    let whereCondition = and(
      eq(collections.tenantId, tenantId),
      eq(collections.slug, slug)
    );

    if (excludeId) {
      whereCondition = and(
        whereCondition,
        // @ts-ignore - Drizzle type inference limitation
        eq(collections.id, excludeId) === false
      );
    }

    const [result] = await database
      .select({ id: collections.id })
      .from(collections)
      .where(whereCondition)
      .limit(1);

    return !!result;
  }

  /**
   * Update collection with timestamp
   */
  async update(
    id: string,
    updates: Partial<InsertCollection>,
    tx?: DbTransaction
  ): Promise<Collection> {
    return super.update(id, updates, tx);
  }
}

// Singleton instance
export const collectionRepository = new CollectionRepository();
