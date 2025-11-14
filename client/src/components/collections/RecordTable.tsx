/**
 * RecordTable Component
 * Displays collection records in a table format with type-specific rendering
 */

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, FileIcon, CheckCircle2, XCircle, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { ApiCollectionRecord, ApiCollectionField } from "@/lib/vault-api";

interface RecordTableProps {
  records: ApiCollectionRecord[];
  fields: ApiCollectionField[];
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  totalRecords?: number;
  onPageChange?: (page: number) => void;
  onRecordClick?: (record: ApiCollectionRecord) => void;
  onDelete?: (recordId: string) => void;
}

export function RecordTable({
  records,
  fields,
  isLoading = false,
  page = 1,
  pageSize = 50,
  totalRecords = 0,
  onPageChange,
  onRecordClick,
  onDelete,
}: RecordTableProps) {
  const totalPages = Math.ceil(totalRecords / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Render field value based on field type
  const renderFieldValue = (value: any, field: ApiCollectionField) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">—</span>;
    }

    switch (field.type) {
      case "boolean":
        return value ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600" />
        );

      case "date":
        try {
          return new Date(value).toLocaleDateString();
        } catch {
          return value;
        }

      case "datetime":
        try {
          return new Date(value).toLocaleString();
        } catch {
          return value;
        }

      case "file":
        if (typeof value === "string") {
          return (
            <div className="flex items-center gap-2">
              <FileIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm truncate max-w-[200px]">{value}</span>
            </div>
          );
        }
        return value;

      case "select":
        return <Badge variant="secondary">{value}</Badge>;

      case "multi_select":
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((v, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {v}
                </Badge>
              ))}
            </div>
          );
        }
        return value;

      case "json":
        return (
          <code className="text-xs bg-muted px-2 py-1 rounded">
            {JSON.stringify(value)}
          </code>
        );

      case "number":
        return <span className="font-mono">{value}</span>;

      case "text":
      default:
        const strValue = String(value);
        return (
          <span className="truncate max-w-[300px] block" title={strValue}>
            {strValue}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading records...</div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No records found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map((field) => (
                <TableHead key={field.id}>
                  <div className="flex items-center gap-2">
                    <span>{field.name}</span>
                    {field.isRequired && (
                      <span className="text-destructive text-xs">*</span>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground font-normal">
                    {field.slug}
                  </code>
                </TableHead>
              ))}
              {(onRecordClick || onDelete) && (
                <TableHead className="w-[50px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                {fields.map((field) => (
                  <TableCell
                    key={field.id}
                    className={onRecordClick && !onDelete ? "cursor-pointer" : ""}
                    onClick={onRecordClick && !onDelete ? () => onRecordClick(record) : undefined}
                  >
                    {renderFieldValue(record.data[field.slug], field)}
                  </TableCell>
                ))}
                {(onRecordClick || onDelete) && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onRecordClick && (
                          <DropdownMenuItem onClick={() => onRecordClick(record)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && onRecordClick && <DropdownMenuSeparator />}
                        {onDelete && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDelete(record.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalRecords} total records)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(page - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(page + 1)}
              disabled={!hasNextPage}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
