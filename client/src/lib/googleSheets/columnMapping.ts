/**
 * Google Sheets Connector - Column UUID Mapping
 * Ensures column identity stability across header renames
 */

export interface SheetColumn {
    uuid: string;           // Stable internal UUID
    displayName: string;    // Current header text
    letterCode: string;     // Sheet column (A, B, C, etc.)
    dataType?: 'string' | 'number' | 'date' | 'boolean';
    externallyRenamed?: boolean;  // Flag if header changed
}

export interface SheetMetadata {
    spreadsheetId: string;
    sheetId: string;
    sheetName: string;
    columns: SheetColumn[];
    lastSynced: string;     // ISO timestamp
}

export interface SheetWriteOptions {
    upsertStrategy: 'primary_key' | 'match_column';
    primaryKeyColumn?: string;  // UUID of PK column
    matchColumn?: string;       // UUID of match column
    matchValue?: any;           // Value to match against
}

export interface SheetWriteResult {
    rowsUpdated: number;
    rowsInserted: number;
    errors: SheetWriteError[];
}

export interface SheetWriteError {
    row: number;
    error: string;
    severity: 'warning' | 'error';
}

/**
 * Column UUID Manager
 * Handles mapping between stable UUIDs and sheet columns
 */
export class ColumnUUIDManager {
    /**
     * Generate initial column mapping from sheet header row
     */
    static generateColumnMapping(headerRow: string[], sheetId: string): SheetColumn[] {
        return headerRow.map((header, index) => ({
            uuid: crypto.randomUUID(),
            displayName: header,
            letterCode: this.indexToLetterCode(index),
        }));
    }

    /**
     * Detect renamed columns by comparing header rows
     */
    static detectRenames(
        storedColumns: SheetColumn[],
        currentHeaderRow: string[]
    ): SheetColumn[] {
        const updated = [...storedColumns];

        currentHeaderRow.forEach((currentHeader, index) => {
            const column = updated.find(col => col.letterCode === this.indexToLetterCode(index));

            if (column && column.displayName !== currentHeader) {
                // Header was renamed
                column.displayName = currentHeader;
                column.externallyRenamed = true;
            }
        });

        return updated;
    }

    /**
     * Convert 0-based index to Excel-style letter code (A, B, ..., Z, AA, AB, ...)
     */
    static indexToLetterCode(index: number): string {
        let code = '';
        let num = index;

        while (num >= 0) {
            code = String.fromCharCode(65 + (num % 26)) + code;
            num = Math.floor(num / 26) - 1;
        }

        return code;
    }

    /**
     * Get column letter code by UUID
     */
    static getLetterCodeByUUID(columns: SheetColumn[], uuid: string): string | null {
        const column = columns.find(col => col.uuid === uuid);
        return column?.letterCode ?? null;
    }

    /**
     * Get column UUID by display name
     */
    static getUUIDByDisplayName(columns: SheetColumn[], displayName: string): string | null {
        const column = columns.find(col => col.displayName === displayName);
        return column?.uuid ?? null;
    }
}
