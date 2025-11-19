import {
  datavaultTablesRepository,
  datavaultColumnsRepository,
  datavaultRowsRepository,
  type DbTransaction,
} from "../repositories";
import type { DatavaultTable, InsertDatavaultTable } from "@shared/schema";

/**
 * Service layer for DataVault table business logic
 * Handles table CRUD operations with tenant isolation
 */
export class DatavaultTablesService {
  private tablesRepo: typeof datavaultTablesRepository;
  private columnsRepo: typeof datavaultColumnsRepository;
  private rowsRepo: typeof datavaultRowsRepository;

  constructor(
    tablesRepo?: typeof datavaultTablesRepository,
    columnsRepo?: typeof datavaultColumnsRepository,
    rowsRepo?: typeof datavaultRowsRepository
  ) {
    this.tablesRepo = tablesRepo || datavaultTablesRepository;
    this.columnsRepo = columnsRepo || datavaultColumnsRepository;
    this.rowsRepo = rowsRepo || datavaultRowsRepository;
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Ensure slug is unique for the tenant
   */
  private async ensureUniqueSlug(
    tenantId: string,
    baseSlug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.tablesRepo.slugExists(tenantId, slug, excludeId, tx)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Verify table belongs to tenant
   */
  async verifyTenantOwnership(
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    const table = await this.tablesRepo.findById(tableId, tx);

    if (!table) {
      throw new Error("Table not found");
    }

    if (table.tenantId !== tenantId) {
      throw new Error("Access denied - table belongs to different tenant");
    }

    return table;
  }

  /**
   * Create a new table with automatic primary key column
   */
  async createTable(data: InsertDatavaultTable, tx?: DbTransaction): Promise<DatavaultTable> {
    // Generate slug if not provided
    const baseSlug = data.slug || this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.tenantId, baseSlug, undefined, tx);

    // Create the table
    const table = await this.tablesRepo.create(
      {
        ...data,
        slug: uniqueSlug,
      },
      tx
    );

    // Auto-create a primary key column (ID) for the new table
    // Every table must have at least one primary key
    await this.columnsRepo.create(
      {
        tableId: table.id,
        name: 'ID',
        slug: 'id',
        type: 'auto_number',
        required: true,
        isPrimaryKey: true,
        isUnique: true,
        orderIndex: 0,
        autoNumberStart: 1,
      },
      tx
    );

    return table;
  }

  /**
   * Get table by ID with tenant verification
   */
  async getTable(tableId: string, tenantId: string, tx?: DbTransaction): Promise<DatavaultTable> {
    return await this.verifyTenantOwnership(tableId, tenantId, tx);
  }

  /**
   * Get table with columns
   */
  async getTableWithColumns(tableId: string, tenantId: string, tx?: DbTransaction) {
    const table = await this.verifyTenantOwnership(tableId, tenantId, tx);
    const columns = await this.columnsRepo.findByTableId(tableId, tx);

    return {
      ...table,
      columns,
    };
  }

  /**
   * List all tables for a tenant
   */
  async listTables(tenantId: string, tx?: DbTransaction): Promise<DatavaultTable[]> {
    return await this.tablesRepo.findByTenantId(tenantId, tx);
  }

  /**
   * List tables with stats (column count, row count)
   */
  async listTablesWithStats(tenantId: string, tx?: DbTransaction) {
    const tables = await this.tablesRepo.findByTenantId(tenantId, tx);

    const tablesWithStats = await Promise.all(
      tables.map(async (table) => {
        const columnCount = await this.columnsRepo.countByTableId(table.id, tx);
        const rowCount = await this.rowsRepo.countByTableId(table.id, tx);

        return {
          ...table,
          columnCount,
          rowCount,
        };
      })
    );

    return tablesWithStats;
  }

  /**
   * Update table
   */
  async updateTable(
    tableId: string,
    tenantId: string,
    data: Partial<InsertDatavaultTable>,
    tx?: DbTransaction
  ): Promise<DatavaultTable> {
    await this.verifyTenantOwnership(tableId, tenantId, tx);

    // If name changed, regenerate slug
    if (data.name && !data.slug) {
      const baseSlug = this.generateSlug(data.name);
      data.slug = await this.ensureUniqueSlug(tenantId, baseSlug, tableId, tx);
    }

    // If slug provided, ensure it's unique
    if (data.slug) {
      data.slug = await this.ensureUniqueSlug(tenantId, data.slug, tableId, tx);
    }

    return await this.tablesRepo.update(tableId, data, tx);
  }

  /**
   * Delete table (cascades to columns, rows, and values)
   */
  async deleteTable(tableId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyTenantOwnership(tableId, tenantId, tx);
    await this.tablesRepo.delete(tableId, tx);
  }

  /**
   * Get table by slug
   */
  async getTableBySlug(
    tenantId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<DatavaultTable | undefined> {
    return await this.tablesRepo.findByTenantAndSlug(tenantId, slug, tx);
  }

  /**
   * Check if table slug is available
   */
  async isSlugAvailable(
    tenantId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    return !(await this.tablesRepo.slugExists(tenantId, slug, excludeId, tx));
  }
}

// Singleton instance
export const datavaultTablesService = new DatavaultTablesService();
