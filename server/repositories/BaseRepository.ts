import { eq, and, desc, type SQL , ExtractTablesWithRelations } from "drizzle-orm";

import * as schema from "@shared/schema";

import { db } from "../db";

import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTable , PgTransaction } from "drizzle-orm/pg-core";




// Type alias for database transactions
export type DbTransaction = PgTransaction<
  any, // Use any for HKT to support both NodePg and Neon
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Base repository providing common CRUD operations
 * All domain-specific repositories should extend this class
 */
export abstract class BaseRepository<TTable extends PgTable, TSelect, TInsert> {
  protected readonly dbInstance: typeof db | undefined;

  constructor(protected readonly table: TTable, dbInstance?: typeof db) {
    // Store the provided instance, but if none provided, leave undefined
    // to use the getter pattern below
    this.dbInstance = dbInstance;
  }

  /**
   * Get database connection (or transaction if provided)
   * Always references the current value of db to avoid initialization race conditions
   */
  protected getDb(tx?: DbTransaction) {
    // If transaction provided, use it
    if (tx) {return tx;}

    // If explicit db instance was provided in constructor (for tests), use it
    if (this.dbInstance !== undefined) {return this.dbInstance;}

    // Otherwise, use the current value of the db module variable
    // This ensures we always get the initialized db, even if repository
    // was instantiated before database initialization completed
    return db;
  }

  /**
   * Find a single record by ID
   */
  async findById(id: string, tx?: DbTransaction): Promise<TSelect | undefined> {
    const database = this.getDb(tx);
    const idColumn = (this.table as any).id;

    const [record] = await database
      .select()
      .from(this.table as any)
      .where(eq(idColumn, id));

    return record as TSelect | undefined;
  }

  /**
   * Find all records (optionally filtered)
   */
  async findAll(where?: SQL, orderBy?: SQL, tx?: DbTransaction): Promise<TSelect[]> {
    const database = this.getDb(tx);

    let query = database.select().from(this.table as any);

    if (where) {
      query = query.where(where) as any;
    }

    if (orderBy) {
      query = query.orderBy(orderBy) as any;
    }

    return query as Promise<TSelect[]>;
  }

  /**
   * Create a new record
   */
  async create(data: TInsert, tx?: DbTransaction): Promise<TSelect> {
    const database = this.getDb(tx);

    const [record] = await database
      .insert(this.table as any)
      .values(data as any)
      .returning();

    return record as TSelect;
  }

  /**
   * Update a record by ID
   */
  async update(
    id: string,
    updates: Partial<TInsert>,
    tx?: DbTransaction
  ): Promise<TSelect> {
    const database = this.getDb(tx);
    const idColumn = (this.table as any).id;

    const [record] = await database
      .update(this.table as any)
      .set(updates as any)
      .where(eq(idColumn, id))
      .returning();

    return record as TSelect;
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    const idColumn = (this.table as any).id;

    await database
      .delete(this.table as any)
      .where(eq(idColumn, id));
  }

  /**
   * Delete multiple records matching a condition
   */
  async deleteWhere(where: SQL, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);

    await database
      .delete(this.table as any)
      .where(where);
  }

  /**
   * Count records (optionally filtered)
   */
  async count(where?: SQL, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);

    let query = database.select({ count: db.select().from(this.table as any) as any }).from(this.table as any);

    if (where) {
      query = query.where(where) as any;
    }

    const [result] = await query;
    return Number(result?.count || 0);
  }

  /**
   * Execute a transaction with multiple operations
   */
  async transaction<T>(
    callback: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    return db.transaction(callback);
  }
}
