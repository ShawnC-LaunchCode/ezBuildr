/**
 * DataVault API client
 * API functions for DataVault Phase 1 & Phase 2 (Databases)
 */

import type { DatavaultTable, DatavaultColumn, DatavaultRow, DatavaultRowNote, DatavaultApiToken, DatavaultTablePermission, DatavaultTableRole } from "@shared/schema";

import { apiRequest } from "./queryClient";

export interface ApiDatavaultTableWithStats extends DatavaultTable {
  columnCount: number;
  rowCount: number;
}

export interface ApiDatavaultRowWithValues {
  row: DatavaultRow;
  values: Record<string, any>; // columnId -> value
}

export interface DatavaultDatabase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  scopeType: 'account' | 'project' | 'workflow';
  scopeId: string | null;
  createdAt: string;
  updatedAt: string;
  tableCount?: number;
}

export interface ApiDatavaultApiToken extends Omit<DatavaultApiToken, 'tokenHash'> {
  // API never returns tokenHash for security
}

export interface ApiCreateTokenResponse {
  token: ApiDatavaultApiToken;
  plainToken: string;
  message: string;
}

export const datavaultAPI = {
  // ============================================================================
  // Databases (Phase 2)
  // ============================================================================

  listDatabases: async (params?: {
    scopeType?: 'account' | 'project' | 'workflow';
    scopeId?: string;
  }): Promise<DatavaultDatabase[]> => {
    const queryParams = new URLSearchParams();
    if (params?.scopeType) {queryParams.set('scopeType', params.scopeType);}
    if (params?.scopeId) {queryParams.set('scopeId', params.scopeId);}

    const url = `/api/datavault/databases${queryParams.toString() ? `?${queryParams}` : ''}`;
    const res = await apiRequest('GET', url);
    return res.json();
  },

  getDatabase: async (id: string): Promise<DatavaultDatabase> => {
    const res = await apiRequest('GET', `/api/datavault/databases/${id}`);
    return res.json();
  },

  createDatabase: async (data: {
    name: string;
    description?: string;
    scopeType: 'account' | 'project' | 'workflow';
    scopeId?: string;
  }): Promise<DatavaultDatabase> => {
    const res = await apiRequest('POST', '/api/datavault/databases', data);
    return res.json();
  },

  updateDatabase: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      scopeType?: 'account' | 'project' | 'workflow';
      scopeId?: string | null;
    }
  ): Promise<DatavaultDatabase> => {
    const res = await apiRequest('PATCH', `/api/datavault/databases/${id}`, data);
    return res.json();
  },

  deleteDatabase: async (id: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/databases/${id}`);
    if (res.status !== 204) {
      await res.json();
    }
  },

  transferDatabase: async (
    id: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<DatavaultDatabase> => {
    const res = await apiRequest('POST', `/api/datavault/databases/${id}/transfer`, {
      targetOwnerType,
      targetOwnerUuid,
    });
    return res.json();
  },

  getTablesInDatabase: async (databaseId: string): Promise<DatavaultTable[]> => {
    const res = await apiRequest('GET', `/api/datavault/databases/${databaseId}/tables`);
    return res.json();
  },

  // ============================================================================
  // Tables (Phase 1)
  // ============================================================================
  // Tables
  listTables: async (withStats = false): Promise<ApiDatavaultTableWithStats[]> => {
    const res = await apiRequest('GET', `/api/datavault/tables?stats=${withStats}`);
    return res.json();
  },

  getTable: async (tableId: string, withColumns = false): Promise<DatavaultTable> => {
    const res = await apiRequest('GET', `/api/datavault/tables/${tableId}?columns=${withColumns}`);
    return res.json();
  },

  createTable: async (data: {
    name: string;
    slug?: string;
    description?: string;
    databaseId?: string;
  }): Promise<DatavaultTable> => {
    const res = await apiRequest('POST', '/api/datavault/tables', data);
    return res.json();
  },

  updateTable: async (
    tableId: string,
    data: Partial<{ name: string; slug: string; description: string }>
  ): Promise<DatavaultTable> => {
    const res = await apiRequest('PATCH', `/api/datavault/tables/${tableId}`, data);
    return res.json();
  },

  deleteTable: async (tableId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/tables/${tableId}`);
    if (res.status !== 204) {
      await res.json();
    }
  },

  moveTable: async (tableId: string, databaseId: string | null): Promise<DatavaultTable> => {
    const res = await apiRequest('PATCH', `/api/datavault/tables/${tableId}/move`, { databaseId });
    return res.json();
  },

  getTableSchema: async (tableId: string) => {
    const res = await apiRequest('GET', `/api/datavault/tables/${tableId}/schema`);
    return res.json();
  },

  // Columns
  listColumns: async (tableId: string): Promise<DatavaultColumn[]> => {
    const res = await apiRequest('GET', `/api/datavault/tables/${tableId}/columns`);
    return res.json();
  },

  createColumn: async (
    tableId: string,
    data: {
      name: string;
      type: string;
      slug?: string;
      required?: boolean;
      orderIndex?: number;
    }
  ): Promise<DatavaultColumn> => {
    const res = await apiRequest('POST', `/api/datavault/tables/${tableId}/columns`, data);
    return res.json();
  },

  updateColumn: async (
    columnId: string,
    data: Partial<{ name: string; slug: string; required: boolean; orderIndex: number; widthPx: number }>
  ): Promise<DatavaultColumn> => {
    const res = await apiRequest('PATCH', `/api/datavault/columns/${columnId}`, data);
    return res.json();
  },

  deleteColumn: async (columnId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/columns/${columnId}`);
    if (res.status !== 204) {
      await res.json();
    }
  },

  reorderColumns: async (tableId: string, columnIds: string[]): Promise<void> => {
    const res = await apiRequest('POST', `/api/datavault/tables/${tableId}/columns/reorder`, { columnIds });
    if (res.status !== 204) {
      await res.json();
    }
  },

  // Rows
  listRows: async (
    tableId: string,
    options?: {
      limit?: number;
      offset?: number;
      showArchived?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      filters?: Array<{ columnId: string; operator: string; value: any }>;
    }
  ): Promise<{
    rows: ApiDatavaultRowWithValues[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) {params.append('limit', options.limit.toString());}
    if (options?.offset !== undefined) {params.append('offset', options.offset.toString());}
    if (options?.showArchived) {params.append('showArchived', 'true');}
    if (options?.sortBy) {params.append('sortBy', options.sortBy);}
    if (options?.sortOrder) {params.append('sortOrder', options.sortOrder);}
    if (options?.filters && options.filters.length > 0) {
      params.append('filters', JSON.stringify(options.filters));
    }
    const res = await apiRequest('GET', `/api/datavault/tables/${tableId}/rows?${params.toString()}`);
    return res.json();
  },

  getRow: async (rowId: string): Promise<ApiDatavaultRowWithValues> => {
    const res = await apiRequest('GET', `/api/datavault/rows/${rowId}`);
    return res.json();
  },

  createRow: async (
    tableId: string,
    values: Record<string, any>
  ): Promise<ApiDatavaultRowWithValues> => {
    const res = await apiRequest('POST', `/api/datavault/tables/${tableId}/rows`, { values });
    return res.json();
  },

  updateRow: async (rowId: string, values: Record<string, any>): Promise<void> => {
    const res = await apiRequest('PATCH', `/api/datavault/rows/${rowId}`, { values });
    if (res.status !== 204) {
      await res.json();
    }
  },

  deleteRow: async (rowId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/rows/${rowId}`);
    if (res.status !== 204) {
      await res.json();
    }
  },

  // Archive operations
  archiveRow: async (rowId: string): Promise<void> => {
    const res = await apiRequest('PATCH', `/api/datavault/rows/${rowId}/archive`);
    if (res.status !== 200) {
      await res.json();
    }
  },

  unarchiveRow: async (rowId: string): Promise<void> => {
    const res = await apiRequest('PATCH', `/api/datavault/rows/${rowId}/unarchive`);
    if (res.status !== 200) {
      await res.json();
    }
  },

  bulkArchiveRows: async (rowIds: string[]): Promise<void> => {
    const res = await apiRequest('PATCH', '/api/datavault/rows/bulk/archive', { rowIds });
    if (res.status !== 200) {
      await res.json();
    }
  },

  bulkUnarchiveRows: async (rowIds: string[]): Promise<void> => {
    const res = await apiRequest('PATCH', '/api/datavault/rows/bulk/unarchive', { rowIds });
    if (res.status !== 200) {
      await res.json();
    }
  },

  bulkDeleteRows: async (rowIds: string[]): Promise<void> => {
    const res = await apiRequest('DELETE', '/api/datavault/rows/bulk/delete', { rowIds });
    if (res.status !== 200) {
      await res.json();
    }
  },

  // ============================================================================
  // Row Notes (v4 Micro-Phase 3)
  // ============================================================================

  /**
   * Get all notes for a row
   * Returns notes ordered by creation time (newest first)
   */
  getRowNotes: async (rowId: string): Promise<DatavaultRowNote[]> => {
    const res = await apiRequest('GET', `/api/datavault/rows/${rowId}/notes`);
    return res.json();
  },

  /**
   * Create a new note for a row
   */
  createRowNote: async (rowId: string, text: string): Promise<DatavaultRowNote> => {
    const res = await apiRequest('POST', `/api/datavault/rows/${rowId}/notes`, { text });
    return res.json();
  },

  /**
   * Delete a note
   * Only the note owner or table owner can delete
   */
  deleteRowNote: async (noteId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/notes/${noteId}`);
    if (res.status !== 200) {
      await res.json();
    }
  },

  // ============================================================================
  // API Tokens (v4 Micro-Phase 5)
  // ============================================================================

  /**
   * List all API tokens for a database
   * Returns tokens without hash for security
   */
  listApiTokens: async (databaseId: string): Promise<{ tokens: ApiDatavaultApiToken[] }> => {
    const res = await apiRequest('GET', `/api/datavault/databases/${databaseId}/tokens`);
    return res.json();
  },

  /**
   * Create a new API token
   * Returns the plain token ONCE (never stored or returned again)
   */
  createApiToken: async (
    databaseId: string,
    data: {
      label: string;
      scopes: ('read' | 'write')[];
      expiresAt?: string;
    }
  ): Promise<ApiCreateTokenResponse> => {
    const res = await apiRequest('POST', `/api/datavault/databases/${databaseId}/tokens`, data);
    return res.json();
  },

  /**
   * Revoke (delete) an API token
   */
  deleteApiToken: async (tokenId: string, databaseId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/tokens/${tokenId}`, { databaseId });
    if (res.status !== 200) {
      await res.json();
    }
  },

  // ============================================================================
  // Table Permissions (v4 Micro-Phase 6)
  // ============================================================================

  /**
   * Get all permissions for a table (owner only)
   */
  listTablePermissions: async (tableId: string): Promise<DatavaultTablePermission[]> => {
    const res = await apiRequest('GET', `/api/datavault/tables/${tableId}/permissions`);
    return res.json();
  },

  /**
   * Grant or update permission for a user on a table (owner only)
   * Upserts the permission (creates or updates)
   */
  grantTablePermission: async (
    tableId: string,
    data: {
      userId: string;
      role: DatavaultTableRole;
    }
  ): Promise<DatavaultTablePermission> => {
    const res = await apiRequest('POST', `/api/datavault/tables/${tableId}/permissions`, data);
    return res.json();
  },

  /**
   * Revoke a permission (owner only)
   */
  revokeTablePermission: async (permissionId: string, tableId: string): Promise<void> => {
    const res = await apiRequest('DELETE', `/api/datavault/permissions/${permissionId}?tableId=${tableId}`);
    if (res.status !== 200) {
      await res.json();
    }
  },
};
