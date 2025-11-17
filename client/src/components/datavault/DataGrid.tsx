/**
 * DataGrid Component
 * Displays table data in a responsive grid with edit/delete actions
 */

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreVertical, Edit2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DatavaultColumn } from "@shared/schema";
import type { ApiDatavaultRowWithValues } from "@/lib/datavault-api";

interface DataGridProps {
  columns: DatavaultColumn[];
  rows: ApiDatavaultRowWithValues[];
  onEditRow: (rowId: string, values: Record<string, any>) => void;
  onDeleteRow: (rowId: string) => void;
}

export function DataGrid({ columns, rows, onEditRow, onDeleteRow }: DataGridProps) {
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

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className="whitespace-nowrap">
                  {column.name}
                  {column.required && <span className="text-destructive ml-1">*</span>}
                </TableHead>
              ))}
              <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((rowData) => (
              <TableRow key={rowData.row.id}>
                {columns.map((column) => (
                  <TableCell key={column.id} className="max-w-[200px] truncate">
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
                      <DropdownMenuItem onClick={() => onEditRow(rowData.row.id, rowData.values)}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteRow(rowData.row.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
