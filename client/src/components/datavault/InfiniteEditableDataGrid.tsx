/**
 * Infinite Editable Data Grid Component
 * Wrapper around EditableDataGrid with infinite scroll support
 * Includes cell-level auto-save functionality
 */

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { datavaultAPI } from "@/lib/datavault-api";
import { datavaultQueryKeys } from "@/lib/datavault-hooks";

import { DATAVAULT_CONFIG } from "@shared/config";
import type { DatavaultColumn } from "@shared/schema";

import { EditableDataGrid } from "./EditableDataGrid";


interface InfiniteEditableDataGridProps {
  tableId: string;
  columns: DatavaultColumn[];
  onEditRow: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
  onReorderColumns?: (columnIds: string[]) => Promise<void>;
  onAddRow?: () => void;
  onCreateRow?: (values: Record<string, any>) => Promise<void>;
}

export function InfiniteEditableDataGrid({
  tableId,
  columns,
  onEditRow,
  onDeleteRow,
  onReorderColumns,
  onAddRow,
  onCreateRow,
}: InfiniteEditableDataGridProps) {
  const observerTarget = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      datavaultAPI.listRows(tableId, { limit: DATAVAULT_CONFIG.INFINITE_SCROLL_PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      if (totalFetched < lastPage.pagination.total) {
        return totalFetched;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  // Cell update mutation with optimistic updates
  const updateCellMutation = useMutation({
    mutationFn: async ({
      rowId,
      columnId,
      value,
    }: {
      rowId: string;
      columnId: string;
      value: any;
    }) => {
      // Get current row values
      const allRows = data?.pages.flatMap((page) => page.rows) || [];
      const row = allRows.find((r) => r.row.id === rowId);
      if (!row) {throw new Error("Row not found");}

      // Update only the changed cell
      const updatedValues = {
        ...row.values,
        [columnId]: value,
      };

      // Call update API
      await datavaultAPI.updateRow(rowId, updatedValues);
      return { rowId, columnId, value };
    },
    onMutate: async ({ rowId, columnId, value }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: [...datavaultQueryKeys.tableRows(tableId), "infinite"],
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData([
        ...datavaultQueryKeys.tableRows(tableId),
        "infinite",
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData(
        [...datavaultQueryKeys.tableRows(tableId), "infinite"],
        (old: any) => {
          if (!old) {return old;}
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              rows: page.rows.map((row: any) =>
                row.row.id === rowId
                  ? {
                      ...row,
                      values: {
                        ...row.values,
                        [columnId]: value,
                      },
                    }
                  : row
              ),
            })),
          };
        }
      );

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: () => {
      // Invalidate and refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: [...datavaultQueryKeys.tableRows(tableId), "infinite"],
      });
    },
    onError: (error, _variables, context) => {
      // Revert to previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(
          [...datavaultQueryKeys.tableRows(tableId), "infinite"],
          context.previousData
        );
      }

      toast({
        title: "Failed to update cell",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
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

  const handleCellUpdate = async (rowId: string, columnId: string, value: any) => {
    await updateCellMutation.mutateAsync({ rowId, columnId, value });
  };

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

  return (
    <div>
      <EditableDataGrid
        columns={columns}
        rows={allRows}
        onCellUpdate={handleCellUpdate}
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
        onReorderColumns={onReorderColumns}
        onCreateRow={onCreateRow}
      />

      {/* Intersection observer target */}
      <div ref={observerTarget} className="h-4 flex items-center justify-center mt-4">
        {isFetchingNextPage && (
          <div className="py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
          </div>
        )}
        {!hasNextPage && allRows.length > 25 && (
          <p className="text-sm text-muted-foreground py-4">No more rows to load</p>
        )}
      </div>

      {/* Add Row Button */}
      {onAddRow && (
        <div className="mt-4 flex justify-start">
          <Button
            onClick={onAddRow}
            disabled={columns.length === 0}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Row
          </Button>
        </div>
      )}
    </div>
  );
}
