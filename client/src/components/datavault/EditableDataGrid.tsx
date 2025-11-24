/**
 * Editable Data Grid Component
 * Grid with inline editable cells, auto-save, and row actions
 * Supports different column types and validation
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, MoreVertical, GripVertical, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EditableCell } from "./EditableCell";
import { ColumnTypeIcon, getColumnTypeColor } from "./ColumnTypeIcon";
import { RowDetailDrawer } from "./RowDetailDrawer";
import type { DatavaultColumn } from "@shared/schema";
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
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface EditableDataGridProps {
  columns: DatavaultColumn[];
  rows: any[];
  onCellUpdate: (rowId: string, columnId: string, value: any) => Promise<void>;
  onEditRow?: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow?: (rowId: string) => void;
  onReorderColumns?: (columnIds: string[]) => Promise<void>;
  onCreateRow?: (values: Record<string, any>) => Promise<void>;
}

interface SortableColumnHeaderProps {
  column: DatavaultColumn;
  isDragDisabled?: boolean;
  isFirst?: boolean;
}

function SortableColumnHeader({ column, isDragDisabled = false, isFirst = false }: SortableColumnHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`text-left text-sm font-semibold text-foreground min-w-[150px] bg-muted/50 border-l border-border ${isFirst ? 'border-l-0' : ''}`}
      role="columnheader"
      scope="col"
      aria-label={`${column.name}${column.isPrimaryKey ? " (Primary Key)" : ""}${column.required ? " (Required)" : ""}`}
    >
      <div className="flex items-center">
        {/* Drag handle zone - more pronounced */}
        <div
          {...attributes}
          {...listeners}
          className={isDragDisabled
            ? "flex items-center justify-center w-8 h-full py-3 opacity-30 cursor-not-allowed bg-muted/30 border-r border-border/50"
            : "flex items-center justify-center w-8 h-full py-3 cursor-grab active:cursor-grabbing touch-none bg-muted/70 hover:bg-accent border-r border-border/50 transition-colors"
          }
          title={isDragDisabled ? "Primary key position is locked" : "Drag to reorder column"}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        {/* Column content */}
        <div className="flex items-center gap-2 px-3 py-3">
          <ColumnTypeIcon type={column.type} className={getColumnTypeColor(column.type)} />
          <span>{column.name}</span>
          {column.isPrimaryKey && (
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded" aria-label="Primary Key">
              PK
            </span>
          )}
          {column.required && (
            <span className="text-xs text-destructive" aria-label="Required">*</span>
          )}
        </div>
      </div>
    </th>
  );
}

export function EditableDataGrid({
  columns,
  rows,
  onCellUpdate,
  onEditRow,
  onDeleteRow,
  onReorderColumns,
  onCreateRow,
}: EditableDataGridProps) {
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [localColumns, setLocalColumns] = useState(columns);
  const [emptyRowValues, setEmptyRowValues] = useState<Record<string, any>>({});
  const [emptyRowTouched, setEmptyRowTouched] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const { toast } = useToast();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update local columns when props change
  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  // Sort columns by orderIndex (memoized to prevent unnecessary recalculations)
  const sortedColumns = useMemo(
    () => [...localColumns].sort((a, b) => a.orderIndex - b.orderIndex),
    [localColumns]
  );

  // Initialize empty row with autonumber pre-filled
  useEffect(() => {
    const autoNumberColumn = sortedColumns.find(
      (col) => col.type === 'auto_number' && col.isPrimaryKey
    );

    if (autoNumberColumn) {
      // Calculate next autonumber
      const maxValue = rows.reduce((max, row) => {
        const value = row.values[autoNumberColumn.id];
        const num = typeof value === 'number' ? value : parseInt(value, 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0);

      setEmptyRowValues((prev) => ({
        ...prev,
        [autoNumberColumn.id]: maxValue + 1,
      }));
    }
  }, [rows, sortedColumns]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedColumns.findIndex((col) => col.id === active.id);
      const newIndex = sortedColumns.findIndex((col) => col.id === over.id);

      const draggedColumn = sortedColumns[oldIndex];
      const targetColumn = sortedColumns[newIndex];

      // Count primary key columns
      const primaryKeyCount = sortedColumns.filter((col) => col.isPrimaryKey).length;
      const primaryKeyColumns = sortedColumns.filter((col) => col.isPrimaryKey);
      const lastPrimaryKeyIndex = sortedColumns.findIndex(
        (col) => col.id === primaryKeyColumns[primaryKeyColumns.length - 1]?.id
      );

      // Rule 1: If only one primary key, it cannot be moved
      if (primaryKeyCount === 1 && draggedColumn.isPrimaryKey) {
        return; // Block the move
      }

      // Rule 2: Primary keys must stay on the left
      if (draggedColumn.isPrimaryKey && newIndex > lastPrimaryKeyIndex) {
        return; // Block moving a primary key past the last primary key
      }

      // Rule 3: Non-primary keys cannot be moved before primary keys
      if (!draggedColumn.isPrimaryKey && targetColumn.isPrimaryKey) {
        return; // Block moving a non-primary key to a primary key position
      }

      const newColumns = arrayMove(sortedColumns, oldIndex, newIndex);
      setLocalColumns(newColumns);

      // Call reorder API if provided
      if (onReorderColumns) {
        try {
          await onReorderColumns(newColumns.map((col) => col.id));
        } catch (error) {
          // Revert on error
          setLocalColumns(columns);
        }
      }
    }
  };

  const handleCellSave = async (rowId: string, columnId: string, value: any) => {
    const cellKey = `${rowId}-${columnId}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    try {
      await onCellUpdate(rowId, columnId, value);
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleEmptyRowCellUpdate = async (columnId: string, value: any) => {
    // Update the empty row values
    const updatedValues = {
      ...emptyRowValues,
      [columnId]: value,
    };
    setEmptyRowValues(updatedValues);
    setEmptyRowTouched(true);

    // Check if all required fields are filled
    const requiredColumns = sortedColumns.filter((col) => col.required);
    const allRequiredFilled = requiredColumns.every((col) => {
      const val = updatedValues[col.id];
      return val !== undefined && val !== null && val !== '';
    });

    if (allRequiredFilled && onCreateRow) {
      // Create the actual row
      try {
        // Filter out undefined/null values
        const valuesToSave: Record<string, any> = {};
        for (const [colId, val] of Object.entries(updatedValues)) {
          if (val !== undefined && val !== null && val !== '') {
            valuesToSave[colId] = val;
          }
        }

        await onCreateRow(valuesToSave);

        // Show success notification
        toast({
          title: "New Row Added",
          description: "The row has been successfully created.",
        });

        // Reset empty row state
        setEmptyRowValues({});
        setEmptyRowTouched(false);
      } catch (error) {
        toast({
          title: "Failed to add row",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      }
    }
  };

  // Check if a column should be highlighted as missing required value in empty row
  const isEmptyRowColumnMissingRequired = (columnId: string) => {
    if (!emptyRowTouched) return false;

    const column = sortedColumns.find((col) => col.id === columnId);
    if (!column || !column.required) return false;

    const value = emptyRowValues[columnId];
    return value === undefined || value === null || value === '';
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No data yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          This table is empty. Click the "Add Row" button above to create your first row of data.
        </p>
        <p className="text-xs text-muted-foreground">
          💡 Tip: You can also double-click any cell to edit it inline after adding rows.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full border-collapse" role="table" aria-label="Data table with inline editing">
            <thead className="border-b" role="rowgroup">
              <tr role="row">
                <SortableContext
                  items={sortedColumns.map((col) => col.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {sortedColumns.map((column, index) => {
                    // Disable dragging if this is the only primary key
                    const primaryKeyCount = sortedColumns.filter((col) => col.isPrimaryKey).length;
                    const isDragDisabled = column.isPrimaryKey && primaryKeyCount === 1;

                    return (
                      <SortableColumnHeader
                        key={column.id}
                        column={column}
                        isDragDisabled={isDragDisabled}
                        isFirst={index === 0}
                      />
                    );
                  })}
                </SortableContext>
                <th className="px-3 py-3 text-left text-sm font-semibold text-foreground w-[80px] bg-muted/50 border-l border-border" role="columnheader" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-border" role="rowgroup">
            {rows.map((row) => (
              <tr key={row.row.id} className="hover:bg-accent/30 transition-colors" role="row">
                {sortedColumns.map((column, index) => (
                  <td key={column.id} className={`border-l border-border ${index === 0 ? 'border-l-0' : ''}`}>
                    <EditableCell
                      column={column}
                      value={row.values[column.id]}
                      onSave={(value) => handleCellSave(row.row.id, column.id, value)}
                      readOnly={column.isPrimaryKey && column.type === 'auto_number'}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 border-l border-border" role="gridcell">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Row actions">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelectedRowId(row.row.id)}>
                        <FileText className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {(onEditRow || onDeleteRow) && <DropdownMenuSeparator />}
                      {onEditRow && (
                        <DropdownMenuItem onClick={() => onEditRow(row.row.id, row.values)}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit Row
                        </DropdownMenuItem>
                      )}
                      {onDeleteRow && (
                        <DropdownMenuItem
                          onClick={() => onDeleteRow(row.row.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Row
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}

            {/* Empty Row for Quick Add */}
            <tr className="bg-muted/20 hover:bg-muted/30 transition-colors" role="row">
              {sortedColumns.map((column, index) => (
                <td
                  key={column.id}
                  className={`border-l border-border ${index === 0 ? 'border-l-0' : ''} ${
                    isEmptyRowColumnMissingRequired(column.id) ? 'bg-red-50 dark:bg-red-950/20' : ''
                  }`}
                >
                  <EditableCell
                    column={column}
                    value={emptyRowValues[column.id]}
                    onSave={(value) => handleEmptyRowCellUpdate(column.id, value)}
                    readOnly={column.isPrimaryKey && column.type === 'auto_number'}
                    placeholder={
                      column.isPrimaryKey && column.type === 'auto_number'
                        ? String(emptyRowValues[column.id] || '')
                        : column.required
                        ? 'Required'
                        : 'Optional'
                    }
                  />
                </td>
              ))}
              <td className="px-3 py-2 border-l border-border" role="gridcell">
                {/* Empty cell for actions column */}
              </td>
            </tr>
          </tbody>
        </table>
        </DndContext>
      </div>

      {/* Row Detail Drawer */}
      <RowDetailDrawer
        rowId={selectedRowId}
        tableOwnerId={null} // TODO: Pass table owner ID from props
        onClose={() => setSelectedRowId(null)}
      />
    </div>
  );
}
