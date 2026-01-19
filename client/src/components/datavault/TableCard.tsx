/**
 * TableCard Component
 * Displays a DataVault table card with stats and actions
 */
import { MoreVertical, Trash2, FolderInput } from "lucide-react";
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
interface TableCardProps {
  table: {
    id: string;
    name: string;
    description?: string | null;
    slug: string;
    columnCount?: number;
    rowCount?: number;
    updatedAt: string | Date | null;
  };
  onClick: () => void;
  onDelete: () => void;
  onMove?: () => void;
}
export function TableCard({ table, onClick, onDelete, onMove }: TableCardProps) {
  const formatDate = (date: string | Date | null) => {
    if (!date) {return 'N/A';}
    return new Date(date).toLocaleDateString(undefined, { timeZone: 'UTC' });
  };
  return (
    <Card
      className="rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer hover:shadow-md transition-shadow group relative"
      onClick={onClick}
    >
      <div>
        <div className="p-4 sm:p-6 flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1 flex-1 min-w-0 pr-2">
            <div className="sm:text-xl md:text-2xl tracking-tight text-lg font-semibold truncate">
              {table.name}
            </div>
            {table.description ? (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {table.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-4 italic">No description</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Actions">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClick}>
                <i className="fas fa-eye mr-2"></i>
                View Table
              </DropdownMenuItem>
              {onMove && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove();
                  }}
                >
                  <FolderInput className="w-4 h-4 mr-2" />
                  Move Table
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardContent>
          {table.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {table.description}
            </p>
          )}
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <div className="flex items-center">
              <i className="fas fa-columns mr-1"></i>
              <span>{table.columnCount ?? 0} columns</span>
            </div>
            <div className="flex items-center">
              <i className="fas fa-database mr-1"></i>
              <span>{table.rowCount ?? 0} rows</span>
            </div>
            <div className="flex items-center ml-auto">
              <i className="fas fa-clock mr-1"></i>
              <span>{formatDate(table.updatedAt)}</span>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}