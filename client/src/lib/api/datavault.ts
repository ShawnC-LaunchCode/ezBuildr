import type {
  DatavaultDatabase,
  DatavaultTable,
  DatavaultColumn,
  DatavaultRow,
  TableSchema,
  CreateDatabaseInput,
  UpdateDatabaseInput,
  MoveTableInput,
  CreateTableInput,
  UpdateTableInput,
  DatavaultScopeType,
} from '../types/datavault';

const API_BASE = '/api/datavault';

/** Shape of error responses from the API */
interface ApiErrorResponse {
  message?: string;
}

/**
 * Build a URL with optional query string from URLSearchParams.
 * Avoids nested template literals and invalid URLSearchParams template expressions.
 */
function buildUrl(base: string, queryParams: URLSearchParams): string {
  const qs = queryParams.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Parse a failed response body into an ApiErrorResponse, falling back to statusText.
 */
async function parseErrorBody(response: Response): Promise<ApiErrorResponse> {
  return response.json().catch(() => ({ message: response.statusText })) as Promise<ApiErrorResponse>;
}

// ============================================================================
// Database Operations
// ============================================================================

export async function getDatabases(params?: {
  scopeType?: DatavaultScopeType;
  scopeId?: string;
}): Promise<DatavaultDatabase[]> {
  const queryParams = new URLSearchParams();
  if (params?.scopeType) {
    queryParams.set('scopeType', params.scopeType);
  }
  if (params?.scopeId) {
    queryParams.set('scopeId', params.scopeId);
  }

  const url = buildUrl(`${API_BASE}/databases`, queryParams);
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch databases: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultDatabase[]>;
}

export async function getDatabaseById(id: string): Promise<DatavaultDatabase & { tableCount: number }> {
  const response = await fetch(`${API_BASE}/databases/${id}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch database: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultDatabase & { tableCount: number }>;
}

export async function createDatabase(input: CreateDatabaseInput): Promise<DatavaultDatabase> {
  const response = await fetch(`${API_BASE}/databases`, {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to create database');
  }

  return response.json() as Promise<DatavaultDatabase>;
}

export async function updateDatabase(id: string, input: UpdateDatabaseInput): Promise<DatavaultDatabase> {
  const response = await fetch(`${API_BASE}/databases/${id}`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to update database');
  }

  return response.json() as Promise<DatavaultDatabase>;
}

export async function deleteDatabase(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/databases/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete database: ${response.statusText}`);
  }
}

export async function getTablesInDatabase(databaseId: string): Promise<DatavaultTable[]> {
  const response = await fetch(`${API_BASE}/databases/${databaseId}/tables`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultTable[]>;
}

// ============================================================================
// Table Operations
// ============================================================================

export async function getTables(): Promise<DatavaultTable[]> {
  const response = await fetch(`${API_BASE}/tables`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultTable[]>;
}

export async function getTableById(id: string): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables/${id}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch table: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultTable>;
}

export async function createTable(input: CreateTableInput): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables`, {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to create table');
  }

  return response.json() as Promise<DatavaultTable>;
}

export async function updateTable(id: string, input: UpdateTableInput): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables/${id}`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to update table');
  }

  return response.json() as Promise<DatavaultTable>;
}

export async function deleteTable(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/tables/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete table: ${response.statusText}`);
  }
}

export async function moveTable(tableId: string, input: MoveTableInput): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/move`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to move table');
  }

  return response.json() as Promise<DatavaultTable>;
}

// ============================================================================
// Table Schema Operations
// ============================================================================

export async function getTableSchema(tableId: string): Promise<TableSchema> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/schema`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch table schema: ${response.statusText}`);
  }

  return response.json() as Promise<TableSchema>;
}

// ============================================================================
// Column Operations
// ============================================================================

export async function getTableColumns(tableId: string): Promise<DatavaultColumn[]> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/columns`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch columns: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultColumn[]>;
}

export async function createColumn(
  tableId: string,
  input: {
    name: string;
    type: string;
    required?: boolean;
    isPrimaryKey?: boolean;
    isUnique?: boolean;
    autoNumberStart?: number;
  }
): Promise<DatavaultColumn> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/columns`, {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to create column');
  }

  return response.json() as Promise<DatavaultColumn>;
}

export async function updateColumn(
  columnId: string,
  input: {
    name?: string;
    type?: string;
    required?: boolean;
    isPrimaryKey?: boolean;
    isUnique?: boolean;
  }
): Promise<DatavaultColumn> {
  const response = await fetch(`${API_BASE}/columns/${columnId}`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to update column');
  }

  return response.json() as Promise<DatavaultColumn>;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/columns/${columnId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete column: ${response.statusText}`);
  }
}

export async function reorderColumns(
  tableId: string,
  columnIds: string[]
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/columns/reorder`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ columnIds }),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder columns: ${response.statusText}`);
  }

  return response.json() as Promise<{ success: boolean }>;
}

// ============================================================================
// Row Operations
// ============================================================================

export async function getTableRows(
  tableId: string,
  params?: {
    limit?: number;
    offset?: number;
  }
): Promise<{ rows: DatavaultRow[]; total: number; hasMore: boolean }> {
  const queryParams = new URLSearchParams();
  if (params?.limit !== undefined && params.limit !== null) {
    queryParams.set('limit', params.limit.toString());
  }
  if (params?.offset !== undefined && params.offset !== null) {
    queryParams.set('offset', params.offset.toString());
  }

  const url = buildUrl(`${API_BASE}/tables/${tableId}/rows`, queryParams);
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch rows: ${response.statusText}`);
  }

  return response.json() as Promise<{ rows: DatavaultRow[]; total: number; hasMore: boolean }>;
}

export async function getRowById(tableId: string, rowId: string): Promise<DatavaultRow> {
  const response = await fetch(`${API_BASE}/rows/${rowId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch row: ${response.statusText}`);
  }

  return response.json() as Promise<DatavaultRow>;
}

export async function createRow(
  tableId: string,
  data: Record<string, unknown>
): Promise<DatavaultRow> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/rows`, {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to create row');
  }

  return response.json() as Promise<DatavaultRow>;
}

export async function updateRow(
  rowId: string,
  data: Record<string, unknown>
): Promise<DatavaultRow> {
  const response = await fetch(`${API_BASE}/rows/${rowId}`, {
    method: 'PATCH',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to update row');
  }

  return response.json() as Promise<DatavaultRow>;
}

export async function deleteRow(rowId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/rows/${rowId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete row: ${response.statusText}`);
  }
}

// ============================================================================
// Batch Reference Resolution (Fixes N+1 Query Problem)
// ============================================================================

export async function batchResolveReferences(
  requests: Array<{
    tableId: string;
    rowIds: string[];
    displayColumnSlug?: string;
  }>
): Promise<Record<string, { displayValue: string; row: unknown }>> {
  const response = await fetch(`${API_BASE}/references/batch`, {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new Error(error.message ?? 'Failed to batch resolve references');
  }

  return response.json() as Promise<Record<string, { displayValue: string; row: unknown }>>;
}
