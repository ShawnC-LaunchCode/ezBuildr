/**
 * Infinite Data Grid Component
 * Wrapper around DataGrid with infinite scroll support
 */

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { datavaultAPI } from "@/lib/datavault-api";
import { datavaultQueryKeys } from "@/lib/datavault-hooks";
import { DataGrid } from "./DataGrid";
import { Loader2 } from "lucide-react";
import type { DatavaultColumn } from "@shared/schema";

interface InfiniteDataGridProps {
  tableId: string;
  columns: DatavaultColumn[];
  onEditRow: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
}

export function InfiniteDataGrid({
  tableId,
  columns,
  onEditRow,
  onDeleteRow,
}: InfiniteDataGridProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: [...datavaultQueryKeys.tableRows(tableId), "infinite"],
    queryFn: ({ pageParam = 0 }) =>
      datavaultAPI.listRows(tableId, { limit: 25, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      if (totalFetched < lastPage.pagination.total) {
        return totalFetched;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Error loading rows: {error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  // Flatten all pages into a single array
  const allRows = data?.pages.flatMap((page) => page.rows) || [];

  if (allRows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">No data yet</p>
        <p className="text-sm mb-4">Click "Add Row" to start adding data to your table</p>
      </div>
    );
  }

  return (
    <div>
      <DataGrid
        columns={columns}
        rows={allRows}
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
      />

      {/* Intersection observer target */}
      <div ref={observerTarget} className="h-4 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
          </div>
        )}
        {!hasNextPage && allRows.length > 25 && (
          <p className="text-sm text-muted-foreground py-4">No more rows to load</p>
        )}
      </div>
    </div>
  );
}
