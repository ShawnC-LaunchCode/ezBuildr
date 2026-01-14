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
  apiTokens: (databaseId: string) => ["datavault", "databases", databaseId, "tokens"] as const,
  tablePermissions: (tableId: string) => ["datavault", "tables", tableId, "permissions"] as const,
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
      if (!id) {throw new Error('Database ID is required');}
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
      if (!databaseId) {throw new Error('Database ID is required');}
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

export function useTransferDatavaultDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetOwnerType, targetOwnerUuid }: {
      id: string;
      targetOwnerType: 'user' | 'org';
      targetOwnerUuid: string;
    }) => datavaultAPI.transferDatabase(id, targetOwnerType, targetOwnerUuid),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.database(result.id) });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
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
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: datavaultQueryKeys.table(tableId!),
    queryFn: () => datavaultAPI.getTable(tableId!, withColumns),
    enabled: isUuid,
  });
}

export function useDatavaultTableSchema(tableId: string | undefined) {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: [...datavaultQueryKeys.table(tableId!), 'schema'],
    queryFn: () => datavaultAPI.getTableSchema(tableId!),
    enabled: isUuid,
  });
}

export function useCreateDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.createTable,
    onSuccess: (createdTable) => {
      // Invalidate general tables list
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });

      // Invalidate databases list (to update table counts)
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // If table was created in a database, invalidate that database's tables and details
      if (createdTable.databaseId) {
        queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.databaseTables(createdTable.databaseId)
        });
        queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.database(createdTable.databaseId)
        });
      }
    },
  });
}

export function useUpdateDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...data }: { tableId: string } & Parameters<typeof datavaultAPI.updateTable>[1]) =>
      datavaultAPI.updateTable(tableId, data),
    onSuccess: (updatedTable, variables) => {
      // Invalidate general tables list and specific table
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(variables.tableId) });

      // Invalidate databases list (to update table counts if database changed)
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // If table is in a database, invalidate that database's tables and details
      if (updatedTable.databaseId) {
        queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.databaseTables(updatedTable.databaseId)
        });
        queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.database(updatedTable.databaseId)
        });
      }
    },
  });
}

export function useDeleteDatavaultTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.deleteTable,
    onSuccess: () => {
      // Invalidate general tables list
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });

      // Invalidate databases list (to update table counts)
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // Invalidate all database-specific queries (we don't know which database the table was in)
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'datavault' &&
          query.queryKey[1] === 'databases' &&
          query.queryKey.length > 2
      });
    },
  });
}

// ============================================================================
// Columns
// ============================================================================

export function useDatavaultColumns(tableId: string | undefined) {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: datavaultQueryKeys.tableColumns(tableId!),
    queryFn: () => datavaultAPI.listColumns(tableId!),
    enabled: isUuid,
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
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: [...datavaultQueryKeys.tableRows(tableId!), options],
    queryFn: () => datavaultAPI.listRows(tableId!, options),
    enabled: isUuid,
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

// ============================================================================
// API Tokens (v4 Micro-Phase 5)
// ============================================================================

/**
 * Hook to fetch API tokens for a database
 */
export function useDatavaultApiTokens(databaseId: string | undefined) {
  return useQuery({
    queryKey: databaseId
      ? datavaultQueryKeys.apiTokens(databaseId)
      : ['datavault', 'databases', 'null', 'tokens'],
    queryFn: () => {
      if (!databaseId) {throw new Error('Database ID is required');}
      return datavaultAPI.listApiTokens(databaseId);
    },
    enabled: !!databaseId,
  });
}

/**
 * Hook to create a new API token
 * Returns the plain token ONCE in the response
 */
export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      databaseId,
      data,
    }: {
      databaseId: string;
      data: { label: string; scopes: ('read' | 'write')[]; expiresAt?: string };
    }) => datavaultAPI.createApiToken(databaseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.apiTokens(variables.databaseId) });
    },
  });
}

/**
 * Hook to revoke (delete) an API token
 */
export function useDeleteApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tokenId, databaseId }: { tokenId: string; databaseId: string }) =>
      datavaultAPI.deleteApiToken(tokenId, databaseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.apiTokens(variables.databaseId) });
    },
  });
}

// ============================================================================
// Table Permissions (v4 Micro-Phase 6)
// ============================================================================

/**
 * Hook to fetch permissions for a table (owner only)
 */
export function useTablePermissions(tableId: string | undefined) {
  return useQuery({
    queryKey: tableId
      ? datavaultQueryKeys.tablePermissions(tableId)
      : ['datavault', 'tables', 'null', 'permissions'],
    queryFn: () => {
      if (!tableId) {throw new Error('Table ID is required');}
      return datavaultAPI.listTablePermissions(tableId);
    },
    enabled: !!tableId,
  });
}

/**
 * Hook to grant or update a table permission (owner only)
 */
export function useGrantTablePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tableId,
      data,
    }: {
      tableId: string;
      data: { userId: string; role: 'owner' | 'write' | 'read' };
    }) => datavaultAPI.grantTablePermission(tableId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tablePermissions(variables.tableId) });
    },
  });
}

/**
 * Hook to revoke a table permission (owner only)
 */
export function useRevokeTablePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ permissionId, tableId }: { permissionId: string; tableId: string }) =>
      datavaultAPI.revokeTablePermission(permissionId, tableId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tablePermissions(variables.tableId) });
    },
  });
}
