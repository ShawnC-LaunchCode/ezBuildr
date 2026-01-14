import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api/datavault';

import { tableKeys } from './useDatavaultTables';

import type { DatavaultRow } from '../lib/types/datavault';

// ============================================================================
// Row Queries (Infinite)
// ============================================================================

const DEFAULT_PAGE_SIZE = 50;

export function useTableRows(tableId: string | undefined, pageSize: number = DEFAULT_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: tableId ? tableKeys.rows(tableId) : ['datavault', 'tables', 'null', 'rows'],
    queryFn: ({ pageParam = 0 }) => {
      if (!tableId) {throw new Error('Table ID is required');}
      return api.getTableRows(tableId, {
        limit: pageSize,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) {return undefined;}
      return allPages.length * pageSize;
    },
    enabled: !!tableId,
  });
}

// ============================================================================
// Row Mutations
// ============================================================================

export function useCreateRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tableId, data }: { tableId: string; data: Record<string, any> }) =>
      api.createRow(tableId, data),
    onSuccess: (data, variables) => {
      // Invalidate rows for this table
      queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}

export function useUpdateRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      rowId,
      tableId,
      data,
    }: {
      rowId: string;
      tableId: string;
      data: Record<string, any>;
    }) => api.updateRow(rowId, data),
    onMutate: async ({ rowId, tableId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tableKeys.rows(tableId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(tableKeys.rows(tableId));

      // Optimistically update the row
      queryClient.setQueryData(tableKeys.rows(tableId), (old: any) => {
        if (!old) {return old;}

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            rows: page.rows.map((row: DatavaultRow) =>
              row.id === rowId ? { ...row, data: { ...row.data, ...data } } : row
            ),
          })),
        };
      });

      return { previousData, tableId };
    },
    onError: (err, variables, context) => {
      // Roll back on error
      if (context?.previousData) {
        queryClient.setQueryData(tableKeys.rows(context.tableId), context.previousData);
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}

export function useDeleteRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rowId, tableId }: { rowId: string; tableId: string }) => api.deleteRow(rowId),
    onMutate: async ({ rowId, tableId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tableKeys.rows(tableId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(tableKeys.rows(tableId));

      // Optimistically remove the row
      queryClient.setQueryData(tableKeys.rows(tableId), (old: any) => {
        if (!old) {return old;}

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            rows: page.rows.filter((row: DatavaultRow) => row.id !== rowId),
            total: page.total - 1,
          })),
        };
      });

      return { previousData, tableId };
    },
    onError: (err, variables, context) => {
      // Roll back on error
      if (context?.previousData) {
        queryClient.setQueryData(tableKeys.rows(context.tableId), context.previousData);
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}
