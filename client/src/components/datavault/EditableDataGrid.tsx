/**
 * Editable Data Grid Component
 * Grid with inline editable cells, auto-save, and row actions
 * Supports different column types and validation
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditableCell } from "./EditableCell";
import { ColumnTypeIcon, getColumnTypeColor } from "./ColumnTypeIcon";
import type { DatavaultColumn } from "@shared/schema";

interface EditableDataGridProps {
  columns: DatavaultColumn[];
  rows: any[];
  onCellUpdate: (rowId: string, columnId: string, value: any) => Promise<void>;
  onEditRow?: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow?: (rowId: string) => void;
}

export function EditableDataGrid({
  columns,
  rows,
  onCellUpdate,
  onEditRow,
  onDeleteRow,
}: EditableDataGridProps) {
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // Sort columns by orderIndex
  const sortedColumns = [...columns].sort((a, b) => a.orderIndex - b.orderIndex);

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
        <table className="w-full" role="table" aria-label="Data table with inline editing">
          <thead className="bg-muted/50 border-b" role="rowgroup">
            <tr role="row">
              {sortedColumns.map((column) => (
                <th
                  key={column.id}
                  className="px-3 py-3 text-left text-sm font-semibold text-foreground min-w-[150px]"
                  role="columnheader"
                  scope="col"
                  aria-label={`${column.name}${column.isPrimaryKey ? " (Primary Key)" : ""}${column.required ? " (Required)" : ""}`}
                >
                  <div className="flex items-center gap-2">
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
                </th>
              ))}
              <th className="px-3 py-3 text-left text-sm font-semibold text-foreground w-[80px]" role="columnheader" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border" role="rowgroup">
            {rows.map((row) => (
              <tr key={row.row.id} className="hover:bg-accent/30 transition-colors" role="row">
                {sortedColumns.map((column) => (
                  <td key={column.id} className="border-r last:border-r-0">
                    <EditableCell
                      column={column}
                      value={row.values[column.id]}
                      onSave={(value) => handleCellSave(row.row.id, column.id, value)}
                      readOnly={column.isPrimaryKey && column.type === 'auto_number'}
                    />
                  </td>
                ))}
                <td className="px-3 py-2" role="gridcell">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Row actions">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
