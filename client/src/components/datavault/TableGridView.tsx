/**
 * Table Grid View - With Infinite Scroll (PR 7 + PR 8 + PR 9)
 * Spreadsheet-like grid for viewing and editing rows
 * PR 7: Basic grid structure
 * PR 8: Added drag-and-drop column reordering
 * PR 9: Added infinite scroll row loading
 */
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import React, { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useBatchReferences } from "@/hooks/useBatchReferences";
import { useInfiniteRows } from "@/hooks/useInfiniteRows";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { datavaultAPI } from "@/lib/datavault-api";
import { datavaultQueryKeys } from "@/lib/datavault-hooks";
import type { DatavaultColumn } from "@shared/schema";
import { AddRowButton } from "./AddRowButton";
import { CellRenderer } from "./CellRenderer";
import { DeleteRowButton } from "./DeleteRowButton";
import { SortableColumnHeader } from "./SortableColumnHeader";
interface TableGridViewProps {
  tableId: string;
}
interface EditingCell {
  rowId: string;
  colId: string;
}
export function TableGridView({ tableId }: TableGridViewProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [localColumns, setLocalColumns] = useState<DatavaultColumn[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // Fetch table schema (columns)
  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: [...datavaultQueryKeys.table(tableId), 'schema'],
    queryFn: () => datavaultAPI.getTableSchema(tableId),
  });
  // Initialize local columns when schema loads (replaces deprecated onSuccess)
  if (schema?.columns && localColumns.length === 0) {
    setLocalColumns(schema.columns);
  }
  // Fetch rows with infinite scroll
  const {
    data: infiniteData,
    isLoading: rowsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteRows(tableId, { limit: 100 });
  // Intersection observer for infinite scroll trigger
  useIntersectionObserver(loadMoreRef, {
    onIntersect: () => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    enabled: hasNextPage ?? false,
  });
  // Flatten all pages into a single array of rows
  const allRows = infiniteData?.pages.flatMap((page) => page.rows) || [];
  // Batch fetch all reference values (fixes N+1 query problem)
  // Before: 100 rows × 3 reference columns = 300 API requests
  // After: 1 batch API request
  const { data: batchReferencesData } = useBatchReferences(
    allRows,
    localColumns.length > 0 ? localColumns : (schema?.columns || [])
  );
  const handleCellUpdate = async (rowId: string, column: DatavaultColumn, value: any) => {
    try {
      // Get current row values
      const row = allRows.find(r => r.row.id === rowId);
      if (!row) { return; }
      // Update with new value
      const updatedValues = {
        ...row.values,
        [column.id]: value,
      };
      await datavaultAPI.updateRow(rowId, updatedValues);
      // Invalidate queries to refetch all pages
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      // Clear editing state
      setEditingCell(null);
    } catch (error) {
      console.error('Failed to update cell:', error);
    }
  };
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sortedColumns.findIndex((col) => col.id === active.id);
      const newIndex = sortedColumns.findIndex((col) => col.id === over.id);
      // Optimistically update local state
      const newColumns = arrayMove(sortedColumns, oldIndex, newIndex);
      setLocalColumns(newColumns);
      try {
        // Send new order to backend
        const columnIds = newColumns.map((col) => col.id);
        await datavaultAPI.reorderColumns(tableId, columnIds);
        toast({
          title: "Columns reordered",
          description: "Column order has been updated.",
        });
      } catch (error) {
        // Revert on error
        setLocalColumns(sortedColumns);
        toast({
          title: "Failed to reorder columns",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      }
    }
  };
  if (schemaLoading || rowsLoading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!schema) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Unable to load table schema
      </div>
    );
  }
  // Use local columns if available (for optimistic updates), otherwise use schema
  const columns = localColumns.length > 0 ? localColumns : (schema?.columns || []);
  // Sort columns by orderIndex
  const sortedColumns = [...columns].sort((a, b) => a.orderIndex - b.orderIndex);
  return (
    <div className="space-y-4">
      <div className="overflow-auto border rounded-md">
        <div className="hidden md:block">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => { void handleDragEnd(e); }}
          >
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr>
                  <SortableContext
                    items={sortedColumns.map((col) => col.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {sortedColumns.map((col) => (
                      <SortableColumnHeader key={col.id} column={col} />
                    ))}
                  </SortableContext>
                  <th className="border-b px-3 py-2 bg-gray-50 dark:bg-gray-800 w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => (
                  <tr key={row.row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    {sortedColumns.map((col) => (
                      <td
                        key={col.id}
                        className="px-3 py-2 border-b cursor-pointer"
                        onDoubleClick={() => setEditingCell({ rowId: row.row.id, colId: col.id })}
                      >
                        <CellRenderer
                          row={row}
                          column={col}
                          editing={editingCell?.rowId === row.row.id && editingCell?.colId === col.id}
                          onCommit={(value) => { void handleCellUpdate(row.row.id, col, value); }}
                          onCancel={() => setEditingCell(null)}
                          batchReferencesData={batchReferencesData}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 border-b text-right">
                      <DeleteRowButton
                        tableId={tableId}
                        rowId={row.row.id}
                        onDelete={() => queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) })}
                      />
                    </td>
                  </tr>
                ))}
                {allRows.length === 0 && !rowsLoading && (
                  <tr>
                    <td
                      colSpan={sortedColumns.length + 1}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No rows yet. Click "Add Row" to create your first row.
                    </td>
                  </tr>
                )}
                {/* Infinite scroll sentinel element */}
                {hasNextPage && (
                  <tr ref={loadMoreRef}>
                    <td colSpan={sortedColumns.length + 1} className="h-12 text-center">
                      {isFetchingNextPage && (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline-block" />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DndContext>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4 p-4">
          {allRows.map((row) => (
            <div key={row.row.id} className="bg-card border rounded-lg p-4 space-y-3 shadow-sm">
              {sortedColumns.map((col) => (
                <div key={col.id} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{col.name}</span>
                  <div className="text-sm">
                    <CellRenderer
                      row={row}
                      column={col}
                      editing={editingCell?.rowId === row.row.id && editingCell?.colId === col.id}
                      onCommit={(value) => { void handleCellUpdate(row.row.id, col, value); }}
                      onCancel={() => setEditingCell(null)}
                      batchReferencesData={batchReferencesData}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-end">
                <DeleteRowButton
                  tableId={tableId}
                  rowId={row.row.id}
                  onDelete={() => queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) })}
                />
              </div>
            </div>
          ))}
          {allRows.length === 0 && !rowsLoading && (
            <div className="text-center py-8 text-muted-foreground">
              No rows yet.
            </div>
          )}
          {hasNextPage && (
            <div ref={loadMoreRef} className="h-12 flex items-center justify-center">
              {isFetchingNextPage && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
            </div>
          )}
        </div>
      </div>
      <AddRowButton
        tableId={tableId}
        columns={sortedColumns}
        onAdd={() => queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) })}
      />
    </div>
  );
}