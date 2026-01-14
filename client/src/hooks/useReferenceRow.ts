import { useQuery } from '@tanstack/react-query';

import { DATAVAULT_CONFIG } from '@shared/config';

import * as api from '../lib/api/datavault';

/**
 * Hook to fetch a single referenced row and extract its display value
 * NOTE: This is deprecated in favor of useBatchReferences for better performance
 * Only used for backward compatibility
 */
export function useReferenceRow(
  tableId: string | undefined | null,
  rowId: string | undefined | null,
  displayColumnSlug?: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['refRow', tableId, rowId, displayColumnSlug],
    queryFn: async () => {
      if (!tableId || !rowId) {
        throw new Error('Table ID and Row ID are required');
      }

      // Fetch the referenced row
      const row = await api.getRowById(tableId, rowId);

      // Extract display value from the row
      let displayValue: string;
      if (displayColumnSlug && row.data[displayColumnSlug] !== undefined) {
        displayValue = String(row.data[displayColumnSlug]);
      } else {
        // Fallback to row ID if no display column specified or value not found
        displayValue = `${rowId.substring(0, 8)  }...`;
      }

      return {
        ...row,
        displayValue,
      };
    },
    enabled: options?.enabled !== undefined ? options.enabled : (!!tableId && !!rowId),
    staleTime: DATAVAULT_CONFIG.REFERENCE_CACHE_TIME,
  });
}
