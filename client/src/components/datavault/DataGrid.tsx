/**
 * DataGrid Component
 * Displays table data in a responsive grid with edit/delete actions
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreVertical, Edit2, Trash2, Archive, ArchiveRestore, ArrowUp, ArrowDown, ArrowUpDown, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { DatavaultColumn } from "@shared/schema";
import type { ApiDatavaultRowWithValues } from "@/lib/datavault-api";

interface DataGridProps {
  columns: DatavaultColumn[];
  rows: ApiDatavaultRowWithValues[];
  selectedRowIds?: Set<string>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSelectRow?: (rowId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onSort?: (columnSlug: string) => void;
  onColumnResize?: (columnId: string, widthPx: number) => void;
  onEditRow: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
  onArchiveRow?: (rowId: string) => void;
  onUnarchiveRow?: (rowId: string) => void;
}

export function DataGrid({
  columns,
  rows,
  selectedRowIds,
  sortBy,
  sortOrder,
  onSelectRow,
  onSelectAll,
  onSort,
  onColumnResize,
  onEditRow,
  onDeleteRow,
  onArchiveRow,
  onUnarchiveRow,
}: DataGridProps) {
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    columns.forEach((col) => {
      widths[col.id] = col.widthPx ?? 150;
    });
    return widths;
  });
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const formatValue = (value: any, type: string): string => {
    if (value === null || value === undefined) return "-";

    switch (type) {
      case "boolean":
        return value ? "Yes" : "No";
      case "date":
        return value ? new Date(value).toLocaleDateString() : "-";
      case "datetime":
        return value ? new Date(value).toLocaleString() : "-";
      case "json":
        return typeof value === "object" ? JSON.stringify(value) : String(value);
      default:
        return String(value);
    }
  };

  // Resize handlers
  const handleResizeStart = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setResizingColumn(columnId);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnId] || 150;
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumn) return;

    const delta = e.clientX - resizeStartX.current;
    const newWidth = Math.max(80, resizeStartWidth.current + delta); // Min width 80px

    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumn]: newWidth,
    }));
  };

  const handleResizeEnd = () => {
    if (resizingColumn && onColumnResize) {
      onColumnResize(resizingColumn, columnWidths[resizingColumn]);
    }
    setResizingColumn(null);
  };

  // Add mouse event listeners for resize
  useEffect(() => {
    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, columnWidths]);

  if (columns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No columns defined</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No data yet</p>
      </div>
    );
  }

  const allRowIds = rows.map((r) => r.row.id);
  const allSelected = selectedRowIds && allRowIds.length > 0 && allRowIds.every((id) => selectedRowIds.has(id));
  const someSelected = selectedRowIds && allRowIds.some((id) => selectedRowIds.has(id)) && !allSelected;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {onSelectAll && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onSelectAll(!!checked)}
                    aria-label="Select all rows"
                    className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                </TableHead>
              )}
              {columns.map((column) => {
                const isSorted = sortBy === column.slug;
                const SortIcon = isSorted
                  ? sortOrder === 'asc'
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;

                return (
                  <TableHead
                    key={column.id}
                    className="whitespace-nowrap relative"
                    style={{ width: `${columnWidths[column.id] || 150}px`, minWidth: '80px' }}
                  >
                    <div className="flex items-center gap-2 pr-6">
                      <span>
                        {column.name}
                        {column.required && <span className="text-destructive ml-1">*</span>}
                      </span>
                      {onSort && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => onSort(column.slug)}
                        >
                          <SortIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {/* Resize handle */}
                    {onColumnResize && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 group"
                        onMouseDown={(e) => handleResizeStart(column.id, e)}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </TableHead>
                );
              })}
              <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((rowData) => {
              const isArchived = !!rowData.row.deletedAt;
              const isSelected = selectedRowIds?.has(rowData.row.id) || false;

              return (
                <TableRow key={rowData.row.id} className={isArchived ? "opacity-60" : undefined}>
                  {onSelectRow && (
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelectRow(rowData.row.id, !!checked)}
                        aria-label={`Select row ${rowData.row.id}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column, idx) => (
                    <TableCell
                      key={column.id}
                      className="truncate"
                      style={{ width: `${columnWidths[column.id] || 150}px`, minWidth: '80px', maxWidth: `${columnWidths[column.id] || 150}px` }}
                    >
                      {idx === 0 && isArchived && (
                        <Badge variant="secondary" className="mr-2 text-xs">
                          Archived
                        </Badge>
                      )}
                      {formatValue(rowData.values[column.id], column.type)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onEditRow(rowData.row.id, rowData.values)}
                          disabled={isArchived}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {isArchived ? (
                          <>
                            {onUnarchiveRow && (
                              <DropdownMenuItem onClick={() => onUnarchiveRow(rowData.row.id)}>
                                <ArchiveRestore className="w-4 h-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            )}
                          </>
                        ) : (
                          <>
                            {onArchiveRow && (
                              <DropdownMenuItem onClick={() => onArchiveRow(rowData.row.id)}>
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDeleteRow(rowData.row.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
