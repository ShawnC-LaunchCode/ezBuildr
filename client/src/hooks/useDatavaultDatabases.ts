import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api/datavault';

import type { CreateDatabaseInput, UpdateDatabaseInput, DatavaultScopeType } from '../lib/types/datavault';

// ============================================================================
// Query Keys
// ============================================================================

export const datavaultKeys = {
  all: ['datavault'] as const,
  databases: () => [...datavaultKeys.all, 'databases'] as const,
  database: (id: string) => [...datavaultKeys.databases(), id] as const,
  databaseTables: (id: string) => [...datavaultKeys.database(id), 'tables'] as const,
  databasesByScope: (scopeType?: DatavaultScopeType, scopeId?: string) =>
    [...datavaultKeys.databases(), 'scope', scopeType, scopeId] as const,
};

// ============================================================================
// Database Queries
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDatabases(params?: {
  scopeType?: DatavaultScopeType;
  scopeId?: string;
}) {
  return useQuery({
    queryKey: params?.scopeType
      ? datavaultKeys.databasesByScope(params.scopeType, params.scopeId)
      : datavaultKeys.databases(),
    queryFn: () => api.getDatabases(params),
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDatabase(id: string | undefined) {
  return useQuery({
    queryKey: id ? datavaultKeys.database(id) : ['datavault', 'databases', 'null'],
    queryFn: () => {
      if (!id) {
        throw new Error('Database ID is required');
      }
      return api.getDatabaseById(id);
    },
    enabled: !!id,
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDatabaseTables(databaseId: string | undefined) {
  return useQuery({
    queryKey: databaseId
      ? datavaultKeys.databaseTables(databaseId)
      : ['datavault', 'databases', 'null', 'tables'],
    queryFn: () => {
      if (!databaseId) {
        throw new Error('Database ID is required');
      }
      return api.getTablesInDatabase(databaseId);
    },
    enabled: !!databaseId,
  });
}

// ============================================================================
// Database Mutations
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useCreateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDatabaseInput) => api.createDatabase(input),
    onSuccess: () => {
      // Invalidate all database queries
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.databases() });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useUpdateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDatabaseInput }) =>
      api.updateDatabase(id, input),
    onSuccess: (data) => {
      // Invalidate the specific database and all database lists
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.database(data.id) });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.databases() });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteDatabase(id),
    onSuccess: (_, id) => {
      // Remove the specific database from cache
      queryClient.removeQueries({ queryKey: datavaultKeys.database(id) });
      // Invalidate all database lists
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: datavaultKeys.databases() });
      // Invalidate tables list since deleted database's tables will be orphaned
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ['datavault', 'tables'] });
    },
  });
}
