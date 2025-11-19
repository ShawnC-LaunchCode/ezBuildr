import {
  datavaultColumnsRepository,
  datavaultTablesRepository,
  datavaultRowsRepository,
  type DbTransaction,
} from "../repositories";
import type { DatavaultColumn, InsertDatavaultColumn } from "@shared/schema";

/**
 * Service layer for DataVault column business logic
 * Handles column CRUD operations with validation and authorization
 */
export class DatavaultColumnsService {
  private columnsRepo: typeof datavaultColumnsRepository;
  private tablesRepo: typeof datavaultTablesRepository;
  private rowsRepo: typeof datavaultRowsRepository;

  constructor(
    columnsRepo?: typeof datavaultColumnsRepository,
    tablesRepo?: typeof datavaultTablesRepository,
    rowsRepo?: typeof datavaultRowsRepository
  ) {
    this.columnsRepo = columnsRepo || datavaultColumnsRepository;
    this.tablesRepo = tablesRepo || datavaultTablesRepository;
    this.rowsRepo = rowsRepo || datavaultRowsRepository;
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Ensure slug is unique for the table
   */
  private async ensureUniqueSlug(
    tableId: string,
    baseSlug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.columnsRepo.slugExists(tableId, slug, excludeId, tx)) {
      slug = `${baseSlug}_${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Verify table belongs to tenant
   */
  private async verifyTableOwnership(
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const table = await this.tablesRepo.findById(tableId, tx);

    if (!table) {
      throw new Error("Table not found");
    }

    if (table.tenantId !== tenantId) {
      throw new Error("Access denied - table belongs to different tenant");
    }
  }

  /**
   * Verify column belongs to tenant's table
   */
  async verifyColumnOwnership(
    columnId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    const column = await this.columnsRepo.findById(columnId, tx);

    if (!column) {
      throw new Error("Column not found");
    }

    // Verify the table belongs to the tenant
    await this.verifyTableOwnership(column.tableId, tenantId, tx);

    return column;
  }

  /**
   * Validate primary key constraints
   */
  private async validatePrimaryKey(
    tableId: string,
    isPrimaryKey: boolean,
    columnId?: string,
    tx?: DbTransaction
  ): Promise<void> {
    if (isPrimaryKey) {
      const columns = await this.columnsRepo.findByTableId(tableId, tx);
      const existingPrimaryKey = columns.find(c => c.isPrimaryKey && c.id !== columnId);

      if (existingPrimaryKey) {
        throw new Error(
          `Table already has a primary key column: "${existingPrimaryKey.name}". ` +
          `Each table can only have one primary key. Please unset the existing primary key first.`
        );
      }
    }
  }

  /**
   * Validate unique constraints for column values
   */
  private async validateUniqueConstraint(
    columnId: string,
    isUnique: boolean,
    tx?: DbTransaction
  ): Promise<void> {
    if (isUnique) {
      // Check if there are duplicate values in existing rows
      const hasDuplicates = await this.rowsRepo.checkColumnHasDuplicates(columnId, tx);
      if (hasDuplicates) {
        throw new Error(
          'Cannot make this column unique because it contains duplicate values. ' +
          'Please remove duplicates first.'
        );
      }
    }
  }

  /**
   * Create a new column
   */
  async createColumn(
    data: InsertDatavaultColumn,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    // Verify table ownership
    await this.verifyTableOwnership(data.tableId, tenantId, tx);

    // Validate primary key constraints
    if (data.isPrimaryKey) {
      await this.validatePrimaryKey(data.tableId, true, undefined, tx);
    }

    // Generate slug if not provided
    const baseSlug = data.slug || this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.tableId, baseSlug, undefined, tx);

    // Get next order index if not provided
    let orderIndex = data.orderIndex;
    if (orderIndex === undefined || orderIndex === null) {
      const maxOrder = await this.columnsRepo.getMaxOrderIndex(data.tableId, tx);
      orderIndex = maxOrder + 1;
    }

    // Primary key columns must be required and unique
    const required = data.isPrimaryKey ? true : (data.required ?? false);
    const isUnique = data.isPrimaryKey ? true : (data.isUnique ?? false);

    return await this.columnsRepo.create(
      {
        ...data,
        slug: uniqueSlug,
        orderIndex,
        required,
        isUnique,
      },
      tx
    );
  }

  /**
   * Get column by ID with tenant verification
   */
  async getColumn(
    columnId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    return await this.verifyColumnOwnership(columnId, tenantId, tx);
  }

  /**
   * List columns for a table
   */
  async listColumns(
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn[]> {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return await this.columnsRepo.findByTableId(tableId, tx);
  }

  /**
   * Update column (name only - type changes not allowed)
   */
  async updateColumn(
    columnId: string,
    tenantId: string,
    data: Partial<InsertDatavaultColumn>,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    const column = await this.verifyColumnOwnership(columnId, tenantId, tx);

    // Prevent type changes
    if (data.type && data.type !== column.type) {
      throw new Error("Cannot change column type after creation");
    }

    // Validate primary key changes
    if (data.isPrimaryKey !== undefined && data.isPrimaryKey !== column.isPrimaryKey) {
      if (data.isPrimaryKey) {
        // Setting as primary key
        await this.validatePrimaryKey(column.tableId, true, columnId, tx);
      } else {
        // Removing primary key - check if table has at least one other column
        const allColumns = await this.columnsRepo.findByTableId(column.tableId, tx);
        if (allColumns.length === 1) {
          throw new Error(
            'Cannot remove primary key from the only column in the table. ' +
            'Tables must have at least one primary key column.'
          );
        }
        // If removing primary key, warn that another column should be designated
        // (this is handled by the frontend)
      }
    }

    // Validate unique constraint changes
    if (data.isUnique !== undefined && data.isUnique && !column.isUnique) {
      await this.validateUniqueConstraint(columnId, true, tx);
    }

    // If name changed, regenerate slug
    if (data.name && !data.slug) {
      const baseSlug = this.generateSlug(data.name);
      data.slug = await this.ensureUniqueSlug(column.tableId, baseSlug, columnId, tx);
    }

    // If slug provided, ensure it's unique
    if (data.slug) {
      data.slug = await this.ensureUniqueSlug(column.tableId, data.slug, columnId, tx);
    }

    // If setting as primary key, force required and unique
    if (data.isPrimaryKey) {
      data.required = true;
      data.isUnique = true;
    }

    return await this.columnsRepo.update(columnId, data, tx);
  }

  /**
   * Delete column (also deletes all associated values)
   */
  async deleteColumn(columnId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    const column = await this.verifyColumnOwnership(columnId, tenantId, tx);

    // Prevent deleting the only primary key column
    if (column.isPrimaryKey) {
      const allColumns = await this.columnsRepo.findByTableId(column.tableId, tx);
      const primaryKeyColumns = allColumns.filter(c => c.isPrimaryKey);

      if (primaryKeyColumns.length === 1) {
        throw new Error(
          'Cannot delete the primary key column. Tables must have at least one primary key column. ' +
          'Please designate another column as the primary key before deleting this one.'
        );
      }
    }

    // Delete all values for this column first (though CASCADE should handle it)
    await this.rowsRepo.deleteValuesByColumnId(columnId, tx);

    // Delete the column
    await this.columnsRepo.delete(columnId, tx);
  }

  /**
   * Reorder columns for a table
   */
  async reorderColumns(
    tableId: string,
    tenantId: string,
    columnIds: string[],
    tx?: DbTransaction
  ): Promise<void> {
    await this.verifyTableOwnership(tableId, tenantId, tx);

    // Verify all columns belong to the table
    const columns = await this.columnsRepo.findByTableId(tableId, tx);
    const tableColumnIds = new Set(columns.map((c) => c.id));

    for (const columnId of columnIds) {
      if (!tableColumnIds.has(columnId)) {
        throw new Error(`Column ${columnId} does not belong to table ${tableId}`);
      }
    }

    await this.columnsRepo.reorderColumns(tableId, columnIds, tx);
  }

  /**
   * Get column by slug
   */
  async getColumnBySlug(
    tableId: string,
    tenantId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn | undefined> {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return await this.columnsRepo.findByTableAndSlug(tableId, slug, tx);
  }
}

// Singleton instance
export const datavaultColumnsService = new DatavaultColumnsService();
