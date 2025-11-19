/**
 * DataVault API client
 * API functions for DataVault Phase 1 & Phase 2 (Databases)
 */

import { apiRequest } from "./queryClient";
import type { DatavaultTable, DatavaultColumn, DatavaultRow } from "@shared/schema";

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

export const datavaultAPI = {
  // ============================================================================
  // Databases (Phase 2)
  // ============================================================================

  listDatabases: async (params?: {
    scopeType?: 'account' | 'project' | 'workflow';
    scopeId?: string;
  }): Promise<DatavaultDatabase[]> => {
    const queryParams = new URLSearchParams();
    if (params?.scopeType) queryParams.set('scopeType', params.scopeType);
    if (params?.scopeId) queryParams.set('scopeId', params.scopeId);

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
    data: Partial<{ name: string; slug: string; required: boolean; orderIndex: number }>
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
    options?: { limit?: number; offset?: number }
  ): Promise<{
    rows: ApiDatavaultRowWithValues[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
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
};
