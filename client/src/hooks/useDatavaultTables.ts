import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api/datavault';

import { datavaultKeys } from './useDatavaultDatabases';

import type { CreateTableInput, UpdateTableInput, MoveTableInput } from '../lib/types/datavault';

// ============================================================================
// Query Keys
// ============================================================================

export const tableKeys = {
  all: ['datavault', 'tables'] as const,
  lists: () => [...tableKeys.all, 'list'] as const,
  list: () => [...tableKeys.lists()] as const,
  table: (id: string) => [...tableKeys.all, id] as const,
  schema: (id: string) => [...tableKeys.table(id), 'schema'] as const,
  columns: (id: string) => [...tableKeys.table(id), 'columns'] as const,
  rows: (id: string) => [...tableKeys.table(id), 'rows'] as const,
  rowsPage: (id: string, offset: number) => [...tableKeys.rows(id), 'page', offset] as const,
};

// ============================================================================
// Table Queries
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTables() {
  return useQuery({
    queryKey: tableKeys.list(),
    queryFn: () => api.getTables(),
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTable(id: string | undefined) {
  return useQuery({
    queryKey: id ? tableKeys.table(id) : ['datavault', 'tables', 'null'],
    queryFn: () => {
      if (!id) {
        throw new Error('Table ID is required');
      }
      return api.getTableById(id);
    },
    enabled: !!id,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableSchema(tableId: string | undefined) {
  return useQuery({
    queryKey: tableId ? tableKeys.schema(tableId) : ['datavault', 'tables', 'null', 'schema'],
    queryFn: () => {
      if (!tableId) {
        throw new Error('Table ID is required');
      }
      return api.getTableSchema(tableId);
    },
    enabled: !!tableId,
  });
}

// ============================================================================
// Table Mutations
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useCreateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTableInput) => api.createTable(input),
    onSuccess: (data) => {
      // Invalidate tables list
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

      // If table was created in a database, invalidate that database's tables
      if (data.databaseId) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        queryClient.invalidateQueries({
          queryKey: datavaultKeys.databaseTables(data.databaseId),
        });
        // Also invalidate the database itself to update table count
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        queryClient.invalidateQueries({
          queryKey: datavaultKeys.database(data.databaseId),
        });
      }
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useUpdateTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTableInput }) =>
      api.updateTable(id, input),
    onSuccess: (data) => {
      // Update the specific table
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.table(data.id) });
      // Invalidate tables list
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

      // Invalidate database's tables if table is in a database
      if (data.databaseId) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        queryClient.invalidateQueries({
          queryKey: datavaultKeys.databaseTables(data.databaseId),
        });
      }
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDeleteTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTable(id),
    onSuccess: (_, id) => {
      // Remove the specific table from cache
      queryClient.removeQueries({ queryKey: tableKeys.table(id) });
      // Invalidate tables list
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.lists() });
      // Invalidate all database queries (to update table counts)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.databases() });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useMoveTable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tableId, input }: { tableId: string; input: MoveTableInput }) =>
      api.moveTable(tableId, input),
    onSuccess: (data, variables) => {
      // Update the specific table
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.table(data.id) });
      // Invalidate tables list
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.lists() });

      // Invalidate source database if table was in a database before
      // (We'd need to track the old databaseId, but invalidating all is safer)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.databases() });

      // Invalidate target database
      if (variables.input.databaseId) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        queryClient.invalidateQueries({
          queryKey: datavaultKeys.databaseTables(variables.input.databaseId),
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        queryClient.invalidateQueries({
          queryKey: datavaultKeys.database(variables.input.databaseId),
        });
      }
    },
  });
}
