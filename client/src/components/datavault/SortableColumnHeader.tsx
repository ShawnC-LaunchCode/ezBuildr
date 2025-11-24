/**
 * Sortable Column Header Component (PR 8)
 * Draggable column header with type icon and reorder handle
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ColumnTypeIcon, getColumnTypeColor } from "./ColumnTypeIcon";
import type { DatavaultColumn } from "@shared/schema";

interface SortableColumnHeaderProps {
  column: DatavaultColumn;
  isFirst?: boolean;
}

export function SortableColumnHeader({ column, isFirst = false }: SortableColumnHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`text-left text-sm font-semibold text-foreground min-w-[150px] bg-muted/50 border-l border-border ${isFirst ? 'border-l-0' : ''}`}
    >
      <div className="flex items-center">
        {/* Drag handle zone - more pronounced */}
        <span
          {...listeners}
          {...attributes}
          className="flex items-center justify-center w-8 h-full py-3 cursor-grab active:cursor-grabbing touch-none bg-muted/70 hover:bg-accent border-r border-border/50 transition-colors"
          title="Drag to reorder column"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </span>

        {/* Column content */}
        <div className="flex items-center gap-2 px-3 py-3">
          {/* Type icon */}
          <ColumnTypeIcon
            type={column.type}
            className={getColumnTypeColor(column.type)}
          />

          {/* Column name */}
          <span className="font-semibold">{column.name}</span>

          {/* Primary key badge */}
          {column.isPrimaryKey && (
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">
              PK
            </span>
          )}

          {/* Required indicator */}
          {column.required && <span className="text-xs text-red-500">*</span>}
        </div>
      </div>
    </th>
  );
}
