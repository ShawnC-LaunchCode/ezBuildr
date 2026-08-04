
import type { DatavaultRow, DatavaultColumn, DatavaultRowFilter } from "@shared/schema";

/** Typed union of all possible coerced cell values stored in DataVault */
type CoercedValue = string | number | boolean | string[] | object | null;

const isAutoNumberType = (type: DatavaultColumn['type']): boolean =>
  type === 'auto_number' || type === 'autonumber';

/**
 * String-ish column types where a blank (or whitespace-only) input has no
 * meaningful distinction from "no value" — see DVH-1. Deliberately excludes
 * 'json' (where '""' may be a meaningful stored value) and
 * 'select'/'multiselect' (validated against a fixed option list).
 */
const BLANK_COERCIBLE_TYPES = new Set<DatavaultColumn['type']>(['text', 'email', 'phone', 'url']);

const isBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === '';

import { db } from "../db";
import { ConflictError } from "../errors/AppError";
import { assertValueSizeWithinLimit } from "../utils/valueSizeLimit";
import {
  datavaultRowsRepository,
  datavaultTablesRepository,
  datavaultColumnsRepository,
  type DbTransaction,
} from "../repositories";

type RowValidationOptions = {
  mode: 'create' | 'update';
  excludeRowId?: string;
  tx?: DbTransaction;
};

function extractErrorDetails(error: unknown): { code?: string; constraint?: string; detail: string; message: string } {
  const pgCause = (typeof error === 'object' && error !== null && 'cause' in error)
    ? (error as { cause: unknown }).cause
    : undefined;
  const target = (typeof pgCause === 'object' && pgCause !== null ? pgCause : error) as Record<string, unknown> | null;
  if (!target || typeof target !== 'object') {
    return { detail: '', message: '' };
  }
  return {
    code: typeof target.code === 'string' ? target.code : undefined,
    constraint: typeof target.constraint === 'string' ? target.constraint : undefined,
    detail: typeof target.detail === 'string' ? target.detail : '',
    message: typeof target.message === 'string' ? target.message : '',
  };
}

function resolveColumnName(
  columnId: string | undefined,
  columns?: DatavaultColumn[] | Map<string, DatavaultColumn>
): string | undefined {
  if (!columns) { return undefined; }
  const colList = columns instanceof Map ? Array.from(columns.values()) : columns;
  if (columnId) {
    const matched = colList.find(c => c.id === columnId);
    if (matched) { return matched.name; }
  }
  const fallback = colList.find(c => c.isUnique || c.isPrimaryKey);
  return fallback?.name;
}

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
    this.rowsRepo = rowsRepo ?? datavaultRowsRepository;
    this.tablesRepo = tablesRepo ?? datavaultTablesRepository;
    this.columnsRepo = columnsRepo ?? datavaultColumnsRepository;
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
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity
  private validateAndCoerceValue(value: unknown, column: DatavaultColumn): CoercedValue {
    // DVH-1: a blank or whitespace-only string on a string-ish column has
    // exactly one representation — null — same as an omitted value. This
    // must happen BEFORE the required check and size check below, or a
    // blank string bypasses both (stored as "", which false-satisfies
    // `required` and false-conflicts with other blanks on unique columns).
    const normalized = BLANK_COERCIBLE_TYPES.has(column.type) && isBlankString(value)
      ? null
      : value;

    if (normalized !== null && normalized !== undefined) {
      assertValueSizeWithinLimit(normalized, `Column '${column.name}' value`);
    }

    if (normalized === null || normalized === undefined) {
      if (column.required && !isAutoNumberType(column.type)) {
        throw new Error(`Column '${column.name}' is required`);
      }
      return null;
    }

    switch (column.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return String(normalized);

      case 'number':
        // eslint-disable-next-line no-case-declarations
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
        // eslint-disable-next-line no-case-declarations
        const date = new Date(String(value));
        if (isNaN(date.getTime())) {
          throw new Error(`Column '${column.name}' must be a valid date`);
        }
        return date.toISOString();

      case 'json':
        if (typeof value === 'object') {return value;}
        try {
          return JSON.parse(String(value)) as CoercedValue;
        } catch {
          throw new Error(`Column '${column.name}' must be valid JSON`);
        }

      case 'reference':
        // Reference values must be valid UUIDs
        // eslint-disable-next-line no-case-declarations
        const stringValue = String(value);
        // eslint-disable-next-line no-case-declarations
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(stringValue)) {
          throw new Error(`Column '${column.name}' must be a valid UUID reference`);
        }
        return stringValue;

      case 'select':
        // Select values must be one of the defined options
        // eslint-disable-next-line no-case-declarations
        const selectValue = String(value);
        // eslint-disable-next-line no-case-declarations
        const selectOptions = column.options as Array<{ value: string; label: string; color?: string }> | null;
        if (!selectOptions || selectOptions.length === 0) {
          throw new Error(`Column '${column.name}' has no defined options`);
        }
        // eslint-disable-next-line no-case-declarations
        const validSelectValues = new Set(selectOptions.map(opt => opt.value));
        if (!validSelectValues.has(selectValue)) {
          throw new Error(
            `Column '${column.name}' value must be one of: ${Array.from(validSelectValues).join(', ')}`
          );
        }
        return selectValue;

      case 'multiselect':
        // Multiselect values must be an array of valid option values
        // eslint-disable-next-line no-case-declarations
        let multiselectValues: string[];
        if (Array.isArray(value)) {
          multiselectValues = value.map(v => String(v));
        } else {
          throw new Error(`Column '${column.name}' must be an array`);
        }
        // eslint-disable-next-line no-case-declarations
        const multiselectOptions = column.options as Array<{ value: string; label: string; color?: string }> | null;
        if (!multiselectOptions || multiselectOptions.length === 0) {
          throw new Error(`Column '${column.name}' has no defined options`);
        }
        // eslint-disable-next-line no-case-declarations
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
        return value as CoercedValue;
    }
  }

  /**
   * Validate row data against column definitions
   */

  private async assertUniqueValues(
    tableId: string,
    validatedValues: Array<{ columnId: string; value: CoercedValue }>,
    columnMap: Map<string, DatavaultColumn>,
    excludeRowId?: string,
    tx?: DbTransaction
  ): Promise<void> {
    const uniqueValues = validatedValues.filter(({ columnId, value }) => {
      const column = columnMap.get(columnId);
      return value !== null && (column?.isUnique === true || column?.isPrimaryKey === true);
    });
    if (uniqueValues.length === 0) { return; }

    const conflicts = await this.rowsRepo.findUniqueValueConflicts(
      tableId,
      uniqueValues,
      excludeRowId,
      tx
    );
    if (conflicts.length === 0) { return; }

    const conflictingColumn = columnMap.get(conflicts[0].columnId);
    throw new ConflictError(
      `A row with this column '${conflictingColumn?.name ?? conflicts[0].columnId}' already exists`
    );
  }

  private handleUniqueConstraintError(
    error: unknown,
    columns?: DatavaultColumn[] | Map<string, DatavaultColumn>
  ): never {
    const { constraint, detail, message } = extractErrorDetails(error);

    const isDatavaultUniqueConstraint =
      constraint === 'datavault_unique_keys_column_value_unique' ||
      message.includes('datavault_unique_keys_column_value_unique') ||
      /Key \((?:column_id,\s*value_hash|value_hash,\s*column_id)\)=/i.test(detail);

    if (isDatavaultUniqueConstraint) {
      const match = detail.match(/Key \(column_id,\s*value_hash\)=\(["']?([a-f0-9-]+)/i);
      const matchedColId = match?.[1];
      const columnName = resolveColumnName(matchedColId, columns);

      throw new ConflictError(
        `A row with this column '${columnName ?? 'unique'}' already exists`
      );
    }

    throw error;
  }

  private async prepareCreateValues(
    tableId: string,
    values: Record<string, unknown>,
    columns: DatavaultColumn[],
    tx?: DbTransaction
  ): Promise<Record<string, unknown>> {
    const createValues = { ...values };

    for (const column of columns) {
      if (column.required && !isAutoNumberType(column.type) && !(column.id in createValues)) {
        throw new Error(`Required column '${column.name}' is missing`);
      }
    }

    const table = await this.tablesRepo.findById(tableId, tx);
    if (!table) {
      throw new Error('Table not found');
    }

    for (const column of columns) {
      if (isAutoNumberType(column.type) && !(column.id in createValues)) {
        const startValue = column.autoNumberStart ?? 1;
        createValues[column.id] = await this.rowsRepo.getNextAutoNumber(
          table.tenantId,
          tableId,
          column.id,
          {
            startValue,
            prefix: column.autonumberPrefix,
            padding: column.autonumberPadding ?? 4,
          },
          tx
        );
      }
    }

    return createValues;
  }

  private async validateRowData(
    tableId: string,
    values: Record<string, unknown>,
    options: RowValidationOptions
  ): Promise<Array<{ columnId: string; value: CoercedValue }>> {
    const { mode, excludeRowId, tx } = options;
    const columns = await this.columnsRepo.findByTableId(tableId, tx);
    const columnMap = new Map(columns.map((c) => [c.id, c]));
    const validatedValues: Array<{ columnId: string; value: CoercedValue }> = [];
    const valuesToValidate = mode === 'create'
      ? await this.prepareCreateValues(tableId, values, columns, tx)
      : { ...values };

    // Validate and coerce each value
    for (const [columnId, value] of Object.entries(valuesToValidate)) {
      const column = columnMap.get(columnId);
      if (!column) {
        throw new Error(`Column ${columnId} not found in table`);
      }

      const coercedValue = this.validateAndCoerceValue(value, column);

      // Additional validation for reference columns
      if (column.type === 'reference' && coercedValue !== null && column.referenceTableId) {
        // Verify the referenced row exists in the referenced table
        // @ts-expect-error - TODO: fix type
        const referencedRow = await this.rowsRepo.findById(coercedValue, tx);
        if (!referencedRow) {
          throw new Error(
            `Column '${column.name}' references a non-existent row: ${String(coercedValue)}`
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

    await this.assertUniqueValues(tableId, validatedValues, columnMap, excludeRowId, tx);

    return validatedValues;
  }

  /**
   * Create a new row with values
   * Wrapped in transaction to ensure atomicity
   */

  async createRow(
    tableId: string,
    tenantId: string,
    values: Record<string, unknown>,
    createdBy?: string,
    tx?: DbTransaction
  ): Promise<{ row: DatavaultRow; values: Record<string, unknown> }> {
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
    values: Record<string, unknown>,
    createdBy: string | undefined,
    tx: DbTransaction
  ): Promise<{ row: DatavaultRow; values: Record<string, unknown> }> {
    await this.verifyTableOwnership(tableId, tenantId, tx);

    // Validate and coerce values
    const validatedValues = await this.validateRowData(tableId, values, {
      mode: 'create',
      tx,
    });

    const columns = await this.columnsRepo.findByTableId(tableId, tx);

    // Create row with values
    try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- values are dynamically typed
      const valuesRecord: Record<string, any> = {};
      for (const valueObj of result.values) {
        valuesRecord[valueObj.columnId] = valueObj.value;
      }

      return {
        row: result.row,
        values: valuesRecord,
      };
    } catch (error) {
      this.handleUniqueConstraintError(error, columns);
    }
  }

  /**
   * Get row by ID with tenant verification
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row values are dynamically typed
  async getRow(rowId: string, tenantId: string, tx?: DbTransaction): Promise<{ row: DatavaultRow; values: Record<string, any> } | null> {
    const _row = await this.verifyRowOwnership(rowId, tenantId, tx);
    const result = await this.rowsRepo.getRowWithValues(rowId, tx);

    if (!result) {return null;}

    // Transform values array into Record<columnId, value>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- values are dynamically typed
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async listRows(
    tableId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      columnIds?: string[];
    },
    tx?: DbTransaction
  ) {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return this.rowsRepo.getRowsWithValues(tableId, options, tx);
  }

  /**
   * Count rows for a table
   */
  async countRows(
    tableId: string,
    tenantId: string,
    options: boolean | { showArchived?: boolean } = false,
    tx?: DbTransaction
  ): Promise<number> {
    const showArchived = typeof options === 'boolean' ? options : Boolean(options.showArchived);
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return this.rowsRepo.countByTableId(tableId, showArchived, tx);
  }

  /**
   * Update row values
   * Wrapped in transaction to ensure atomicity
   */

  async updateRow(
    rowId: string,
    tenantId: string,
    values: Record<string, unknown>,
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
    values: Record<string, unknown>,
    updatedBy: string | undefined,
    tx: DbTransaction
  ): Promise<void> {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);

    // Validate and coerce values (only for provided columns)
    const validatedValues = await this.validateRowData(row.tableId, values, {
      mode: 'update',
      excludeRowId: rowId,
      tx,
    });

    const columns = await this.columnsRepo.findByTableId(row.tableId, tx);

    // Update row values
    try {
      await this.rowsRepo.updateRowValues(rowId, validatedValues, updatedBy, tx);
    } catch (error) {
      this.handleUniqueConstraintError(error, columns);
    }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data structure varies by table schema
  ): Promise<Map<string, { displayValue: string; row: any }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row data structure varies by table schema
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
    requests.forEach(({ tableId: _tableId, rowIds, displayColumnSlug }) => {
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
    if (tx) {
      return this._archiveRowImpl(rowId, tenantId, tx);
    }
    return db.transaction(async (newTx: DbTransaction) => {
      return this._archiveRowImpl(rowId, tenantId, newTx);
    });
  }

  private async _archiveRowImpl(
    rowId: string,
    tenantId: string,
    tx: DbTransaction
  ): Promise<void> {
    await this.verifyRowOwnership(rowId, tenantId, tx);
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
    if (tx) {
      return this._unarchiveRowImpl(rowId, tenantId, tx);
    }
    return db.transaction(async (newTx: DbTransaction) => {
      return this._unarchiveRowImpl(rowId, tenantId, newTx);
    });
  }

  private async _unarchiveRowImpl(
    rowId: string,
    tenantId: string,
    tx: DbTransaction
  ): Promise<void> {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);
    const columns = await this.columnsRepo.findByTableId(row.tableId, tx);
    try {
      await this.rowsRepo.unarchiveRow(rowId, tx);
    } catch (error) {
      this.handleUniqueConstraintError(error, columns);
    }
  }

  /**
   * Bulk archive rows
   */
  async bulkArchiveRows(
    tenantId: string,
    rowIds: string[],
    tx?: DbTransaction
  ): Promise<void> {
    if (rowIds.length === 0) { return; }
    if (tx) {
      return this._bulkArchiveRowsImpl(rowIds, tenantId, tx);
    }
    return db.transaction(async (newTx: DbTransaction) => {
      return this._bulkArchiveRowsImpl(rowIds, tenantId, newTx);
    });
  }

  private async _bulkArchiveRowsImpl(
    rowIds: string[],
    tenantId: string,
    tx: DbTransaction
  ): Promise<void> {
    await this.rowsRepo.batchVerifyOwnership(rowIds, tenantId, tx);
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
    if (rowIds.length === 0) { return; }
    if (tx) {
      return this._bulkUnarchiveRowsImpl(rowIds, tenantId, tx);
    }
    return db.transaction(async (newTx: DbTransaction) => {
      return this._bulkUnarchiveRowsImpl(rowIds, tenantId, newTx);
    });
  }

  private async _bulkUnarchiveRowsImpl(
    rowIds: string[],
    tenantId: string,
    tx: DbTransaction
  ): Promise<void> {
    const rowMap = await this.rowsRepo.batchVerifyOwnership(rowIds, tenantId, tx);
    const tableId = rowMap.values().next().value;
    const columns = tableId ? await this.columnsRepo.findByTableId(tableId, tx) : [];
    try {
      await this.rowsRepo.bulkUnarchiveRows(rowIds, tx);
    } catch (error) {
      this.handleUniqueConstraintError(error, columns);
    }
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
      filters?: DatavaultRowFilter[];
      columnIds?: string[];
    } = {},
    tx?: DbTransaction

  ): Promise<{
    rows: Array<{ row: DatavaultRow; values: Record<string, unknown> }>;
    total: number;
  }> {
    // Verify table ownership
    await this.verifyTableOwnership(tableId, tenantId, tx);

    // Get rows
    const rows = await this.rowsRepo.getRowsWithValues(tableId, options, tx);

    // Get total count
    const total = await this.rowsRepo.countByTableIdWithFilter(
      tableId,
      {
        showArchived: options.showArchived ?? false,
        filters: options.filters,
      },
      tx
    );

    return { rows, total };
  }
}

// Singleton instance
export const datavaultRowsService = new DatavaultRowsService();
