import type { DatavaultRow, InsertDatavaultRow, DatavaultColumn } from "@shared/schema";

import { db } from "../db";
import {
  datavaultRowsRepository,
  datavaultTablesRepository,
  datavaultColumnsRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Service layer for DataVault row business logic
 * Handles row and value CRUD operations with validation and type coercion
 */
export class DatavaultRowsService {
  private rowsRepo: typeof datavaultRowsRepository;
  private tablesRepo: typeof datavaultTablesRepository;
  private columnsRepo: typeof datavaultColumnsRepository;

  constructor(
    rowsRepo?: typeof datavaultRowsRepository,
    tablesRepo?: typeof datavaultTablesRepository,
    columnsRepo?: typeof datavaultColumnsRepository
  ) {
    this.rowsRepo = rowsRepo || datavaultRowsRepository;
    this.tablesRepo = tablesRepo || datavaultTablesRepository;
    this.columnsRepo = columnsRepo || datavaultColumnsRepository;
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
   * Verify row belongs to tenant's table
   */
  async verifyRowOwnership(
    rowId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<DatavaultRow> {
    const row = await this.rowsRepo.findById(rowId, tx);

    if (!row) {
      throw new Error("Row not found");
    }

    // Verify the table belongs to the tenant
    await this.verifyTableOwnership(row.tableId, tenantId, tx);

    return row;
  }

  /**
   * Validate and coerce value based on column type
   */
  private validateAndCoerceValue(value: any, column: DatavaultColumn): any {
    if (value === null || value === undefined) {
      if (column.required && column.type !== 'auto_number' && column.type !== 'autonumber') {
        throw new Error(`Column '${column.name}' is required`);
      }
      return null;
    }

    switch (column.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return String(value);

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Column '${column.name}' must be a valid number`);
        }
        return num;

      case 'auto_number':
      case 'autonumber':
        // Auto-number values should be strings (for autonumber with prefix) or numbers (legacy auto_number)
        // The value is generated automatically, so we just validate it exists
        return typeof value === 'string' ? value : Number(value);

      case 'boolean':
        if (typeof value === 'boolean') {return value;}
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') {return true;}
          if (lower === 'false' || lower === '0' || lower === 'no') {return false;}
        }
        return Boolean(value);

      case 'date':
      case 'datetime':
        if (value instanceof Date) {return value.toISOString();}
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error(`Column '${column.name}' must be a valid date`);
        }
        return date.toISOString();

      case 'json':
        if (typeof value === 'object') {return value;}
        try {
          return JSON.parse(String(value));
        } catch {
          throw new Error(`Column '${column.name}' must be valid JSON`);
        }

      case 'reference':
        // Reference values must be valid UUIDs
        const stringValue = String(value);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(stringValue)) {
          throw new Error(`Column '${column.name}' must be a valid UUID reference`);
        }
        return stringValue;

      case 'select':
        // Select values must be one of the defined options
        const selectValue = String(value);
        const selectOptions = column.options as Array<{ value: string; label: string; color?: string }> | null;
        if (!selectOptions || selectOptions.length === 0) {
          throw new Error(`Column '${column.name}' has no defined options`);
        }
        const validSelectValues = new Set(selectOptions.map(opt => opt.value));
        if (!validSelectValues.has(selectValue)) {
          throw new Error(
            `Column '${column.name}' value must be one of: ${Array.from(validSelectValues).join(', ')}`
          );
        }
        return selectValue;

      case 'multiselect':
        // Multiselect values must be an array of valid option values
        let multiselectValues: string[];
        if (Array.isArray(value)) {
          multiselectValues = value.map(v => String(v));
        } else {
          throw new Error(`Column '${column.name}' must be an array`);
        }
        const multiselectOptions = column.options as Array<{ value: string; label: string; color?: string }> | null;
        if (!multiselectOptions || multiselectOptions.length === 0) {
          throw new Error(`Column '${column.name}' has no defined options`);
        }
        const validMultiselectValues = new Set(multiselectOptions.map(opt => opt.value));
        for (const val of multiselectValues) {
          if (!validMultiselectValues.has(val)) {
            throw new Error(
              `Column '${column.name}' contains invalid value '${val}'. Valid values: ${Array.from(validMultiselectValues).join(', ')}`
            );
          }
        }
        return multiselectValues;

      default:
        return value;
    }
  }

  /**
   * Validate row data against column definitions
   */
  private async validateRowData(
    tableId: string,
    values: Record<string, any>,
    tx?: DbTransaction
  ): Promise<Array<{ columnId: string; value: any }>> {
    const columns = await this.columnsRepo.findByTableId(tableId, tx);
    const columnMap = new Map(columns.map((c) => [c.id, c]));
    const validatedValues: Array<{ columnId: string; value: any }> = [];

    // Check required columns (excluding auto_number columns)
    for (const column of columns) {
      if (column.required && column.type !== 'auto_number' && column.type !== 'autonumber' && !(column.id in values)) {
        throw new Error(`Required column '${column.name}' is missing`);
      }
    }

    // Generate auto-number values for auto_number and autonumber columns
    // Get tenant ID for autonumber sequence
    const table = await this.tablesRepo.findById(tableId, tx);
    if (!table) {
      throw new Error('Table not found');
    }
    const tenantId = table.tenantId;

    try {
      for (const column of columns) {
        // Handle legacy auto_number type
        if (column.type === 'auto_number' && !(column.id in values)) {
          const startValue = column.autoNumberStart ?? 1;
          const nextNumber = await this.rowsRepo.getNextAutoNumber(tableId, column.id, startValue, tx);
          values[column.id] = nextNumber;
        }

        // Handle new autonumber type with prefix, padding, and yearly reset
        if (column.type === 'autonumber' && !(column.id in values)) {
          const prefix = column.autonumberPrefix ?? null;
          const padding = column.autonumberPadding ?? 4;
          const resetPolicy = column.autonumberResetPolicy ?? 'never';
          const options = column.options as any;
          const format = options?.format ?? null;

          const nextValue = await this.rowsRepo.getNextAutonumber(
            tenantId,
            tableId,
            column.id,
            prefix,
            padding,
            resetPolicy,
            format,
            tx
          );
          values[column.id] = nextValue;
        }
      }
    } catch (error) {
      throw error;
    }

    // Validate and coerce each value
    for (const [columnId, value] of Object.entries(values)) {
      const column = columnMap.get(columnId);
      if (!column) {
        throw new Error(`Column ${columnId} not found in table`);
      }

      const coercedValue = this.validateAndCoerceValue(value, column);

      // Additional validation for reference columns
      if (column.type === 'reference' && coercedValue !== null && column.referenceTableId) {
        // Verify the referenced row exists in the referenced table
        const referencedRow = await this.rowsRepo.findById(coercedValue, tx);
        if (!referencedRow) {
          throw new Error(
            `Column '${column.name}' references a non-existent row: ${coercedValue}`
          );
        }
        // Verify the referenced row belongs to the correct table
        if (referencedRow.tableId !== column.referenceTableId) {
          throw new Error(
            `Column '${column.name}' references a row from the wrong table`
          );
        }
      }

      validatedValues.push({ columnId, value: coercedValue });
    }

    return validatedValues;
  }

  /**
   * Create a new row with values
   * Wrapped in transaction to ensure atomicity
   */
  async createRow(
    tableId: string,
    tenantId: string,
    values: Record<string, any>,
    createdBy?: string,
    tx?: DbTransaction
  ): Promise<{ row: DatavaultRow; values: Record<string, any> }> {
    // If transaction provided, use it; otherwise create a new one
    if (tx) {
      return this._createRowImpl(tableId, tenantId, values, createdBy, tx);
    }

    return db.transaction(async (newTx: DbTransaction) => {
      return this._createRowImpl(tableId, tenantId, values, createdBy, newTx);
    });
  }

  /**
   * Internal implementation of createRow
   * Must be called within a transaction
   */
  private async _createRowImpl(
    tableId: string,
    tenantId: string,
    values: Record<string, any>,
    createdBy: string | undefined,
    tx: DbTransaction
  ): Promise<{ row: DatavaultRow; values: Record<string, any> }> {
    await this.verifyTableOwnership(tableId, tenantId, tx);

    // Validate and coerce values
    const validatedValues = await this.validateRowData(tableId, values, tx);

    // Create row with values
    const result = await this.rowsRepo.createRowWithValues(
      {
        tableId,
        createdBy,
        updatedBy: createdBy,
      },
      validatedValues,
      tx
    );

    // Transform values array into Record<columnId, value>
    const valuesRecord: Record<string, any> = {};
    for (const valueObj of result.values) {
      valuesRecord[valueObj.columnId] = valueObj.value;
    }

    return {
      row: result.row,
      values: valuesRecord,
    };
  }

  /**
   * Get row by ID with tenant verification
   */
  async getRow(rowId: string, tenantId: string, tx?: DbTransaction): Promise<{ row: DatavaultRow; values: Record<string, any> } | null> {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);
    const result = await this.rowsRepo.getRowWithValues(rowId, tx);

    if (!result) {return null;}

    // Transform values array into Record<columnId, value>
    const valuesRecord: Record<string, any> = {};
    for (const valueObj of result.values) {
      valuesRecord[valueObj.columnId] = valueObj.value;
    }

    return {
      row: result.row,
      values: valuesRecord,
    };
  }

  /**
   * List rows for a table with pagination
   */
  async listRows(
    tableId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
    tx?: DbTransaction
  ) {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return this.rowsRepo.getRowsWithValues(tableId, options, tx);
  }

  /**
   * Count rows for a table
   */
  async countRows(tableId: string, tenantId: string, tx?: DbTransaction): Promise<number> {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return this.rowsRepo.countByTableId(tableId, tx);
  }

  /**
   * Update row values
   * Wrapped in transaction to ensure atomicity
   */
  async updateRow(
    rowId: string,
    tenantId: string,
    values: Record<string, any>,
    updatedBy?: string,
    tx?: DbTransaction
  ): Promise<void> {
    // If transaction provided, use it; otherwise create a new one
    if (tx) {
      return this._updateRowImpl(rowId, tenantId, values, updatedBy, tx);
    }

    return db.transaction(async (newTx: DbTransaction) => {
      return this._updateRowImpl(rowId, tenantId, values, updatedBy, newTx);
    });
  }

  /**
   * Internal implementation of updateRow
   * Must be called within a transaction
   */
  private async _updateRowImpl(
    rowId: string,
    tenantId: string,
    values: Record<string, any>,
    updatedBy: string | undefined,
    tx: DbTransaction
  ): Promise<void> {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);

    // Validate and coerce values (only for provided columns)
    const validatedValues = await this.validateRowData(row.tableId, values, tx);

    // Update row values
    await this.rowsRepo.updateRowValues(rowId, validatedValues, updatedBy, tx);
  }

  /**
   * Check if row is referenced by other rows
   * Returns list of tables/columns that reference this row
   */
  async getRowReferences(
    rowId: string,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Array<{ referencingTableId: string; referencingColumnId: string; referenceCount: number }>> {
    await this.verifyRowOwnership(rowId, tenantId, tx);
    return this.rowsRepo.getRowReferences(rowId, tx);
  }

  /**
   * Delete row
   * Note: References to this row will be automatically set to NULL by database trigger
   */
  async deleteRow(rowId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyRowOwnership(rowId, tenantId, tx);
    await this.rowsRepo.deleteRow(rowId, tx);
  }

  /**
   * Bulk delete rows
   * Uses batch operations for efficiency (2 queries instead of 2N)
   * Wrapped in transaction to ensure atomicity
   */
  async bulkDeleteRows(
    rowIds: string[],
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    if (rowIds.length === 0) {return;}

    // If transaction provided, use it; otherwise create a new one
    if (tx) {
      return this._bulkDeleteRowsImpl(rowIds, tenantId, tx);
    }

    return db.transaction(async (newTx: DbTransaction) => {
      return this._bulkDeleteRowsImpl(rowIds, tenantId, newTx);
    });
  }

  /**
   * Internal implementation of bulkDeleteRows
   * Must be called within a transaction
   */
  private async _bulkDeleteRowsImpl(
    rowIds: string[],
    tenantId: string,
    tx: DbTransaction
  ): Promise<void> {
    // Batch verify ownership (1 query instead of N)
    await this.rowsRepo.batchVerifyOwnership(rowIds, tenantId, tx);

    // Batch delete (1 query instead of N)
    await this.rowsRepo.batchDeleteRows(rowIds, tx);
  }

  /**
   * Batch resolve reference values
   * Efficiently fetches multiple referenced rows in a single query
   * Fixes N+1 query problem for reference columns
   *
   * @param requests Array of {tableId, rowIds[], displayColumnSlug} objects
   * @param tenantId Tenant ID for authorization
   * @returns Map of rowId -> {displayValue, row}
   */
  async batchResolveReferences(
    requests: Array<{
      tableId: string;
      rowIds: string[];
      displayColumnSlug?: string;
    }>,
    tenantId: string,
    tx?: DbTransaction
  ): Promise<Map<string, { displayValue: string; row: any }>> {
    const resultMap = new Map<string, { displayValue: string; row: any }>();

    if (requests.length === 0) {return resultMap;}

    // Verify all tables belong to tenant
    const uniqueTableIds = [...new Set(requests.map(r => r.tableId))];
    for (const tableId of uniqueTableIds) {
      await this.verifyTableOwnership(tableId, tenantId, tx);
    }

    // Batch fetch all rows
    const rowData = await this.rowsRepo.batchFindByIds(requests, tx);

    // Extract display values
    requests.forEach(({ tableId, rowIds, displayColumnSlug }) => {
      rowIds.forEach(rowId => {
        const data = rowData.get(rowId);
        if (!data) {
          // Row not found, create placeholder
          resultMap.set(rowId, {
            displayValue: 'Not found',
            row: null
          });
          return;
        }

        let displayValue: string;
        if (displayColumnSlug && data.values[displayColumnSlug] !== undefined) {
          displayValue = String(data.values[displayColumnSlug]);
        } else {
          // Fallback to row ID if no display column specified
          displayValue = `${rowId.substring(0, 8)  }...`;
        }

        resultMap.set(rowId, {
          displayValue,
          row: {
            ...data.row,
            values: data.values
          }
        });
      });
    });

    return resultMap;
  }

  /**
   * Archive (soft delete) a row
   */
  async archiveRow(
    tenantId: string,
    rowId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify ownership
    await this.verifyRowOwnership(rowId, tenantId, tx);

    // Archive the row
    await this.rowsRepo.archiveRow(rowId, tx);
  }

  /**
   * Unarchive (restore) a row
   */
  async unarchiveRow(
    tenantId: string,
    rowId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify ownership
    await this.verifyRowOwnership(rowId, tenantId, tx);

    // Unarchive the row
    await this.rowsRepo.unarchiveRow(rowId, tx);
  }

  /**
   * Bulk archive rows
   */
  async bulkArchiveRows(
    tenantId: string,
    rowIds: string[],
    tx?: DbTransaction
  ): Promise<void> {
    if (rowIds.length === 0) {return;}

    // Verify all rows belong to tenant
    await this.rowsRepo.batchVerifyOwnership(rowIds, tenantId, tx);

    // Bulk archive
    await this.rowsRepo.bulkArchiveRows(rowIds, tx);
  }

  /**
   * Bulk unarchive rows
   */
  async bulkUnarchiveRows(
    tenantId: string,
    rowIds: string[],
    tx?: DbTransaction
  ): Promise<void> {
    if (rowIds.length === 0) {return;}

    // Verify all rows belong to tenant
    await this.rowsRepo.batchVerifyOwnership(rowIds, tenantId, tx);

    // Bulk unarchive
    await this.rowsRepo.bulkUnarchiveRows(rowIds, tx);
  }

  /**
   * Get rows with filtering, sorting, and archiving support
   */
  async getRowsWithOptions(
    tenantId: string,
    tableId: string,
    options: {
      limit?: number;
      offset?: number;
      showArchived?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {},
    tx?: DbTransaction
  ): Promise<{
    rows: Array<{ row: DatavaultRow; values: Record<string, any> }>;
    total: number;
  }> {
    // Verify table ownership
    await this.verifyTableOwnership(tableId, tenantId, tx);

    // Get rows
    const rows = await this.rowsRepo.getRowsWithValues(tableId, options, tx);

    // Get total count
    const total = await this.rowsRepo.countByTableIdWithFilter(
      tableId,
      options.showArchived || false,
      tx
    );

    return { rows, total };
  }
}

// Singleton instance
export const datavaultRowsService = new DatavaultRowsService();
