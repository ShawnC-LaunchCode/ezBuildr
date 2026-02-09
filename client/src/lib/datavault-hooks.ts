/**
 * TanStack Query hooks for DataVault API
 * DataVault Phase 1 & Phase 2 (Databases) hooks
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import type { DatavaultTable, DatavaultColumn, DatavaultTablePermission } from "@shared/schema";

import {
  datavaultAPI,
  type DatavaultDatabase,
  type ApiDatavaultTableWithStats,
  type ApiDatavaultRowWithValues,
  type ApiDatavaultApiToken,
  type ApiCreateTokenResponse,
} from "./datavault-api";

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
}): UseQueryResult<DatavaultDatabase[]> {
  return useQuery({
    queryKey: params?.scopeType
      ? datavaultQueryKeys.databasesByScope(params.scopeType, params.scopeId)
      : datavaultQueryKeys.databases,
    queryFn: () => datavaultAPI.listDatabases(params),
  });
}

export function useDatavaultDatabase(id: string | undefined): UseQueryResult<DatavaultDatabase> {
  return useQuery({
    queryKey: id ? datavaultQueryKeys.database(id) : ['datavault', 'databases', 'null'],
    queryFn: () => {
      if (!id) { throw new Error('Database ID is required'); }
      return datavaultAPI.getDatabase(id);
    },
    enabled: !!id,
  });
}

export function useDatabaseTables(databaseId: string | undefined): UseQueryResult<DatavaultTable[]> {
  return useQuery({
    queryKey: databaseId
      ? datavaultQueryKeys.databaseTables(databaseId)
      : ['datavault', 'databases', 'null', 'tables'],
    queryFn: () => {
      if (!databaseId) { throw new Error('Database ID is required'); }
      return datavaultAPI.getTablesInDatabase(databaseId);
    },
    enabled: !!databaseId,
  });
}

export function useCreateDatavaultDatabase(): UseMutationResult<DatavaultDatabase, unknown, Parameters<typeof datavaultAPI.createDatabase>[0]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.createDatabase,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

export function useUpdateDatavaultDatabase(): UseMutationResult<DatavaultDatabase, unknown, { id: string } & Parameters<typeof datavaultAPI.updateDatabase>[1]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof datavaultAPI.updateDatabase>[1]) =>
      datavaultAPI.updateDatabase(id, data),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.database(result.id) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

export function useDeleteDatavaultDatabase(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.deleteDatabase,
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: datavaultQueryKeys.database(id) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

interface TransferDatabaseParams {
  id: string;
  targetOwnerType: 'user' | 'org';
  targetOwnerUuid: string;
}

export function useTransferDatavaultDatabase(): UseMutationResult<DatavaultDatabase, unknown, TransferDatabaseParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetOwnerType, targetOwnerUuid }: TransferDatabaseParams) =>
      datavaultAPI.transferDatabase(id, targetOwnerType, targetOwnerUuid),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.database(result.id) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

interface MoveTableParams {
  tableId: string;
  databaseId: string | null;
}

export function useMoveDatavaultTable(): UseMutationResult<DatavaultTable, unknown, MoveTableParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, databaseId }: MoveTableParams) =>
      datavaultAPI.moveTable(tableId, databaseId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(result.id) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });
    },
  });
}

// ============================================================================
// Tables
// ============================================================================

export function useDatavaultTables(withStats = false): UseQueryResult<ApiDatavaultTableWithStats[]> {
  return useQuery({
    queryKey: [...datavaultQueryKeys.tables, withStats],
    queryFn: () => datavaultAPI.listTables(withStats),
  });
}

export function useDatavaultTable(tableId: string | undefined, withColumns = false): UseQueryResult<DatavaultTable> {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: datavaultQueryKeys.table(tableId!),
    queryFn: () => datavaultAPI.getTable(tableId!, withColumns),
    enabled: isUuid,
  });
}

export function useDatavaultTableSchema(tableId: string | undefined): UseQueryResult<Record<string, any>> {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: [...datavaultQueryKeys.table(tableId!), 'schema'],
    queryFn: () => datavaultAPI.getTableSchema(tableId!),
    enabled: isUuid,
  });
}

export function useCreateDatavaultTable(): UseMutationResult<DatavaultTable, unknown, Parameters<typeof datavaultAPI.createTable>[0]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.createTable,
    onSuccess: async (createdTable) => {
      // Invalidate general tables list
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });

      // Invalidate databases list (to update table counts)
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // If table was created in a database, invalidate that database's tables and details
      if (createdTable.databaseId) {
        await queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.databaseTables(createdTable.databaseId)
        });
        await queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.database(createdTable.databaseId)
        });
      }
    },
  });
}

export function useUpdateDatavaultTable(): UseMutationResult<DatavaultTable, unknown, { tableId: string } & Parameters<typeof datavaultAPI.updateTable>[1]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...data }: { tableId: string } & Parameters<typeof datavaultAPI.updateTable>[1]) =>
      datavaultAPI.updateTable(tableId, data),
    onSuccess: async (updatedTable, variables) => {
      // Invalidate general tables list and specific table
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(variables.tableId) });

      // Invalidate databases list (to update table counts if database changed)
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // If table is in a database, invalidate that database's tables and details
      if (updatedTable.databaseId) {
        await queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.databaseTables(updatedTable.databaseId)
        });
        await queryClient.invalidateQueries({
          queryKey: datavaultQueryKeys.database(updatedTable.databaseId)
        });
      }
    },
  });
}

export function useDeleteDatavaultTable(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: datavaultAPI.deleteTable,
    onSuccess: async () => {
      // Invalidate general tables list
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });

      // Invalidate databases list (to update table counts)
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.databases });

      // Invalidate all database-specific queries (we don't know which database the table was in)
      await queryClient.invalidateQueries({
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

export function useDatavaultColumns(tableId: string | undefined): UseQueryResult<DatavaultColumn[]> {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: datavaultQueryKeys.tableColumns(tableId!),
    queryFn: () => datavaultAPI.listColumns(tableId!),
    enabled: isUuid,
  });
}

export function useCreateDatavaultColumn(): UseMutationResult<DatavaultColumn, unknown, { tableId: string } & Parameters<typeof datavaultAPI.createColumn>[1]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...data }: { tableId: string } & Parameters<typeof datavaultAPI.createColumn>[1]) =>
      datavaultAPI.createColumn(tableId, data),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.table(variables.tableId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

export function useUpdateDatavaultColumn(): UseMutationResult<DatavaultColumn, unknown, { columnId: string; tableId: string } & Parameters<typeof datavaultAPI.updateColumn>[1]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId, tableId: _tableId, ...data }: { columnId: string; tableId: string } & Parameters<typeof datavaultAPI.updateColumn>[1]) =>
      datavaultAPI.updateColumn(columnId, data),
    onSuccess: async (_, variables) => {
      if (variables.tableId) {
        await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      }
    },
  });
}

interface DeleteColumnParams {
  columnId: string;
  tableId: string;
}

export function useDeleteDatavaultColumn(): UseMutationResult<void, unknown, DeleteColumnParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ columnId }: DeleteColumnParams) =>
      datavaultAPI.deleteColumn(columnId),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

interface ReorderColumnsParams {
  tableId: string;
  columnIds: string[];
}

export function useReorderDatavaultColumns(): UseMutationResult<void, unknown, ReorderColumnsParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, columnIds }: ReorderColumnsParams) =>
      datavaultAPI.reorderColumns(tableId, columnIds),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableColumns(variables.tableId) });
    },
  });
}

// ============================================================================
// Rows
// ============================================================================

export function useDatavaultRows(
  tableId: string | undefined,
  options?: { limit?: number; offset?: number }
): UseQueryResult<{ rows: ApiDatavaultRowWithValues[]; pagination: { limit: number; offset: number; total: number; hasMore: boolean } }> {
  const isUuid = !!tableId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId);
  return useQuery({
    queryKey: [...datavaultQueryKeys.tableRows(tableId!), options],
    queryFn: () => datavaultAPI.listRows(tableId!, options),
    enabled: isUuid,
  });
}

export function useDatavaultRow(rowId: string | undefined): UseQueryResult<ApiDatavaultRowWithValues> {
  return useQuery({
    queryKey: datavaultQueryKeys.row(rowId!),
    queryFn: () => datavaultAPI.getRow(rowId!),
    enabled: !!rowId,
  });
}

interface CreateRowParams {
  tableId: string;
  values: Record<string, unknown>;
}

export function useCreateDatavaultRow(): UseMutationResult<ApiDatavaultRowWithValues, unknown, CreateRowParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, values }: CreateRowParams) =>
      datavaultAPI.createRow(tableId, values),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

interface UpdateRowParams {
  rowId: string;
  tableId: string;
  values: Record<string, unknown>;
}

export function useUpdateDatavaultRow(): UseMutationResult<void, unknown, UpdateRowParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, values }: UpdateRowParams) =>
      datavaultAPI.updateRow(rowId, values),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.row(variables.rowId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
    },
  });
}

interface DeleteRowParams {
  rowId: string;
  tableId: string;
}

export function useDeleteDatavaultRow(): UseMutationResult<void, unknown, DeleteRowParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId }: DeleteRowParams) =>
      datavaultAPI.deleteRow(rowId),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(variables.tableId) });
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tables });
    },
  });
}

// ============================================================================
// API Tokens (v4 Micro-Phase 5)
// ============================================================================

/**
 * Hook to fetch API tokens for a database
 */
export function useDatavaultApiTokens(databaseId: string | undefined): UseQueryResult<{ tokens: ApiDatavaultApiToken[] }> {
  return useQuery({
    queryKey: databaseId
      ? datavaultQueryKeys.apiTokens(databaseId)
      : ['datavault', 'databases', 'null', 'tokens'],
    queryFn: () => {
      if (!databaseId) { throw new Error('Database ID is required'); }
      return datavaultAPI.listApiTokens(databaseId);
    },
    enabled: !!databaseId,
  });
}

interface CreateApiTokenParams {
  databaseId: string;
  data: { label: string; scopes: ('read' | 'write')[]; expiresAt?: string };
}

/**
 * Hook to create a new API token
 * Returns the plain token ONCE in the response
 */
export function useCreateApiToken(): UseMutationResult<ApiCreateTokenResponse, unknown, CreateApiTokenParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ databaseId, data }: CreateApiTokenParams) =>
      datavaultAPI.createApiToken(databaseId, data),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.apiTokens(variables.databaseId) });
    },
  });
}

interface DeleteApiTokenParams {
  tokenId: string;
  databaseId: string;
}

/**
 * Hook to revoke (delete) an API token
 */
export function useDeleteApiToken(): UseMutationResult<void, unknown, DeleteApiTokenParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tokenId, databaseId }: DeleteApiTokenParams) =>
      datavaultAPI.deleteApiToken(tokenId, databaseId),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.apiTokens(variables.databaseId) });
    },
  });
}

// ============================================================================
// Table Permissions (v4 Micro-Phase 6)
// ============================================================================

/**
 * Hook to fetch permissions for a table (owner only)
 */
export function useTablePermissions(tableId: string | undefined): UseQueryResult<DatavaultTablePermission[]> {
  return useQuery({
    queryKey: tableId
      ? datavaultQueryKeys.tablePermissions(tableId)
      : ['datavault', 'tables', 'null', 'permissions'],
    queryFn: () => {
      if (!tableId) { throw new Error('Table ID is required'); }
      return datavaultAPI.listTablePermissions(tableId);
    },
    enabled: !!tableId,
  });
}

interface GrantPermissionParams {
  tableId: string;
  data: { userId: string; role: 'owner' | 'write' | 'read' };
}

/**
 * Hook to grant or update a table permission (owner only)
 */
export function useGrantTablePermission(): UseMutationResult<DatavaultTablePermission, unknown, GrantPermissionParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, data }: GrantPermissionParams) =>
      datavaultAPI.grantTablePermission(tableId, data),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tablePermissions(variables.tableId) });
    },
  });
}

interface RevokePermissionParams {
  permissionId: string;
  tableId: string;
}

/**
 * Hook to revoke a table permission (owner only)
 */
export function useRevokeTablePermission(): UseMutationResult<void, unknown, RevokePermissionParams> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ permissionId, tableId }: RevokePermissionParams) =>
      datavaultAPI.revokeTablePermission(permissionId, tableId),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tablePermissions(variables.tableId) });
    },
  });
}
