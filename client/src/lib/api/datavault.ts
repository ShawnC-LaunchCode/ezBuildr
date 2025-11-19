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

// ============================================================================
// Database Operations
// ============================================================================

export async function getDatabases(params?: {
  scopeType?: DatavaultScopeType;
  scopeId?: string;
}): Promise<DatavaultDatabase[]> {
  const queryParams = new URLSearchParams();
  if (params?.scopeType) queryParams.set('scopeType', params.scopeType);
  if (params?.scopeId) queryParams.set('scopeId', params.scopeId);

  const url = `${API_BASE}/databases${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch databases: ${response.statusText}`);
  }

  return response.json();
}

export async function getDatabaseById(id: string): Promise<DatavaultDatabase & { tableCount: number }> {
  const response = await fetch(`${API_BASE}/databases/${id}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch database: ${response.statusText}`);
  }

  return response.json();
}

export async function createDatabase(input: CreateDatabaseInput): Promise<DatavaultDatabase> {
  const response = await fetch(`${API_BASE}/databases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to create database');
  }

  return response.json();
}

export async function updateDatabase(id: string, input: UpdateDatabaseInput): Promise<DatavaultDatabase> {
  const response = await fetch(`${API_BASE}/databases/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to update database');
  }

  return response.json();
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

  return response.json();
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

  return response.json();
}

export async function getTableById(id: string): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables/${id}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch table: ${response.statusText}`);
  }

  return response.json();
}

export async function createTable(input: CreateTableInput): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to create table');
  }

  return response.json();
}

export async function updateTable(id: string, input: UpdateTableInput): Promise<DatavaultTable> {
  const response = await fetch(`${API_BASE}/tables/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to update table');
  }

  return response.json();
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
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to move table');
  }

  return response.json();
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

  return response.json();
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

  return response.json();
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
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to create column');
  }

  return response.json();
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
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to update column');
  }

  return response.json();
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
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ columnIds }),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder columns: ${response.statusText}`);
  }

  return response.json();
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
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const url = `${API_BASE}/tables/${tableId}/rows${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch rows: ${response.statusText}`);
  }

  return response.json();
}

export async function createRow(
  tableId: string,
  data: Record<string, any>
): Promise<DatavaultRow> {
  const response = await fetch(`${API_BASE}/tables/${tableId}/rows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to create row');
  }

  return response.json();
}

export async function updateRow(
  rowId: string,
  data: Record<string, any>
): Promise<DatavaultRow> {
  const response = await fetch(`${API_BASE}/rows/${rowId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to update row');
  }

  return response.json();
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
