import {
  datavaultColumnsRepository,
  datavaultTablesRepository,
  datavaultRowsRepository,
  type DbTransaction,
} from "../repositories";
import type { DatavaultColumn, InsertDatavaultColumn } from "@shared/schema";
import { ConflictError } from "../errors/AppError";

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
   * Validate select/multiselect column options
   */
  private validateSelectOptions(
    type: string,
    options: any | null | undefined
  ): void {
    if (type === 'select' || type === 'multiselect') {
      // Select/multiselect columns require options
      if (!options || !Array.isArray(options) || options.length === 0) {
        throw new Error('Select and multiselect columns require at least one option');
      }

      // Validate option structure
      const valueSet = new Set<string>();
      for (const option of options) {
        if (!option.label || !option.value) {
          throw new Error('Each option must have both label and value');
        }

        // Check for duplicate values
        if (valueSet.has(option.value)) {
          throw new Error(`Duplicate option value: ${option.value}`);
        }
        valueSet.add(option.value);

        // Validate color if provided (simple Tailwind color names)
        if (option.color && typeof option.color !== 'string') {
          throw new Error('Option color must be a string');
        }
      }
    }
  }

  /**
   * Validate reference column configuration
   */
  private async validateReferenceColumn(
    type: string,
    referenceTableId: string | null | undefined,
    referenceDisplayColumnSlug: string | null | undefined,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    if (type === 'reference') {
      // Reference columns require referenceTableId
      if (!referenceTableId) {
        throw new Error('Reference columns require referenceTableId');
      }

      // Verify the referenced table exists and belongs to the same tenant
      const refTable = await this.tablesRepo.findById(referenceTableId, tx);
      if (!refTable) {
        throw new Error('Referenced table not found');
      }
      if (refTable.tenantId !== tenantId) {
        throw new Error('Referenced table must belong to the same tenant');
      }

      // If displayColumnSlug is provided, verify it exists in the referenced table
      if (referenceDisplayColumnSlug) {
        const refColumn = await this.columnsRepo.findByTableAndSlug(
          referenceTableId,
          referenceDisplayColumnSlug,
          tx
        );
        if (!refColumn) {
          throw new Error(
            `Display column '${referenceDisplayColumnSlug}' not found in referenced table`
          );
        }
      }
    }
  }

  /**
   * Detect circular reference dependencies
   * Uses depth-first search to find cycles in the reference graph
   */
  private async detectCircularReference(
    tableId: string,
    referenceTableId: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = async (currentTableId: string): Promise<boolean> => {
      if (recursionStack.has(currentTableId)) {
        return true; // Cycle detected
      }

      if (visited.has(currentTableId)) {
        return false; // Already checked this path
      }

      visited.add(currentTableId);
      recursionStack.add(currentTableId);

      // Get all reference columns for current table
      const columns = await this.columnsRepo.findByTableId(currentTableId, tx);
      const referenceColumns = columns.filter(col => col.type === 'reference' && col.referenceTableId);

      // Check each reference for cycles
      for (const col of referenceColumns) {
        if (await hasCycle(col.referenceTableId!)) {
          return true;
        }
      }

      recursionStack.delete(currentTableId);
      return false;
    };

    // Simulate adding the new reference and check for cycles
    return await hasCycle(referenceTableId);
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

    // Validate select/multiselect options
    this.validateSelectOptions(data.type, data.options);

    // Validate reference column configuration
    await this.validateReferenceColumn(
      data.type,
      data.referenceTableId,
      data.referenceDisplayColumnSlug,
      tenantId,
      tx
    );

    // Check for circular reference dependencies
    if (data.type === 'reference' && data.referenceTableId) {
      const hasCircularRef = await this.detectCircularReference(
        data.tableId,
        data.referenceTableId,
        tx
      );

      if (hasCircularRef) {
        throw new ConflictError(
          `Cannot create reference column: would create circular dependency with table ${data.referenceTableId}`
        );
      }
    }

    // Clear reference fields if type is not 'reference'
    let referenceTableId = data.referenceTableId;
    let referenceDisplayColumnSlug = data.referenceDisplayColumnSlug;
    if (data.type !== 'reference') {
      referenceTableId = null;
      referenceDisplayColumnSlug = null;
    }

    // Clear options if type is not 'select' or 'multiselect'
    let options = data.options;
    if (data.type !== 'select' && data.type !== 'multiselect') {
      options = null;
    }

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
        referenceTableId,
        referenceDisplayColumnSlug,
        options,
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

    // If select/multiselect options are being updated, validate them
    const typeToValidate = data.type || column.type;
    const optionsToValidate = data.options !== undefined ? data.options : column.options;
    this.validateSelectOptions(typeToValidate, optionsToValidate);

    // If reference-related fields are being updated, validate them
    const refTableId = data.referenceTableId !== undefined ? data.referenceTableId : column.referenceTableId;
    const refDisplaySlug = data.referenceDisplayColumnSlug !== undefined
      ? data.referenceDisplayColumnSlug
      : column.referenceDisplayColumnSlug;

    await this.validateReferenceColumn(
      typeToValidate,
      refTableId,
      refDisplaySlug,
      tenantId,
      tx
    );

    // Check for circular reference dependencies if referenceTableId is being changed
    if (typeToValidate === 'reference' && refTableId && refTableId !== column.referenceTableId) {
      const hasCircularRef = await this.detectCircularReference(
        column.tableId,
        refTableId,
        tx
      );

      if (hasCircularRef) {
        throw new ConflictError(
          `Cannot update reference column: would create circular dependency with table ${refTableId}`
        );
      }
    }

    // Clear reference fields if type is not 'reference'
    if (typeToValidate !== 'reference') {
      data.referenceTableId = null;
      data.referenceDisplayColumnSlug = null;
    }

    // Clear options if type is not 'select' or 'multiselect'
    if (typeToValidate !== 'select' && typeToValidate !== 'multiselect') {
      data.options = null;
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

    // If this is an auto-number column, cleanup its PostgreSQL sequence
    if (column.type === 'auto_number') {
      await this.rowsRepo.cleanupAutoNumberSequence(columnId, tx);
    }

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
