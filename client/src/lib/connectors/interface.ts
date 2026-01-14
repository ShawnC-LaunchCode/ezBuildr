/**
 * Data Source Connector Interface
 * Common abstraction for all data sources (native tables, Google Sheets, future connectors)
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unreachable';

export interface DataSourceHealth {
    status: HealthStatus;
    lastChecked: string; // ISO timestamp
    message: string; // Human-readable message
    details?: {
        authExpired?: boolean;
        rateLimited?: boolean;
        permissionDenied?: boolean;
    };
}

export interface ColumnMetadata {
    uuid: string;
    displayName: string;
    dataType?: 'string' | 'number' | 'date' | 'boolean' | 'json';
}

export interface TableMetadata {
    id: string;
    name: string;
    columns: ColumnMetadata[];
}

export interface ReadOptions {
    filters?: Array<{
        column: string; // UUID
        operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
        value: any;
    }>;
    sort?: Array<{
        column: string; // UUID
        direction: 'asc' | 'desc';
    }>;
    limit?: number;
}

export interface WriteOptions {
    upsertStrategy: 'primary_key' | 'match_column' | 'append_only';
    primaryKeyColumn?: string; // UUID
    matchColumn?: string; // UUID
}

export interface WriteResult {
    rowsUpdated: number;
    rowsInserted: number;
    rowsFailed: number;
    errors: Array<{
        row: number;
        error: string;
        severity: 'warning' | 'error';
    }>;
}

/**
 * Base interface that all data source connectors must implement
 */
export interface DataSourceConnector {
    /**
     * Check health status of this data source
     */
    healthCheck(): Promise<DataSourceHealth>;

    /**
     * List all tables/sheets available in this data source
     */
    listTables(): Promise<TableMetadata[]>;

    /**
     * Get detailed column metadata for a specific table
     */
    getTableMetadata(tableId: string): Promise<TableMetadata>;

    /**
     * Read rows from a table
     * Returns rows as objects keyed by column UUID
     */
    readRows(tableId: string, options?: ReadOptions): Promise<Record<string, any>[]>;

    /**
     * Write rows to a table
     * Rows should be keyed by column UUID
     */
    writeRows(
        tableId: string,
        rows: Record<string, any>[],
        options?: WriteOptions
    ): Promise<WriteResult>;
}

/**
 * Google Sheets specific connector implementation
 */
export class GoogleSheetsConnector implements DataSourceConnector {
    constructor(
        private spreadsheetId: string,
        private accessToken: string
    ) { }

    async healthCheck(): Promise<DataSourceHealth> {
        try {
            // Try to fetch spreadsheet metadata
            const response = await fetch(
                `/api/google-sheets/${this.spreadsheetId}/health`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                    },
                    credentials: 'include',
                }
            );

            if (response.status === 401) {
                return {
                    status: 'degraded',
                    lastChecked: new Date().toISOString(),
                    message: 'Authentication refresh needed',
                    details: { authExpired: true },
                };
            }

            if (response.status === 403) {
                return {
                    status: 'unreachable',
                    lastChecked: new Date().toISOString(),
                    message: 'Permission denied - check sharing settings',
                    details: { permissionDenied: true },
                };
            }

            if (response.status === 429) {
                return {
                    status: 'degraded',
                    lastChecked: new Date().toISOString(),
                    message: 'Rate limit reached - will retry soon',
                    details: { rateLimited: true },
                };
            }

            if (!response.ok) {
                return {
                    status: 'unreachable',
                    lastChecked: new Date().toISOString(),
                    message: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            return {
                status: 'healthy',
                lastChecked: new Date().toISOString(),
                message: 'Connected successfully',
            };
        } catch (error) {
            return {
                status: 'unreachable',
                lastChecked: new Date().toISOString(),
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async listTables(): Promise<TableMetadata[]> {
        const response = await fetch(
            `/api/google-sheets/${this.spreadsheetId}/sheets`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                credentials: 'include',
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to list sheets: ${response.statusText}`);
        }

        const data = await response.json();
        return data.sheets || [];
    }

    async getTableMetadata(sheetId: string): Promise<TableMetadata> {
        const response = await fetch(
            `/api/google-sheets/${this.spreadsheetId}/sheets/${sheetId}/metadata`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                credentials: 'include',
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to get sheet metadata: ${response.statusText}`);
        }

        return response.json();
    }

    async readRows(sheetId: string, options?: ReadOptions): Promise<Record<string, any>[]> {
        const params = new URLSearchParams();
        if (options?.limit) {params.set('limit', options.limit.toString());}
        if (options?.filters) {params.set('filters', JSON.stringify(options.filters));}
        if (options?.sort) {params.set('sort', JSON.stringify(options.sort));}

        const response = await fetch(
            `/api/google-sheets/${this.spreadsheetId}/sheets/${sheetId}/rows?${params}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                credentials: 'include',
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to read rows: ${response.statusText}`);
        }

        const data = await response.json();
        return data.rows || [];
    }

    async writeRows(
        sheetId: string,
        rows: Record<string, any>[],
        options?: WriteOptions
    ): Promise<WriteResult> {
        const response = await fetch(
            `/api/google-sheets/${this.spreadsheetId}/sheets/${sheetId}/rows`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    rows,
                    options,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to write rows: ${response.statusText}`);
        }

        return response.json();
    }
}

/**
 * Native table connector (for PostgreSQL/DataVault tables)
 */
export class NativeTableConnector implements DataSourceConnector {
    constructor(private dataSourceId: string) { }

    async healthCheck(): Promise<DataSourceHealth> {
        try {
            const response = await fetch(`/api/data-sources/${this.dataSourceId}/health`, {
                credentials: 'include',
            });

            if (!response.ok) {
                return {
                    status: 'unreachable',
                    lastChecked: new Date().toISOString(),
                    message: `Database unavailable: ${response.statusText}`,
                };
            }

            return {
                status: 'healthy',
                lastChecked: new Date().toISOString(),
                message: 'Database connection active',
            };
        } catch (error) {
            return {
                status: 'unreachable',
                lastChecked: new Date().toISOString(),
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async listTables(): Promise<TableMetadata[]> {
        const response = await fetch(`/api/data-sources/${this.dataSourceId}/tables`, {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`Failed to list tables: ${response.statusText}`);
        }

        return response.json();
    }

    async getTableMetadata(tableId: string): Promise<TableMetadata> {
        const response = await fetch(`/api/tables/${tableId}/metadata`, {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`Failed to get table metadata: ${response.statusText}`);
        }

        return response.json();
    }

    async readRows(tableId: string, options?: ReadOptions): Promise<Record<string, any>[]> {
        const response = await fetch(`/api/tables/${tableId}/rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(options || {}),
        });

        if (!response.ok) {
            throw new Error(`Failed to read rows: ${response.statusText}`);
        }

        const data = await response.json();
        return data.rows || [];
    }

    async writeRows(
        tableId: string,
        rows: Record<string, any>[],
        options?: WriteOptions
    ): Promise<WriteResult> {
        const response = await fetch(`/api/tables/${tableId}/rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                rows,
                options,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to write rows: ${response.statusText}`);
        }

        return response.json();
    }
}
