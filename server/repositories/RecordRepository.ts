import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { records, type CollectionRecord, type InsertCollectionRecord } from "@shared/schema";
import { eq, and, desc, sql, SQL } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for record data access
 * Records are rows in collections with schemaless JSONB data
 */
export class RecordRepository extends BaseRepository<typeof records, CollectionRecord, InsertCollectionRecord> {
  constructor(dbInstance?: typeof db) {
    super(records, dbInstance);
  }

  /**
   * Find records by collection ID with pagination
   */
  async findByCollectionId(
    collectionId: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: 'created_at' | 'updated_at';
      order?: 'asc' | 'desc';
    },
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    const database = this.getDb(tx);

    let query = database
      .select()
      .from(records)
      .where(eq(records.collectionId, collectionId));

    // Apply ordering
    const orderByField = options?.orderBy === 'updated_at' ? records.updatedAt : records.createdAt;
    const orderDirection = options?.order === 'asc' ? asc : desc;
    query = query.orderBy(orderDirection(orderByField)) as any;

    // Apply pagination
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    return query;
  }

  /**
   * Find records by tenant ID
   */
  async findByTenantId(tenantId: string, tx?: DbTransaction): Promise<CollectionRecord[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(records)
      .where(eq(records.tenantId, tenantId))
      .orderBy(desc(records.createdAt));
  }

  /**
   * Find records matching JSONB filters
   * Example: findByFilters(collectionId, { status: 'active', priority: 'high' })
   */
  async findByFilters(
    collectionId: string,
    filters: Record<string, any>,
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    const database = this.getDb(tx);

    // Build JSONB filter conditions
    const conditions: SQL[] = [eq(records.collectionId, collectionId)];

    for (const [key, value] of Object.entries(filters)) {
      // Using JSONB operators for flexible querying
      conditions.push(
        sql`${records.data}->>${key} = ${value}`
      );
    }

    return await database
      .select()
      .from(records)
      .where(and(...conditions))
      .orderBy(desc(records.createdAt));
  }

  /**
   * Count records in a collection
   */
  async countByCollectionId(collectionId: string, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [result] = await database
      .select({ count: sql<number>`count(*)` })
      .from(records)
      .where(eq(records.collectionId, collectionId));

    return result?.count || 0;
  }

  /**
   * Delete all records in a collection
   */
  async deleteByCollectionId(collectionId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(records)
      .where(eq(records.collectionId, collectionId));
  }

  /**
   * Update record with timestamp and user tracking
   */
  async update(
    id: string,
    updates: Partial<InsertCollectionRecord>,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord> {
    const updatedData = {
      ...updates,
      updatedAt: new Date(),
      ...(userId && { updatedBy: userId }),
    };
    return super.update(id, updatedData, tx);
  }
}

// Import asc for ordering
import { asc } from "drizzle-orm";

// Singleton instance
export const recordRepository = new RecordRepository();
