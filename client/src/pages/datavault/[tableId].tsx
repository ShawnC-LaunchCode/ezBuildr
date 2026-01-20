/**
 * DataVault Table View Page
 * Displays table details, columns, and rows with management UI
 * Updated for PR 7 with full Row CRUD
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Plus, Database, FolderInput, Database as DatabaseIcon } from "lucide-react";
import React, { useState } from "react";
import { Link, useParams } from "wouter";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { BulkActionsToolbar } from "@/components/datavault/BulkActionsToolbar";
import { ColumnManagerWithDnd } from "@/components/datavault/ColumnManagerWithDnd";
import { FilterPanel } from "@/components/datavault/FilterPanel";
import { InfiniteDataGrid } from "@/components/datavault/InfiniteDataGrid";
import { MoveTableModal } from "@/components/datavault/MoveTableModal";
import { RowEditorModal } from "@/components/datavault/RowEditorModal";
import { TablePermissions } from "@/components/datavault/TablePermissions";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { datavaultAPI } from "@/lib/datavault-api";
import {
  useDatavaultTable,
  useDatavaultColumns,
  useDatavaultRows,
  useCreateDatavaultColumn,
  useUpdateDatavaultColumn,
  useDeleteDatavaultColumn,
  useReorderDatavaultColumns,
  useCreateDatavaultRow,
  useUpdateDatavaultRow,
  useDeleteDatavaultRow,
  useMoveDatavaultTable,
  useDatavaultDatabases,
  datavaultQueryKeys
} from "@/lib/datavault-hooks";
import { useDatavaultFilterStore, EMPTY_FILTERS } from "@/stores/useDatavaultFilterStore";

export default function TableViewPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: table, isLoading: tableLoading } = useDatavaultTable(tableId);
  const { data: columns, isLoading: columnsLoading } = useDatavaultColumns(tableId);
  const { data: rowsData, isLoading: rowsLoading } = useDatavaultRows(tableId, { limit: 25, offset: 0 });
  const { data: databases } = useDatavaultDatabases();

  const createColumnMutation = useCreateDatavaultColumn();
  const updateColumnMutation = useUpdateDatavaultColumn();
  const deleteColumnMutation = useDeleteDatavaultColumn();
  const reorderColumnsMutation = useReorderDatavaultColumns();
  const createRowMutation = useCreateDatavaultRow();
  const updateRowMutation = useUpdateDatavaultRow();
  const deleteRowMutation = useDeleteDatavaultRow();
  const moveTableMutation = useMoveDatavaultTable();

  // Archive mutations
  const archiveRowMutation = useMutation({
    mutationFn: (rowId: string) => datavaultAPI.archiveRow(rowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      toast({ title: "Row archived", description: "Row has been archived successfully." });
    },
    onError: (error) => {
      toast({
        title: "Failed to archive row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const unarchiveRowMutation = useMutation({
    mutationFn: (rowId: string) => datavaultAPI.unarchiveRow(rowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      toast({ title: "Row restored", description: "Row has been restored successfully." });
    },
    onError: (error) => {
      toast({
        title: "Failed to restore row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Bulk mutations
  const bulkArchiveRowsMutation = useMutation({
    mutationFn: (rowIds: string[]) => datavaultAPI.bulkArchiveRows(rowIds),
    onSuccess: (_, rowIds) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      toast({ title: "Rows archived", description: `${rowIds.length} row(s) archived successfully.` });
      setSelectedRowIds(new Set());
    },
    onError: (error) => {
      toast({
        title: "Failed to archive rows",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const bulkUnarchiveRowsMutation = useMutation({
    mutationFn: (rowIds: string[]) => datavaultAPI.bulkUnarchiveRows(rowIds),
    onSuccess: (_, rowIds) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      toast({ title: "Rows restored", description: `${rowIds.length} row(s) restored successfully.` });
      setSelectedRowIds(new Set());
    },
    onError: (error) => {
      toast({
        title: "Failed to restore rows",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteRowsMutation = useMutation({
    mutationFn: (rowIds: string[]) => datavaultAPI.bulkDeleteRows(rowIds),
    onSuccess: (_, rowIds) => {
      queryClient.invalidateQueries({ queryKey: datavaultQueryKeys.tableRows(tableId) });
      toast({ title: "Rows deleted", description: `${rowIds.length} row(s) deleted successfully.` });
      setSelectedRowIds(new Set());
      setBulkDeleteConfirmOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete rows",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const [activeTab, setActiveTab] = useState("data");
  const [rowEditorOpen, setRowEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<{ id: string; values: Record<string, any> } | null>(null);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<string | null>(null);
  const [moveTableOpen, setMoveTableOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined);

  // Filters from Zustand store - use direct access to avoid creating new array references
  const filters = useDatavaultFilterStore((state) => state.filtersByTable[tableId || ""] ?? EMPTY_FILTERS);
  const apiFilters = filters.map((f) => ({
    columnId: f.columnId,
    operator: f.operator,
    value: f.value,
  }));

  // Column handlers
  const handleAddColumn = async (data: {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    referenceTableId?: string;
    referenceDisplayColumnSlug?: string;
  }) => {
    if (!tableId) { return; }

    try {
      await createColumnMutation.mutateAsync({ tableId, ...data });
      toast({ title: "Column added", description: `Column "${data.name}" has been added successfully.` });
    } catch (error) {
      toast({
        title: "Failed to add column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateColumn = async (columnId: string, data: {
    name: string;
    required: boolean;
    description?: string;
  }) => {
    if (!tableId) { return; }

    try {
      await updateColumnMutation.mutateAsync({ columnId, tableId, ...data });
      toast({ title: "Column updated", description: "Column has been updated successfully." });
    } catch (error) {
      toast({
        title: "Failed to update column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      throw error; // Re-throw so ColumnManager can handle it
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!tableId) { return; }

    try {
      await deleteColumnMutation.mutateAsync({ columnId, tableId });
      toast({ title: "Column deleted", description: "Column has been deleted successfully." });
    } catch (error) {
      toast({
        title: "Failed to delete column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleReorderColumns = async (columnIds: string[]) => {
    if (!tableId) { return; }

    await reorderColumnsMutation.mutateAsync({ tableId, columnIds });
  };

  // Row handlers
  const handleAddRow = async (values: Record<string, any>) => {
    if (!tableId) { return; }

    try {
      await createRowMutation.mutateAsync({ tableId, values });
      toast({ title: "Row added", description: "Row has been added successfully." });
      setRowEditorOpen(false);
    } catch (error) {
      toast({
        title: "Failed to add row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateRow = async (values: Record<string, any>) => {
    if (!tableId || !editingRow) { return; }

    try {
      await updateRowMutation.mutateAsync({ rowId: editingRow.id, tableId, values });
      toast({ title: "Row updated", description: "Row has been updated successfully." });
      setEditingRow(null);
    } catch (error) {
      toast({
        title: "Failed to update row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRow = async () => {
    if (!tableId || !deleteRowConfirm) { return; }

    try {
      await deleteRowMutation.mutateAsync({ rowId: deleteRowConfirm, tableId });
      toast({ title: "Row deleted", description: "Row has been deleted successfully." });
      setDeleteRowConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleMoveTable = async (databaseId: string | null) => {
    if (!tableId) { return; }

    try {
      await moveTableMutation.mutateAsync({ tableId, databaseId });
      toast({
        title: "Table moved",
        description: `Table has been moved to ${databaseId ? databases?.find((db) => db.id === databaseId)?.name : "Main Folder"} successfully.`,
      });
      setMoveTableOpen(false);
    } catch (error) {
      toast({
        title: "Failed to move table",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Selection handlers
  const handleSelectRow = (rowId: string, selected: boolean) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (!rowsData?.rows) { return; }
    if (selected) {
      setSelectedRowIds(new Set(rowsData.rows.map((r) => r.row.id)));
    } else {
      setSelectedRowIds(new Set());
    }
  };

  // Bulk action handlers
  const handleBulkArchive = () => {
    if (selectedRowIds.size === 0) { return; }
    bulkArchiveRowsMutation.mutate(Array.from(selectedRowIds));
  };

  const handleBulkUnarchive = () => {
    if (selectedRowIds.size === 0) { return; }
    bulkUnarchiveRowsMutation.mutate(Array.from(selectedRowIds));
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.size === 0) { return; }
    setBulkDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    bulkDeleteRowsMutation.mutate(Array.from(selectedRowIds));
  };

  // Sort handler
  const handleSort = (columnSlug: string) => {
    if (sortBy === columnSlug) {
      // Cycle: asc -> desc -> none
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else if (sortOrder === 'desc') {
        setSortBy(undefined);
        setSortOrder(undefined);
      }
    } else {
      // New column: start with asc
      setSortBy(columnSlug);
      setSortOrder('asc');
    }
  };

  // Column resize handler
  const handleColumnResize = async (columnId: string, widthPx: number) => {
    if (!tableId) { return; }

    try {
      await updateColumnMutation.mutateAsync({
        columnId,
        tableId,
        widthPx,
      });
    } catch (error) {
      // Silently fail - resize feedback is visual
      console.error('Failed to persist column width:', error);
    }
  };

  const openEditRow = (rowId: string, values: Record<string, any>) => {
    setEditingRow({ id: rowId, values });
  };

  const isLoading = tableLoading || columnsLoading;
  const isColumnMutating =
    createColumnMutation.isPending || updateColumnMutation.isPending || deleteColumnMutation.isPending;
  const isRowMutating =
    createRowMutation.isPending || updateRowMutation.isPending || deleteRowMutation.isPending;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={table?.name || "Table Details"} description={table?.description ?? undefined} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && table && (
              <>
                {/* Breadcrumbs */}
                <div className="mb-4">
                  <Breadcrumbs
                    items={[
                      { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                      { label: "Tables", href: "/datavault/tables" },
                      { label: table.name },
                    ]}
                  />
                </div>

                <div className="mb-8">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-foreground mb-2">
                        <i className="fas fa-table mr-3"></i>
                        {table.name}
                      </h1>
                      {table.description && <p className="text-muted-foreground">{table.description}</p>}
                      <p className="text-sm text-muted-foreground mt-1">
                        Slug: <span className="font-mono">/{table.slug}</span>
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { void setMoveTableOpen(true); }}
                      disabled={moveTableMutation.isPending}
                    >
                      <FolderInput className="w-4 h-4 mr-2" />
                      Move Table
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Columns</CardDescription>
                        <CardTitle className="text-2xl">{columns?.length || 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Rows</CardDescription>
                        <CardTitle className="text-2xl">{rowsData?.pagination.total || 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Last Updated</CardDescription>
                        <CardTitle className="text-2xl">
                          {table.updatedAt ? new Date(table.updatedAt).toLocaleDateString() : 'N/A'}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="data">
                      <Database className="w-4 h-4 mr-2" />
                      Data
                    </TabsTrigger>
                    <TabsTrigger value="columns">
                      <i className="fas fa-columns mr-2"></i>
                      Columns
                    </TabsTrigger>
                    <TabsTrigger value="settings">
                      <i className="fas fa-cog mr-2"></i>
                      Settings
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="data" className="mt-6">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Table Data</CardTitle>
                            <CardDescription>
                              {rowsData?.pagination.total || 0} row{rowsData?.pagination.total === 1 ? "" : "s"}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                id="show-archived"
                                checked={showArchived}
                                onCheckedChange={setShowArchived}
                              />
                              <Label htmlFor="show-archived" className="cursor-pointer">
                                Show Archived
                              </Label>
                            </div>
                            <Button onClick={() => { void setRowEditorOpen(true); }} disabled={!columns || columns.length === 0}>
                              <Plus className="w-4 h-4 mr-2" />
                              Add Row
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {columns && columns.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <i className="fas fa-columns text-4xl mb-4"></i>
                            <p className="mb-2">No columns defined yet</p>
                            <p className="text-sm">Add columns in the Columns tab to start adding data</p>
                          </div>
                        ) : (
                          <>
                            <FilterPanel tableId={tableId} columns={columns || []} />
                            <BulkActionsToolbar
                              selectedCount={selectedRowIds.size}
                              onClearSelection={() => setSelectedRowIds(new Set())}
                              onBulkArchive={handleBulkArchive}
                              onBulkUnarchive={handleBulkUnarchive}
                              onBulkDelete={handleBulkDelete}
                            />
                            <InfiniteDataGrid
                              tableId={tableId}
                              columns={columns || []}
                              showArchived={showArchived}
                              sortBy={sortBy}
                              sortOrder={sortOrder}
                              filters={apiFilters}
                              selectedRowIds={selectedRowIds}
                              onSelectRow={handleSelectRow}
                              onSelectAll={handleSelectAll}
                              onSort={handleSort}
                              onColumnResize={handleColumnResize}
                              onEditRow={openEditRow}
                              onDeleteRow={setDeleteRowConfirm}
                              onArchiveRow={(rowId) => archiveRowMutation.mutate(rowId)}
                              onUnarchiveRow={(rowId) => unarchiveRowMutation.mutate(rowId)}
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="columns" className="mt-6">
                    <ColumnManagerWithDnd
                      columns={columns || []}
                      tableId={tableId}
                      onAddColumn={handleAddColumn}
                      onUpdateColumn={handleUpdateColumn}
                      onDeleteColumn={handleDeleteColumn}
                      onReorderColumns={handleReorderColumns}
                      isLoading={isColumnMutating}
                    />
                  </TabsContent>

                  <TabsContent value="settings" className="mt-6">
                    <TablePermissions tableId={tableId} />
                  </TabsContent>
                </Tabs>
              </>
            )}

            {!isLoading && !table && (
              <div className="text-center py-12">
                <i className="fas fa-exclamation-triangle text-4xl text-destructive mb-4"></i>
                <h2 className="text-2xl font-bold mb-2">Table Not Found</h2>
                <p className="text-muted-foreground mb-6">
                  The table you're looking for doesn't exist or has been deleted.
                </p>
                <Link href="/datavault/tables">
                  <Button>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Tables
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Row Modal */}
      <RowEditorModal
        open={rowEditorOpen}
        onOpenChange={setRowEditorOpen}
        columns={columns || []}
        onSubmit={handleAddRow}
        isLoading={isRowMutating}
        mode="add"
      />

      {/* Edit Row Modal */}
      <RowEditorModal
        open={!!editingRow}
        onOpenChange={() => setEditingRow(null)}
        columns={columns || []}
        initialValues={editingRow?.values || {}}
        onSubmit={handleUpdateRow}
        isLoading={isRowMutating}
        mode="edit"
      />

      {/* Delete Row Confirmation */}
      <AlertDialog open={!!deleteRowConfirm} onOpenChange={() => setDeleteRowConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Row?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleDeleteRow(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRowMutating}
            >
              {isRowMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Row
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedRowIds.size} Rows?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the selected rows? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteRowsMutation.isPending}
            >
              {bulkDeleteRowsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Rows
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Table Modal */}
      <MoveTableModal
        open={moveTableOpen}
        onOpenChange={setMoveTableOpen}
        tableName={table?.name || ""}
        currentDatabaseId={table?.databaseId || null}
        databases={databases || []}
        onMove={handleMoveTable}
        isLoading={moveTableMutation.isPending}
      />
    </div>
  );
}
