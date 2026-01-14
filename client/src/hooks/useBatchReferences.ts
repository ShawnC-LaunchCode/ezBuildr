import { useQuery } from '@tanstack/react-query';

import type { DatavaultColumn } from '@/lib/types/datavault';

import { DATAVAULT_CONFIG } from '@shared/config';

import * as api from '../lib/api/datavault';

/**
 * Batch reference resolution hook
 * Efficiently fetches all reference values for a set of rows in a single request
 * Fixes N+1 query problem where each reference cell made individual API calls
 *
 * Before: 100 rows × 3 reference columns = 300 API requests
 * After: 1 batch API request
 */
export function useBatchReferences(
  rows: Array<{ row: { id: string }; values: Record<string, any> }>,
  columns: DatavaultColumn[]
) {
  // Extract reference columns
  const referenceColumns = columns.filter(col => col.type === 'reference');

  // Build batch request from rows and reference columns
  const requests = referenceColumns
    .map(column => {
      if (!column.reference?.tableId) {return null;}

      // Collect all unique rowIds referenced in this column
      const rowIds = rows
        .map(row => row.values[column.id])
        .filter((val): val is string => typeof val === 'string' && val.length > 0);

      const uniqueRowIds = [...new Set(rowIds)];

      if (uniqueRowIds.length === 0) {return null;}

      return {
        tableId: column.reference.tableId,
        rowIds: uniqueRowIds,
        displayColumnSlug: column.reference.displayColumnSlug || undefined,
      };
    })
    .filter((req): req is NonNullable<typeof req> => req !== null);

  return useQuery({
    queryKey: ['batchReferences', requests],
    queryFn: () => {
      if (requests.length === 0) {
        return Promise.resolve({});
      }
      return api.batchResolveReferences(requests);
    },
    enabled: requests.length > 0,
    staleTime: DATAVAULT_CONFIG.REFERENCE_CACHE_TIME,
  });
}

/**
 * Get reference display value from batch resolution result
 */
export function getReferenceDisplayValue(
  rowId: string | undefined | null,
  batchResult: Record<string, { displayValue: string; row: any }> | undefined
): { displayValue: string; isLoading: boolean; isError: boolean } {
  if (!rowId) {
    return { displayValue: '—', isLoading: false, isError: false };
  }

  if (!batchResult) {
    return { displayValue: 'Loading...', isLoading: true, isError: false };
  }

  const result = batchResult[rowId];
  if (!result) {
    return { displayValue: 'Not found', isLoading: false, isError: true };
  }

  return { displayValue: result.displayValue, isLoading: false, isError: false };
}
