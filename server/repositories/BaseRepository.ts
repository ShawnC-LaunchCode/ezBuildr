import { eq, count, type SQL, ExtractTablesWithRelations } from "drizzle-orm";

import * as schema from "@shared/schema";

import { db } from "../db";

import type { PgTable, PgTransaction } from "drizzle-orm/pg-core";
// Type alias for database transactions
export type DbTransaction = PgTransaction<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's transaction HKT requires an any driver parameter
  any, // Drizzle ORM HKT (Higher-Kinded Type) - must use any for generic transaction support
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  protected getDb(tx?: DbTransaction) {
    // If transaction provided, use it
    if (tx) { return tx; }
    // If explicit db instance was provided in constructor (for tests), use it
    if (this.dbInstance !== undefined) { return this.dbInstance; }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- generic Drizzle tables do not expose their columns through PgTable
    const idColumn = (this.table as any).id; // Generic access to Drizzle table structure
    const [record] = await database
      .select()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's from() cannot infer a concrete table from the repository generic
      .from(this.table as any) // Generic Drizzle table reference
      .where(eq(idColumn, id));
    return record as TSelect | undefined;
  }
  /**
   * Find all records (optionally filtered)
   */
  async findAll(where?: SQL, orderBy?: SQL, tx?: DbTransaction): Promise<TSelect[]> {
    const database = this.getDb(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's dynamic query type cannot be expressed across every repository table
    let query = database.select().from(this.table as any); // Generic Drizzle query builder
    if (where) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- where() changes Drizzle's generic query state
      query = query.where(where) as any; // Drizzle query builder chaining
    }
    if (orderBy) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- orderBy() changes Drizzle's generic query state
      query = query.orderBy(orderBy) as any; // Drizzle query builder chaining
    }
    return query as Promise<TSelect[]>;
  }
  /**
   * Create a new record
   */
  async create(data: TInsert, tx?: DbTransaction): Promise<TSelect> {
    const database = this.getDb(tx);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the generic Drizzle insert builder returns an any-backed row type
    const [record] = await database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's insert() cannot infer a concrete table from the repository generic
      .insert(this.table as any) // Generic Drizzle table reference
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- insert data is validated by each repository's TInsert type
      .values(data as any) // Generic insert data for any table schema
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- update() needs both generic table columns and Drizzle's concrete table type
    const table = this.table as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- id is guaranteed by every repository table
    const idColumn = table.id; // Generic access to Drizzle table structure
    // Inject updatedAt if the table has that column, so callers don't need to set it manually
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- updatedAt is optional across repository tables
    const effectiveUpdates: any = table.updatedAt
      ? { ...updates, updatedAt: new Date() }
      : updates;
    const [record] = await database
      .update(table) // Generic Drizzle table reference
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- effectiveUpdates matches TInsert but Drizzle's generic update builder is any-backed
      .set(effectiveUpdates) // Generic update data for any table schema
      .where(eq(idColumn, id))
      .returning();
    return record as TSelect;
  }
  /**
   * Delete a record by ID
   */
  async delete(id: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- generic Drizzle tables do not expose their id column through PgTable
    const idColumn = (this.table as any).id; // Generic access to Drizzle table structure
    await database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's delete() cannot infer a concrete table from the repository generic
      .delete(this.table as any) // Generic Drizzle table reference
      .where(eq(idColumn, id));
  }
  /**
   * Delete multiple records matching a condition
   */
  async deleteWhere(where: SQL, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's delete() cannot infer a concrete table from the repository generic
      .delete(this.table as any) // Generic Drizzle table reference
      .where(where);
  }
  /**
   * Count records (optionally filtered)
   */
  async count(where?: SQL, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle's count query cannot infer a concrete table from the repository generic
    let query = database.select({ count: count() }).from(this.table as any);
    if (where) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- where() changes Drizzle's generic count-query state
      query = query.where(where) as any;
    }
    const [result] = await query;
    return Number(result?.count ?? 0);
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
