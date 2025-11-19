import { db } from '../db';
import { datavaultDatabases, datavaultTables } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { DatavaultDatabase, InsertDatavaultDatabase, DatavaultScopeType } from '../../shared/schema';

export class DatavaultDatabasesRepository {

  /**
   * Find all databases for a tenant
   */
  async findByTenantId(tenantId: string): Promise<DatavaultDatabase[]> {
    return db
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.tenantId, tenantId))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find databases by scope
   */
  async findByScope(
    tenantId: string,
    scopeType: DatavaultScopeType,
    scopeId?: string
  ): Promise<DatavaultDatabase[]> {
    const conditions = [eq(datavaultDatabases.tenantId, tenantId)];

    if (scopeType === 'account') {
      conditions.push(eq(datavaultDatabases.scopeType, 'account'));
    } else {
      conditions.push(
        eq(datavaultDatabases.scopeType, scopeType),
        eq(datavaultDatabases.scopeId, scopeId!)
      );
    }

    return db
      .select()
      .from(datavaultDatabases)
      .where(and(...conditions))
      .orderBy(desc(datavaultDatabases.updatedAt));
  }

  /**
   * Find database by ID
   */
  async findById(id: string): Promise<DatavaultDatabase | null> {
    const results = await db
      .select()
      .from(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Find database by ID with table count
   */
  async findByIdWithStats(id: string) {
    const database = await this.findById(id);
    if (!database) return null;

    const tableCount = await db
      .select({ count: db.fn.count() })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, id));

    return {
      ...database,
      tableCount: Number(tableCount[0]?.count || 0),
    };
  }

  /**
   * Create a new database
   */
  async create(data: InsertDatavaultDatabase): Promise<DatavaultDatabase> {
    const results = await db
      .insert(datavaultDatabases)
      .values(data)
      .returning();

    return results[0];
  }

  /**
   * Update database
   */
  async update(
    id: string,
    data: Partial<Omit<DatavaultDatabase, 'id' | 'createdAt'>>
  ): Promise<DatavaultDatabase | null> {
    const results = await db
      .update(datavaultDatabases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results[0] || null;
  }

  /**
   * Delete database (tables will have database_id set to null via ON DELETE SET NULL)
   */
  async delete(id: string): Promise<boolean> {
    const results = await db
      .delete(datavaultDatabases)
      .where(eq(datavaultDatabases.id, id))
      .returning();

    return results.length > 0;
  }

  /**
   * Check if database exists and belongs to tenant
   */
  async existsForTenant(id: string, tenantId: string): Promise<boolean> {
    const results = await db
      .select({ id: datavaultDatabases.id })
      .from(datavaultDatabases)
      .where(
        and(
          eq(datavaultDatabases.id, id),
          eq(datavaultDatabases.tenantId, tenantId)
        )
      )
      .limit(1);

    return results.length > 0;
  }

  /**
   * Get tables in a database
   */
  async getTablesInDatabase(databaseId: string) {
    return db
      .select()
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId))
      .orderBy(datavaultTables.name);
  }

  /**
   * Count tables in database
   */
  async countTables(databaseId: string): Promise<number> {
    const result = await db
      .select({ count: db.fn.count() })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId));

    return Number(result[0]?.count || 0);
  }
}

export const datavaultDatabasesRepository = new DatavaultDatabasesRepository();
