

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import * as api from '../lib/api/datavault';

import { tableKeys } from './useDatavaultTables';

import type { DatavaultRow } from '../lib/types/datavault';

// ============================================================================
// Row Queries (Infinite)
// ============================================================================

const DEFAULT_PAGE_SIZE = 50;

interface RowsPage {
  rows: DatavaultRow[];
  total: number;
  hasMore: boolean;
}

export function useTableRows(tableId: string | undefined, pageSize: number = DEFAULT_PAGE_SIZE): ReturnType<typeof useInfiniteQuery<RowsPage>> {
  return useInfiniteQuery({
    queryKey: tableId ? tableKeys.rows(tableId) : ['datavault', 'tables', 'null', 'rows'],
    queryFn: ({ pageParam = 0 }) => {
      if (!tableId) {
        throw new Error('Table ID is required');
      }
      return api.getTableRows(tableId, {
        limit: pageSize,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) {
        return undefined;
      }
      return allPages.length * pageSize;
    },
    enabled: !!tableId,
  });
}

// ============================================================================
// Row Mutations
// ============================================================================

export function useCreateRow(): ReturnType<typeof useMutation<unknown, unknown, { tableId: string; data: Record<string, unknown> }>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tableId, data }: { tableId: string; data: Record<string, unknown> }) =>
      api.createRow(tableId, data),
    onSuccess: (_data, variables) => {
      // Invalidate rows for this table
      void queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
    onError: (_error: unknown) => {
      // Handle errors silently or add error reporting
    },
  });
}

export function useUpdateRow(): ReturnType<typeof useMutation<DatavaultRow, unknown, { rowId: string; tableId: string; data: Record<string, unknown> }, { previousData: unknown; tableId: string }>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      rowId,
      data,
    }: {
      rowId: string;
      tableId: string;
      data: Record<string, unknown>;
    }) => api.updateRow(rowId, data),
    onMutate: async ({ rowId, tableId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tableKeys.rows(tableId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(tableKeys.rows(tableId));

      // Optimistically update the row
      queryClient.setQueryData<InfiniteData<RowsPage>>(tableKeys.rows(tableId), (old) => {
        if (old == null) {
          return old;
        }

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((row: DatavaultRow) =>
              row.id === rowId ? { ...row, data: { ...row.data, ...data } } : row
            ),
          })),
        };
      });

      return { previousData, tableId };
    },
    onError: (_err: unknown, _variables, context) => {
      // Roll back on error
      if (context?.previousData != null) {
        queryClient.setQueryData(tableKeys.rows(context.tableId), context.previousData);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      void queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}

export function useDeleteRow(): ReturnType<typeof useMutation<void, unknown, { rowId: string; tableId: string }>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rowId }: { rowId: string; tableId: string }) => api.deleteRow(rowId),
    onMutate: async ({ rowId, tableId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tableKeys.rows(tableId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(tableKeys.rows(tableId));

      // Optimistically remove the row
      queryClient.setQueryData<InfiniteData<RowsPage>>(tableKeys.rows(tableId), (old) => {
        if (old == null) {
          return old;
        }

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.filter((row: DatavaultRow) => row.id !== rowId),
            total: page.total - 1,
          })),
        };
      });

      return { previousData, tableId };
    },
    onError: (_err: unknown, _variables, context) => {
      // Roll back on error
      if (context?.previousData != null) {
        queryClient.setQueryData(tableKeys.rows(context.tableId), context.previousData);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      void queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}
