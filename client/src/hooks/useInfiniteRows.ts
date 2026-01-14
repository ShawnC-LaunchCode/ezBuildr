/**
 * Infinite scroll hook for DataVault rows
 * Uses TanStack Query's useInfiniteQuery with offset-based pagination
 */

import { useInfiniteQuery } from "@tanstack/react-query";

import { datavaultAPI } from "@/lib/datavault-api";
import { datavaultQueryKeys } from "@/lib/datavault-hooks";

interface UseInfiniteRowsOptions {
  limit?: number;
}

export function useInfiniteRows(tableId: string, options: UseInfiniteRowsOptions = {}) {
  const limit = options.limit || 100;

  return useInfiniteQuery({
    queryKey: [...datavaultQueryKeys.tableRows(tableId), 'infinite', limit],
    queryFn: ({ pageParam = 0 }) =>
      datavaultAPI.listRows(tableId, { offset: pageParam, limit }),
    getNextPageParam: (lastPage, allPages) => {
      // Calculate total fetched across all pages
      const totalFetched = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      // If there are more rows, return the offset for the next page
      if (totalFetched < lastPage.pagination.total) {
        return totalFetched; // This is the offset for next page
      }
      return undefined;
    },
    initialPageParam: 0,
  });
}
