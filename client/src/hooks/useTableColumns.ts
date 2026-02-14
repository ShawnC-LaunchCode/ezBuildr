import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api/datavault';

import { tableKeys } from './useDatavaultTables';

import type { DatavaultColumn } from '../lib/types/datavault';

// ============================================================================
// Column Queries
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableColumns(tableId: string | undefined) {
  return useQuery({
    queryKey: tableId ? tableKeys.columns(tableId) : ['datavault', 'tables', 'null', 'columns'],
    queryFn: () => {
      if (!tableId) {
        throw new Error('Table ID is required');
      }
      return api.getTableColumns(tableId);
    },
    enabled: !!tableId,
  });
}

// ============================================================================
// Column Mutations
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useCreateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tableId,
      input,
    }: {
      tableId: string;
      input: {
        name: string;
        type: string;
        required?: boolean;
        isPrimaryKey?: boolean;
        isUnique?: boolean;
        autoNumberStart?: number;
      };
    }) => api.createColumn(tableId, input),
    onSuccess: (data, variables) => {
      // Invalidate columns for this table
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.columns(variables.tableId) });
      // Invalidate schema (includes columns)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.schema(variables.tableId) });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useUpdateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      columnId,
      _tableId,
      input,
    }: {
      columnId: string;
      tableId: string;
      input: {
        name?: string;
        type?: string;
        required?: boolean;
        isPrimaryKey?: boolean;
        isUnique?: boolean;
      };
    }) => api.updateColumn(columnId, input),
    onSuccess: (data, variables) => {
      // Invalidate columns for this table
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.columns(variables.tableId) });
      // Invalidate schema
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.schema(variables.tableId) });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useDeleteColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ columnId, _tableId }: { columnId: string; tableId: string }) =>
      api.deleteColumn(columnId),
    onSuccess: (_, variables) => {
      // Invalidate columns for this table
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.columns(variables.tableId) });
      // Invalidate schema
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.schema(variables.tableId) });
      // Invalidate rows (since column data is removed)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.rows(variables.tableId) });
    },
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useReorderColumns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tableId, columnIds }: { tableId: string; columnIds: string[] }) =>
      api.reorderColumns(tableId, columnIds),
    onMutate: async ({ tableId, columnIds }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: tableKeys.columns(tableId) });

      // Snapshot the previous value
      const previousColumns = queryClient.getQueryData<DatavaultColumn[]>(
        tableKeys.columns(tableId)
      );

      // Optimistically update to the new value
      if (previousColumns) {
        const reorderedColumns = columnIds
          .map((id) => previousColumns.find((col) => col.id === id))
          .filter((col): col is DatavaultColumn => col !== undefined)
          .map((col, index) => ({ ...col, orderIndex: index }));

        queryClient.setQueryData(tableKeys.columns(tableId), reorderedColumns);
      }

      // Return a context object with the snapshotted value
      return { previousColumns, tableId };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousColumns) {
        queryClient.setQueryData(tableKeys.columns(context.tableId), context.previousColumns);
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.columns(variables.tableId) });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: tableKeys.schema(variables.tableId) });
    },
  });
}
