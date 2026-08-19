import {  or , sql } from "drizzle-orm";

import { blocks, transformBlocks } from "@shared/schema";
import type { DatavaultColumn, InsertDatavaultColumn } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { BadRequestError, ConflictError } from "../errors/AppError";
import {
  datavaultColumnsRepository,
  datavaultTablesRepository,
  datavaultRowsRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";
/**
 * Service layer for DataVault column business logic
 * Handles column CRUD operations with validation and authorization
 *
 * RLS-2b: copies the service-boundary tenant transaction pattern from
 * CollectionService (RLS-2a) — see docs/architecture/TENANT_ISOLATION_RLS.md §2b.
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
    this.columnsRepo = columnsRepo ?? datavaultColumnsRepository;
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
    this.rowsRepo = rowsRepo ?? datavaultRowsRepository;
  }

  /** See CollectionService.withTx (RLS-2a) — identical shape, copied per RLS-2b. */
  private async withTx<T>(
    expectedTenantId: string,
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    const ambientTenantId = getCurrentTenantId();
    if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
      throw new Error(
        `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
        `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
        `silently scoping to the wrong tenant.`
      );
    }
    return withCurrentTenant(fn);
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

      logger.debug({ tableId }, "Table not found");
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const column = await this.columnsRepo.findById(columnId, scopedTx);
      if (!column) {
        throw new Error("Column not found");
      }
      // Verify the table belongs to the tenant
      await this.verifyTableOwnership(column.tableId, tenantId, scopedTx);
      return column;
    });
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
        throw new BadRequestError(
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
        throw new BadRequestError(
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-redundant-type-constituents
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
        if (!option.label || !option.value) {
          throw new Error('Each option must have both label and value');
        }
        // Check for duplicate values
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
        if (valueSet.has(option.value)) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
          throw new Error(`Duplicate option value: ${option.value}`);
        }
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
        valueSet.add(option.value);
        // Validate color if provided (simple Tailwind color names)
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
        if (option.color && typeof option.color !== 'string') {
          throw new Error('Option color must be a string');
        }
      }
    }
  }
  /**
   * Validate the optional formatting applied to auto-number columns.
   */
  private validateAutoNumberConfiguration(
    type: DatavaultColumn['type'],
    prefix: string | null | undefined,
    padding: number | null | undefined
  ): void {
    if ((type === 'auto_number' || type === 'autonumber') && prefix && (padding ?? 4) < 1) {
      throw new BadRequestError('Auto-number padding must be at least 1 when a prefix is set');
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
    return hasCycle(referenceTableId);
  }
  /**
   * Create a new column
   */
  async createColumn(
    data: InsertDatavaultColumn,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify table ownership
      await this.verifyTableOwnership(data.tableId, tenantId, scopedTx);
      if (data.type === 'autonumber') {
        throw new BadRequestError("Column type 'autonumber' is deprecated; use 'auto_number' instead");
      }
      this.validateAutoNumberConfiguration(data.type, data.autonumberPrefix, data.autonumberPadding);
      // Validate select/multiselect options
      this.validateSelectOptions(data.type, data.options);
      // Validate reference column configuration
      await this.validateReferenceColumn(
        data.type,
        data.referenceTableId,
        data.referenceDisplayColumnSlug,
        tenantId,
        scopedTx
      );
      // Check for circular reference dependencies
      if (data.type === 'reference' && data.referenceTableId) {
        const hasCircularRef = await this.detectCircularReference(
          data.tableId,
          data.referenceTableId,
          scopedTx
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
        await this.validatePrimaryKey(data.tableId, true, undefined, scopedTx);
      }
      // Generate slug if not provided
      const baseSlug = data.slug ?? this.generateSlug(data.name);
      const uniqueSlug = await this.ensureUniqueSlug(data.tableId, baseSlug, undefined, scopedTx);
      // Get next order index if not provided
      let orderIndex = data.orderIndex;
      if (orderIndex === undefined || orderIndex === null) {
        const maxOrder = await this.columnsRepo.getMaxOrderIndex(data.tableId, scopedTx);
        orderIndex = maxOrder + 1;
      }
      // Primary key columns must be required and unique
      const required = data.isPrimaryKey ? true : (data.required ?? false);
      const isUnique = data.isPrimaryKey ? true : (data.isUnique ?? false);
      const column = await this.columnsRepo.create(
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
        scopedTx
      );
      // Seed the counter row backing auto-number generation for this column.
      // Generation also self-heals if this row is ever missing (e.g. columns
      // created via a path that bypasses this service), so this is the normal
      // case, not the only guarantee.
      if (column.type === 'auto_number') {
        await this.rowsRepo.createNumberSequence(
          tenantId,
          column.tableId,
          column.id,
          {
            startValue: column.autoNumberStart ?? 1,
            prefix: column.autonumberPrefix,
            padding: column.autonumberPadding ?? 4,
          },
          scopedTx
        );
      }
      return column;
    });
  }
  /**
   * Get column by ID with tenant verification
   */
  async getColumn(
    columnId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn> {
    return this.verifyColumnOwnership(columnId, tenantId, tx);
  }
  /**
   * List columns for a table
   */
  async listColumns(
    tableId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultColumn[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyTableOwnership(tableId, tenantId, scopedTx);
      return this.columnsRepo.findByTableId(tableId, scopedTx);
    });
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
    // eslint-disable-next-line sonarjs/cognitive-complexity, complexity -- pre-existing complexity (this body is unchanged from before RLS-2b's withTx wrap moved it into a nested arrow)
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const column = await this.verifyColumnOwnership(columnId, tenantId, scopedTx);
      // Prevent type changes
      if (data.type && data.type !== column.type) {
        throw new Error("Cannot change column type after creation");
      }
      // If select/multiselect options are being updated, validate them
      const typeToValidate = data.type ?? column.type;
      const prefixToValidate = data.autonumberPrefix !== undefined
        ? data.autonumberPrefix
        : column.autonumberPrefix;
      const paddingToValidate = data.autonumberPadding !== undefined
        ? data.autonumberPadding
        : column.autonumberPadding;
      this.validateAutoNumberConfiguration(typeToValidate, prefixToValidate, paddingToValidate);
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
        scopedTx
      );
      // Check for circular reference dependencies if referenceTableId is being changed
      if (typeToValidate === 'reference' && refTableId && refTableId !== column.referenceTableId) {
        const hasCircularRef = await this.detectCircularReference(
          column.tableId,
          refTableId,
          scopedTx
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
      // Primary key and uniqueness semantics:
      // A column is effectively unique if (isUnique === true || isPrimaryKey === true).
      const currentIsPk = column.isPrimaryKey ?? false;
      const currentIsUnique = (column.isUnique ?? false) || currentIsPk;

      // Check invalid combination: trying to turn isUnique false on an existing primary key
      // without simultaneously removing primary key status.
      if (data.isUnique === false && currentIsPk && data.isPrimaryKey !== false) {
        throw new BadRequestError(
          'A primary key column must be unique. To remove uniqueness, remove primary key status first.'
        );
      }

      // If setting as primary key, force required and unique
      if (data.isPrimaryKey) {
        data.required = true;
        data.isUnique = true;
      }

      // Validate primary key changes
      if (data.isPrimaryKey !== undefined && data.isPrimaryKey !== column.isPrimaryKey) {
        if (data.isPrimaryKey) {
          // Setting as primary key
          await this.validatePrimaryKey(column.tableId, true, columnId, scopedTx);
        } else {
          // Removing primary key - check if table has at least one other column
          const allColumns = await this.columnsRepo.findByTableId(column.tableId, scopedTx);
          if (allColumns.length === 1) {
            throw new BadRequestError(
              'Cannot remove primary key from the only column in the table. ' +
              'Tables must have at least one primary key column.'
            );
          }
        }
      }

      const newIsPk = data.isPrimaryKey ?? currentIsPk;
      const newIsUnique = newIsPk ? true : (data.isUnique ?? column.isUnique ?? false);

      // Validate unique constraint changes and sync unique keys
      if (!currentIsUnique && newIsUnique) {
        await this.validateUniqueConstraint(columnId, true, scopedTx);
        await this.rowsRepo.populateUniqueKeysForColumn(columnId, scopedTx);
      } else if (currentIsUnique && !newIsUnique) {
        await this.rowsRepo.removeUniqueKeysForColumn(columnId, scopedTx);
      }

      // If name changed, regenerate slug
      if (data.name && !data.slug) {
        const baseSlug = this.generateSlug(data.name);
        data.slug = await this.ensureUniqueSlug(column.tableId, baseSlug, columnId, scopedTx);
      }

      // If slug provided, ensure it's unique
      if (data.slug) {
        data.slug = await this.ensureUniqueSlug(column.tableId, data.slug, columnId, scopedTx);
      }

      return this.columnsRepo.update(columnId, data, scopedTx);
    });
  }
  /**
   * Delete column (also deletes all associated values)
   */
  async deleteColumn(columnId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      const column = await this.verifyColumnOwnership(columnId, tenantId, scopedTx);
      // Guardrail: Check for references in workflows
      await this.checkColumnUsage(columnId, scopedTx);
      // Prevent deleting the only primary key column
      if (column.isPrimaryKey) {
        const allColumns = await this.columnsRepo.findByTableId(column.tableId, scopedTx);
        const primaryKeyColumns = allColumns.filter(c => c.isPrimaryKey);
        if (primaryKeyColumns.length === 1) {
          throw new Error(
            'Cannot delete the primary key column. Tables must have at least one primary key column. ' +
            'Please designate another column as the primary key before deleting this one.'
          );
        }
      }
      // Delete all values for this column first (though CASCADE should handle it)
      await this.rowsRepo.deleteValuesByColumnId(columnId, scopedTx);
      // Delete the column. Its datavault_number_sequences counter row (if any)
      // is removed automatically via ON DELETE CASCADE on column_id.
      await this.columnsRepo.delete(columnId, scopedTx);
    });
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
    await this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyTableOwnership(tableId, tenantId, scopedTx);
      // Verify all columns belong to the table
      const columns = await this.columnsRepo.findByTableId(tableId, scopedTx);
      const tableColumnIds = new Set(columns.map((c) => c.id));
      for (const columnId of columnIds) {
        if (!tableColumnIds.has(columnId)) {
          throw new Error(`Column ${columnId} does not belong to table ${tableId}`);
        }
      }
      await this.columnsRepo.reorderColumns(tableId, columnIds, scopedTx);
    });
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyTableOwnership(tableId, tenantId, scopedTx);
      return this.columnsRepo.findByTableAndSlug(tableId, slug, scopedTx);
    });
  }
  /**
   * Check if column is used in any workflows (blocks or transforms)
   * This is a guardrail to prevent breaking changes
   */
  private async checkColumnUsage(columnId: string, tx?: DbTransaction): Promise<void> {
    const database = tx ?? db;
    // Check blocks config for column ID reference (naive JSON string search for UUID)
    // This catches usage in "Create Record", "Update Record", etc.
    const matchingBlocks = await database
      .select({ id: blocks.id, type: blocks.type, workflowId: blocks.workflowId })
      .from(blocks)
      // eslint-disable-next-line sonarjs/no-nested-template-literals
      .where(sql`${blocks.config}::text LIKE ${`%${columnId}%`}`)
      .limit(1);
    if (matchingBlocks.length > 0) {
      throw new Error(
        `Cannot delete column: It is referenced by a ${matchingBlocks[0].type} block in workflow ${matchingBlocks[0].workflowId}`
      );
    }
    // Check transform blocks code or config
    const matchingTransforms = await database
      .select({ id: transformBlocks.id, name: transformBlocks.name, workflowId: transformBlocks.workflowId })
      .from(transformBlocks)
      .where(
        or(
          // eslint-disable-next-line sonarjs/no-nested-template-literals
          sql`${transformBlocks.code} LIKE ${`%${columnId}%`}`,
          // eslint-disable-next-line sonarjs/no-nested-template-literals
          sql`${transformBlocks.inputKeys}::text LIKE ${`%${columnId}%`}`
        )
      )
      .limit(1);
    if (matchingTransforms.length > 0) {
      throw new Error(
        `Cannot delete column: It is referenced by transform block "${matchingTransforms[0].name}" in workflow ${matchingTransforms[0].workflowId}`
      );
    }
  }
}
// Singleton instance
export const datavaultColumnsService = new DatavaultColumnsService();
