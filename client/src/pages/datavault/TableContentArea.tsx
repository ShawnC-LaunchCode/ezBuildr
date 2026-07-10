/**
 * TableContentArea
 * Renders the active table's header, stats, and data grid (or empty states)
 * for the Database Detail page.
 */

import { Database as DatabaseIcon, Plus, MoreVertical, FolderInput, Share2 } from "lucide-react";

import { InfiniteEditableDataGrid } from "@/components/datavault/InfiniteEditableDataGrid";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { DatavaultColumn } from "@shared/schema";

interface TableInfo {
    id: string;
    name: string;
    description?: string | null;
}


interface RowsData {
    pagination: { total: number };
    [key: string]: unknown;
}

interface TableContentAreaProps {
    activeTable: TableInfo | null;
    activeTableId: string | null;
    columns: DatavaultColumn[] | undefined;
    rowsData: RowsData | undefined;
    onOpenAddColumn: () => void;
    onOpenMoveTable: () => void;
    onOpenShare: () => void;
    onOpenCreateTable: () => void;
    onAddRow: () => void;
    onEditRow: (rowId: string, values: Record<string, unknown>) => void;
    onDeleteRow: (rowId: string) => void;
    onReorderColumns: (columnIds: string[]) => Promise<void>;
    onCreateRow: (values: Record<string, unknown>) => Promise<void>;
}

export function TableContentArea({
    activeTable,
    activeTableId,
    columns,
    rowsData,
    onOpenAddColumn,
    onOpenMoveTable,
    onOpenShare,
    onOpenCreateTable,
    onAddRow,
    onEditRow,
    onDeleteRow,
    onReorderColumns,
    onCreateRow,
}: TableContentAreaProps): React.JSX.Element {
    if (!activeTableId || !activeTable) {
        return (
            <div className="h-full flex items-center justify-center text-center p-8">
                <div className="max-w-md">
                    <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                        <DatabaseIcon className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-3">No tables yet</h3>
                    <p className="text-muted-foreground mb-6 text-base">
                        Tables are where you store your data. Create your first table to start organizing and managing your information.
                    </p>
                    <Button onClick={onOpenCreateTable} size="lg">
                        <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                        Create Your First Table
                    </Button>
                    <p className="text-xs text-muted-foreground mt-6">
                        💡 Tip: Each table can have custom columns, primary keys, and unique constraints to fit your data structure.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Table Header */}
            <div className="border-b px-6 py-4 bg-background">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">{activeTable.name}</h2>
                        {activeTable.description && (
                            <p className="text-sm text-muted-foreground">{activeTable.description}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={onOpenAddColumn} size="sm" variant="outline">
                            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                            Add Column
                        </Button>
                        <Button onClick={onOpenShare} size="sm" variant="outline">
                            <Share2 className="w-4 h-4 mr-2" aria-hidden="true" />
                            Share
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={onOpenMoveTable}>
                                    <FolderInput className="w-4 h-4 mr-2" aria-hidden="true" />
                                    Move Table
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-6 mt-3 text-sm text-muted-foreground">
                    <span>{columns?.length ?? 0} columns</span>
                    <span>{rowsData?.pagination.total ?? 0} rows</span>
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-auto p-6">
                    {columns && columns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
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
                                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                                    />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-foreground mb-2">No columns defined yet</h3>
                            <p className="text-sm text-muted-foreground max-w-md mb-4">
                                Click &ldquo;Add Column&rdquo; above to define the structure of your table.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                💡 Tip: Start with a primary key column to uniquely identify each row.
                            </p>
                        </div>
                    ) : (
                        <InfiniteEditableDataGrid
                            tableId={activeTableId}
                            columns={columns ?? []}
                            onEditRow={onEditRow}
                            onDeleteRow={onDeleteRow}
                            onReorderColumns={onReorderColumns}
                            onAddRow={onAddRow}
                            onCreateRow={onCreateRow}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
