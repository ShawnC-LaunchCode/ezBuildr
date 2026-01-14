/**
 * Google Sheets Write Connector
 * Implements upsert semantics with parity to native tables
 */

import { ColumnUUIDManager } from './columnMapping';

import type { SheetColumn, SheetWriteOptions, SheetWriteResult, SheetWriteError } from './columnMapping';

export interface WriteRowData {
    [columnUUID: string]: any;
}

/**
 * Normalize value for Google Sheets
 * Handles type coercion and common quirks
 */
function normalizeValue(value: any, targetType?: string): { value: any; warning?: string } {
    if (value === null || value === undefined) {
        return { value: '' };
    }

    // Handle dates
    if (value instanceof Date) {
        return { value: value.toISOString().split('T')[0] }; // YYYY-MM-DD format
    }

    // Handle numbers
    if (targetType === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
            return {
                value: value.toString(),
                warning: `Expected number but got "${value}" - storing as string`
            };
        }
        return { value: num };
    }

    // Handle booleans
    if (typeof value === 'boolean') {
        return { value: value ? 'TRUE' : 'FALSE' };
    }

    // Default to string
    return { value: value.toString() };
}

/**
 * Google Sheets Write Connector
 */
export class GoogleSheetsWriteConnector {
    /**
     * Execute upsert write to Google Sheets
     * 
     * @param spreadsheetId - Google Sheets spreadsheet ID
     * @param sheetName - Name of the sheet tab
     * @param columns - Column metadata with UUIDs
     * @param rows - Array of row data (keyed by column UUID)
     * @param options - Write options (upsert strategy)
     * @returns Write result with counts and errors
     */
    async upsertRows(
        spreadsheetId: string,
        sheetName: string,
        columns: SheetColumn[],
        rows: WriteRowData[],
        options: SheetWriteOptions
    ): Promise<SheetWriteResult> {
        const result: SheetWriteResult = {
            rowsUpdated: 0,
            rowsInserted: 0,
            errors: [],
        };

        try {
            // Step 1: Fetch existing data to determine update vs insert
            const existingRows = await this.fetchExistingRows(spreadsheetId, sheetName);

            // Step 2: Process each row
            for (let i = 0; i < rows.length; i++) {
                const rowData = rows[i];

                try {
                    // Determine if this is an update or insert
                    const matchingRowIndex = this.findMatchingRow(
                        existingRows,
                        rowData,
                        columns,
                        options
                    );

                    if (matchingRowIndex !== null) {
                        // Update existing row
                        await this.updateRow(
                            spreadsheetId,
                            sheetName,
                            matchingRowIndex,
                            rowData,
                            columns
                        );
                        result.rowsUpdated++;
                    } else {
                        // Insert new row
                        await this.insertRow(
                            spreadsheetId,
                            sheetName,
                            rowData,
                            columns
                        );
                        result.rowsInserted++;
                    }
                } catch (error) {
                    result.errors.push({
                        row: i,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        severity: 'error',
                    });
                }
            }

            return result;
        } catch (error) {
            // Catastrophic failure - return all as errors
            throw new Error(`Google Sheets write failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Fetch existing rows from sheet
     * TODO: Replace with actual Google Sheets API call
     */
    private async fetchExistingRows(
        spreadsheetId: string,
        sheetName: string
    ): Promise<any[][]> {
        // Backend API call would go here
        const response = await fetch(`/api/google-sheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows`, {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch existing rows: ${response.statusText}`);
        }

        const data = await response.json();
        return data.rows || [];
    }

    /**
     * Find matching row based on upsert strategy
     */
    private findMatchingRow(
        existingRows: any[][],
        newRowData: WriteRowData,
        columns: SheetColumn[],
        options: SheetWriteOptions
    ): number | null {
        if (options.upsertStrategy === 'primary_key' && options.primaryKeyColumn) {
            const pkValue = newRowData[options.primaryKeyColumn];
            const pkColumnLetterCode = ColumnUUIDManager.getLetterCodeByUUID(columns, options.primaryKeyColumn);

            if (!pkColumnLetterCode) {return null;}

            const pkIndex = this.letterCodeToIndex(pkColumnLetterCode);

            // Find row where PK column matches
            for (let i = 0; i < existingRows.length; i++) {
                if (existingRows[i][pkIndex] === pkValue) {
                    return i + 2; // +2 because row 1 is header, array is 0-indexed
                }
            }
        } else if (options.upsertStrategy === 'match_column' && options.matchColumn) {
            const matchValue = newRowData[options.matchColumn];
            const matchColumnLetterCode = ColumnUUIDManager.getLetterCodeByUUID(columns, options.matchColumn);

            if (!matchColumnLetterCode) {return null;}

            const matchIndex = this.letterCodeToIndex(matchColumnLetterCode);

            for (let i = 0; i < existingRows.length; i++) {
                if (existingRows[i][matchIndex] === matchValue) {
                    return i + 2;
                }
            }
        }

        return null; // No match found - will insert
    }

    /**
     * Update existing row
     * TODO: Replace with actual Google Sheets API call
     */
    private async updateRow(
        spreadsheetId: string,
        sheetName: string,
        rowIndex: number,
        rowData: WriteRowData,
        columns: SheetColumn[]
    ): Promise<void> {
        // Convert row data from UUID-keyed object to array in column order
        const rowArray = this.rowDataToArray(rowData, columns);

        // Backend API call
        await fetch(`/api/google-sheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows/${rowIndex}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ values: rowArray }),
        });
    }

    /**
     * Insert new row
     * TODO: Replace with actual Google Sheets API call
     */
    private async insertRow(
        spreadsheetId: string,
        sheetName: string,
        rowData: WriteRowData,
        columns: SheetColumn[]
    ): Promise<void> {
        const rowArray = this.rowDataToArray(rowData, columns);

        await fetch(`/api/google-sheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ values: rowArray }),
        });
    }

    /**
     * Convert UUID-keyed row data to array in column order
     */
    private rowDataToArray(rowData: WriteRowData, columns: SheetColumn[]): any[] {
        // Sort columns by letter code
        const sortedColumns = [...columns].sort((a, b) =>
            a.letterCode.localeCompare(b.letterCode)
        );

        return sortedColumns.map(column => {
            const value = rowData[column.uuid];
            const normalized = normalizeValue(value, column.dataType);
            return normalized.value;
        });
    }

    /**
     * Convert letter code to 0-based index
     */
    private letterCodeToIndex(letterCode: string): number {
        let index = 0;
        for (let i = 0; i < letterCode.length; i++) {
            index = index * 26 + (letterCode.charCodeAt(i) - 64);
        }
        return index - 1;
    }
}
