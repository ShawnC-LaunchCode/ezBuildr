/**
 * Infinite Data Grid Component
 * Wrapper around DataGrid with infinite scroll support
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { datavaultAPI } from "@/lib/datavault-api";
import { datavaultQueryKeys } from "@/lib/datavault-hooks";

import type { DatavaultColumn } from "@shared/schema";

import { DataGrid } from "./DataGrid";
import { DataGridEmptyState } from "./DataGridEmptyState";
import { DataGridSkeleton } from "./DataGridSkeleton";

interface InfiniteDataGridProps {
  tableId: string;
  columns: DatavaultColumn[];
  showArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Array<{ columnId: string; operator: string; value: any }>;
  selectedRowIds?: Set<string>;
  onSelectRow?: (rowId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onSort?: (columnSlug: string) => void;
  onColumnResize?: (columnId: string, widthPx: number) => void;
  onEditRow: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
  onArchiveRow?: (rowId: string) => void;
  onUnarchiveRow?: (rowId: string) => void;
}

export function InfiniteDataGrid({
  tableId,
  columns,
  showArchived = false,
  sortBy,
  sortOrder,
  filters,
  selectedRowIds,
  onSelectRow,
  onSelectAll,
  onSort,
  onColumnResize,
  onEditRow,
  onDeleteRow,
  onArchiveRow,
  onUnarchiveRow,
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
    queryKey: [...datavaultQueryKeys.tableRows(tableId), "infinite", showArchived, sortBy, sortOrder, filters],
    queryFn: ({ pageParam = 0 }) =>
      datavaultAPI.listRows(tableId, { limit: 25, offset: pageParam, showArchived, sortBy, sortOrder, filters }),
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
    return <DataGridSkeleton rows={10} columns={(columns.length > 0) || 5} />;
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



  return (
    <div>
      <DataGrid
        columns={columns}
        rows={allRows}
        selectedRowIds={selectedRowIds}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSelectRow={onSelectRow}
        onSelectAll={onSelectAll}
        onSort={onSort}
        onColumnResize={onColumnResize}
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
        onArchiveRow={onArchiveRow}
        onUnarchiveRow={onUnarchiveRow}
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
