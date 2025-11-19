/**
 * TanStack Query hooks for DataVault API
 * DataVault Phase 1 & Phase 2 (Databases) hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { datavaultAPI } from "./datavault-api";

// ============================================================================
// Query Keys
// ============================================================================

export const datavaultQueryKeys = {
  databases: ["datavault", "databases"] as const,
  database: (id: string) => ["datavault", "databases", id] as const,
  databaseTables: (databaseId: string) => ["datavault", "databases", databaseId, "tables"] as const,
  databasesByScope: (scopeType?: string, scopeId?: string) =>
    ["datavault", "databases", "scope", scopeType, scopeId] as const,
  tables: ["datavault", "tables"] as const,
  table: (id: string) => ["datavault", "tables", id] as const,
  tableColumns: (tableId: string) => ["datavault", "tables", tableId, "columns"] as const,
  tableRows: (tableId: string) => ["datavault", "tables", tableId, "rows"] as const,
  row: (id: string) => ["datavault", "rows", id] as const,
};

// ============================================================================
// Databases (Phase 2)
// ============================================================================

export function useDatavaultDatabases(params?: {
  scopeType?: 'account' | 'project' | 'workflow';
  scopeId?: string;
}) {
  return useQuery({
    queryKey: params?.scopeType
      ? datavaultQueryKeys.databasesByScope(params.scopeType, params.scopeId)
      : datavaultQueryKeys.databases,
    queryFn: () => datavaultAPI.listDatabases(params),
  });
}

export function useDatavaultDatabase(id: string | undefined) {
  return useQuery({
    queryKey: id ? datavaultQueryKeys.database(id) : ['datavault', 'databases', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Database ID is required');
      return datavaultAPI.getDatabase(id);
    },
    enabled: !!id,
  });
}

export function useDatabaseTables(databaseId: string | undefined) {
  return useQuery({
    queryKey: databaseId
      ? datavaultQueryKeys.databaseTables(databaseId)
      : ['datavault', 'databases', 'null', 'tables'],
    queryFn: () => {
      if (!databaseId) throw new Error('Database ID is required');
      return datavaultAPI.getTablesInDatabase(databaseId);
    },
    enabled: !!databaseId,
  });
}

export function useCreateDatavaultDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.createDatabase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

export function useUpdateDatavaultDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof datavaultAPI.updateDatabase>[1]) =>
      datavaultAPI.updateDatabase(id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.database(result.id) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

export function useDeleteDatavaultDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.deleteDatabase,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: datavaultQueryKeys.database(id) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useMoveDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, databaseId }: { tableId: string; databaseId: string | null }) =>
      datavaultAPI.moveTable(tableId, databaseId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(result.id) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

// ============================================================================
// Tables
// ============================================================================

export function useDatavaultTables(withStats = false) {
  return useQuery({
    queryKey: [...datavaultQueryKeys.tables, withStats],
    queryFn: () => datavaultAPI.listTables(withStats),
  });
}

export function useDatavaultTable(tableId: string | undefined, withColumns = false) {
  return useQuery({
    queryKey: datavaultQueryKeys.table(tableId!),
    queryFn: () => datavaultAPI.getTable(tableId!, withColumns),
    enabled: !!tableId,
  });
}

export function useDatavaultTableSchema(tableId: string | undefined) {
  return useQuery({
    queryKey: [...datavaultQueryKeys.table(tableId!), 'schema'],
    queryFn: () => datavaultAPI.getTableSchema(tableId!),
    enabled: !!tableId,
  });
}

export function useCreateDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.createTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useUpdateDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...data }: { tableId: string } & Parameters<typeof datavaultAPI.updateTable>[1]) =>
      datavaultAPI.updateTable(tableId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(variables.tableId) });
    },
  });
}

export function useDeleteDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.deleteTable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

// ============================================================================
// Columns
// ============================================================================

export function useDatavaultColumns(tableId: string | undefined) {
  return useQuery({
    queryKey: datavaultQueryKeys.tableColumns(tableId!),
    queryFn: () => datavaultAPI.listColumns(tableId!),
    enabled: !!tableId,
  });
}

export function useCreateDatavaultColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...data }: { tableId: string } & Parameters<typeof datavaultAPI.createColumn>[1]) =>
      datavaultAPI.createColumn(tableId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(variables.tableId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useUpdateDatavaultColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, tableId, ...data }: { columnId: string; tableId: string } & Parameters<typeof datavaultAPI.updateColumn>[1]) =>
      datavaultAPI.updateColumn(columnId, data),
    onSuccess: (_, variables) => {
      if (variables.tableId) {
        queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      }
    },
  });
}

export function useDeleteDatavaultColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, tableId }: { columnId: string; tableId: string }) =>
      datavaultAPI.deleteColumn(columnId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useReorderDatavaultColumns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, columnIds }: { tableId: string; columnIds: string[] }) =>
      datavaultAPI.reorderColumns(tableId, columnIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
    },
  });
}

// ============================================================================
// Rows
// ============================================================================

export function useDatavaultRows(tableId: string | undefined, options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: [...datavaultQueryKeys.tableRows(tableId!), options],
    queryFn: () => datavaultAPI.listRows(tableId!, options),
    enabled: !!tableId,
  });
}

export function useDatavaultRow(rowId: string | undefined) {
  return useQuery({
    queryKey: datavaultQueryKeys.row(rowId!),
    queryFn: () => datavaultAPI.getRow(rowId!),
    enabled: !!rowId,
  });
}

export function useCreateDatavaultRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, values }: { tableId: string; values: Record<string, any> }) =>
      datavaultAPI.createRow(tableId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useUpdateDatavaultRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, tableId, values }: { rowId: string; tableId: string; values: Record<string, any> }) =>
      datavaultAPI.updateRow(rowId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.row(variables.rowId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
    },
  });
}

export function useDeleteDatavaultRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, tableId }: { rowId: string; tableId: string }) =>
      datavaultAPI.deleteRow(rowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}
