import {
  datavaultRowsRepository,
  datavaultTablesRepository,
  datavaultColumnsRepository,
  type DbTransaction,
} from "../repositories";
import type { DatavaultRow, InsertDatavaultRow, DatavaultColumn } from "@shared/schema";

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
      if (column.required && column.type !== 'auto_number') {
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
        // Auto-number values should be numbers (generated automatically)
        return Number(value);

      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') return true;
          if (lower === 'false' || lower === '0' || lower === 'no') return false;
        }
        return Boolean(value);

      case 'date':
      case 'datetime':
        if (value instanceof Date) return value.toISOString();
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error(`Column '${column.name}' must be a valid date`);
        }
        return date.toISOString();

      case 'json':
        if (typeof value === 'object') return value;
        try {
          return JSON.parse(String(value));
        } catch {
          throw new Error(`Column '${column.name}' must be valid JSON`);
        }

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
      if (column.required && column.type !== 'auto_number' && !(column.id in values)) {
        throw new Error(`Required column '${column.name}' is missing`);
      }
    }

    // Generate auto-number values for auto_number columns
    for (const column of columns) {
      if (column.type === 'auto_number' && !(column.id in values)) {
        // Get the next auto-number value
        const nextNumber = await this.rowsRepo.getNextAutoNumber(tableId, column.id, tx);
        const startValue = column.autoNumberStart ?? 1;
        values[column.id] = startValue + nextNumber;
      }
    }

    // Validate and coerce each value
    for (const [columnId, value] of Object.entries(values)) {
      const column = columnMap.get(columnId);
      if (!column) {
        throw new Error(`Column ${columnId} not found in table`);
      }

      const coercedValue = this.validateAndCoerceValue(value, column);
      validatedValues.push({ columnId, value: coercedValue });
    }

    return validatedValues;
  }

  /**
   * Create a new row with values
   */
  async createRow(
    tableId: string,
    tenantId: string,
    values: Record<string, any>,
    createdBy?: string,
    tx?: DbTransaction
  ): Promise<{ row: DatavaultRow; values: any }> {
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

    return result;
  }

  /**
   * Get row by ID with tenant verification
   */
  async getRow(rowId: string, tenantId: string, tx?: DbTransaction) {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);
    return await this.rowsRepo.getRowWithValues(rowId, tx);
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
    return await this.rowsRepo.getRowsWithValues(tableId, options, tx);
  }

  /**
   * Count rows for a table
   */
  async countRows(tableId: string, tenantId: string, tx?: DbTransaction): Promise<number> {
    await this.verifyTableOwnership(tableId, tenantId, tx);
    return await this.rowsRepo.countByTableId(tableId, tx);
  }

  /**
   * Update row values
   */
  async updateRow(
    rowId: string,
    tenantId: string,
    values: Record<string, any>,
    updatedBy?: string,
    tx?: DbTransaction
  ): Promise<void> {
    const row = await this.verifyRowOwnership(rowId, tenantId, tx);

    // Validate and coerce values (only for provided columns)
    const validatedValues = await this.validateRowData(row.tableId, values, tx);

    // Update row values
    await this.rowsRepo.updateRowValues(rowId, validatedValues, updatedBy, tx);
  }

  /**
   * Delete row
   */
  async deleteRow(rowId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyRowOwnership(rowId, tenantId, tx);
    await this.rowsRepo.deleteRow(rowId, tx);
  }

  /**
   * Bulk delete rows
   */
  async bulkDeleteRows(
    rowIds: string[],
    tenantId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify all rows belong to the tenant
    for (const rowId of rowIds) {
      await this.verifyRowOwnership(rowId, tenantId, tx);
    }

    // Delete all rows
    for (const rowId of rowIds) {
      await this.rowsRepo.deleteRow(rowId, tx);
    }
  }
}

// Singleton instance
export const datavaultRowsService = new DatavaultRowsService();
