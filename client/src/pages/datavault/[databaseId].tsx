/**
 * Database Detail Page - Airtable Style
 * Shows database with horizontal tab bar for tables
 * Clicking a tab loads that table's grid view
 * DataVault Phase 2: PR 6
 */

import { Database as DatabaseIcon, ArrowLeft, Settings, MoreVertical, Plus, Loader2, FolderInput } from "lucide-react";
import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { ColumnManagerWithDnd } from "@/components/datavault/ColumnManagerWithDnd";
import { CreateTableModal } from "@/components/datavault/CreateTableModal";
import { DatabaseTableTabs } from "@/components/datavault/DatabaseTableTabs";
import { InfiniteEditableDataGrid } from "@/components/datavault/InfiniteEditableDataGrid";
import { MoveTableModal } from "@/components/datavault/MoveTableModal";
import { RowEditorModal } from "@/components/datavault/RowEditorModal";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultDatabase,
  useDatabaseTables,
  useDatavaultColumns,
  useDatavaultRows,
  useCreateDatavaultColumn,
  useUpdateDatavaultColumn,
  useDeleteDatavaultColumn,
  useReorderDatavaultColumns,
  useCreateDatavaultRow,
  useUpdateDatavaultRow,
  useDeleteDatavaultRow,
  useCreateDatavaultTable,
  useDatavaultDatabases,
  useMoveDatavaultTable,
} from "@/lib/datavault-hooks";

export default function DatabaseDetailPage() {
  const { databaseId } = useParams<{ databaseId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: database, isLoading: dbLoading } = useDatavaultDatabase(databaseId);
  const { data: tables, isLoading: tablesLoading } = useDatabaseTables(databaseId);
  const { data: allDatabases } = useDatavaultDatabases();

  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [rowEditorOpen, setRowEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<{ id: string; values: Record<string, any> } | null>(null);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<string | null>(null);
  const [moveTableOpen, setMoveTableOpen] = useState(false);

  // Auto-select first table when tables load
  useEffect(() => {
    if (tables && tables.length > 0 && !activeTableId) {
      setActiveTableId(tables[0].id);
    }
  }, [tables, activeTableId]);

  // Data for active table
  const { data: columns, isLoading: columnsLoading } = useDatavaultColumns(activeTableId || undefined);
  const { data: rowsData, isLoading: rowsLoading } = useDatavaultRows(activeTableId || undefined, {
    limit: 25,
    offset: 0,
  });

  // Mutations
  const createTableMutation = useCreateDatavaultTable();
  const moveTableMutation = useMoveDatavaultTable();
  const createColumnMutation = useCreateDatavaultColumn();
  const updateColumnMutation = useUpdateDatavaultColumn();
  const deleteColumnMutation = useDeleteDatavaultColumn();
  const reorderColumnsMutation = useReorderDatavaultColumns();
  const createRowMutation = useCreateDatavaultRow();
  const updateRowMutation = useUpdateDatavaultRow();
  const deleteRowMutation = useDeleteDatavaultRow();

  const isColumnMutating =
    createColumnMutation.isPending || updateColumnMutation.isPending || deleteColumnMutation.isPending;
  const isRowMutating =
    createRowMutation.isPending || updateRowMutation.isPending || deleteRowMutation.isPending;

  // Handlers
  const handleCreateTable = async (data: { name: string; description?: string; slug?: string }) => {
    try {
      const table = await createTableMutation.mutateAsync({
        ...data,
        databaseId,
      } as any);
      toast({ title: "Table created", description: `Table "${data.name}" has been created.` });
      setCreateTableOpen(false);
      setActiveTableId(table.id);
    } catch (error) {
      toast({
        title: "Failed to create table",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleMoveTable = async (targetDatabaseId: string | null) => {
    if (!activeTableId || !activeTable) {return;}

    try {
      await moveTableMutation.mutateAsync({ tableId: activeTableId, databaseId: targetDatabaseId });
      toast({
        title: "Table moved",
        description: `Table "${activeTable.name}" has been moved.`
      });
      setMoveTableOpen(false);

      // Navigate to the target database (or main tables page if moved to main folder)
      if (targetDatabaseId) {
        setLocation(`/datavault/databases/${targetDatabaseId}`);
      } else {
        setLocation('/datavault');
      }
    } catch (error) {
      toast({
        title: "Failed to move table",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleAddColumn = async (data: { name: string; type: string; required: boolean }) => {
    if (!activeTableId) {return;}

    try {
      await createColumnMutation.mutateAsync({ tableId: activeTableId, ...data });
      toast({ title: "Column added", description: `Column "${data.name}" has been added.` });
    } catch (error) {
      toast({
        title: "Failed to add column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateColumn = async (columnId: string, data: { name: string; required: boolean }) => {
    if (!activeTableId) {return;}

    try {
      await updateColumnMutation.mutateAsync({ columnId, tableId: activeTableId, ...data });
      toast({ title: "Column updated" });
    } catch (error) {
      toast({
        title: "Failed to update column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!activeTableId) {return;}

    try {
      await deleteColumnMutation.mutateAsync({ columnId, tableId: activeTableId });
      toast({ title: "Column deleted" });
    } catch (error) {
      toast({
        title: "Failed to delete column",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleReorderColumns = async (columnIds: string[]) => {
    if (!activeTableId) {return;}
    await reorderColumnsMutation.mutateAsync({ tableId: activeTableId, columnIds });
  };

  const handleAddRow = async (values: Record<string, any>) => {
    if (!activeTableId) {return;}

    try {
      await createRowMutation.mutateAsync({ tableId: activeTableId, values });
      toast({ title: "Row added" });
      setRowEditorOpen(false);
    } catch (error) {
      toast({
        title: "Failed to add row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCreateRow = async (values: Record<string, any>) => {
    if (!activeTableId) {return;}

    await createRowMutation.mutateAsync({ tableId: activeTableId, values });
  };

  const handleUpdateRow = async (values: Record<string, any>) => {
    if (!activeTableId || !editingRow) {return;}

    try {
      await updateRowMutation.mutateAsync({ rowId: editingRow.id, tableId: activeTableId, values });
      toast({ title: "Row updated" });
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
    if (!activeTableId || !deleteRowConfirm) {return;}

    try {
      await deleteRowMutation.mutateAsync({ rowId: deleteRowConfirm, tableId: activeTableId });
      toast({ title: "Row deleted" });
      setDeleteRowConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete row",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const openEditRow = (rowId: string, values: Record<string, any>) => {
    setEditingRow({ id: rowId, values });
  };

  if (dbLoading) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title="Loading..." description="" />
          <main className="flex-1 overflow-y-auto flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </main>
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title="Not Found" description="" />
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Database not found</h2>
              <Button onClick={() => setLocation("/datavault/databases")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Databases
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const activeTable = tables?.find((t) => t.id === activeTableId);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header with database info and actions */}
        <div className="border-b bg-background px-4 py-3">
          {/* Breadcrumbs */}
          <div className="mb-3">
            <Breadcrumbs
              items={[
                { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                { label: "Databases", href: "/datavault/databases" },
                { label: database.name },
              ]}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/datavault/databases")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <DatabaseIcon className="w-6 h-6 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">{database.name}</h1>
                {database.description && (
                  <p className="text-sm text-muted-foreground">{database.description}</p>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocation(`/datavault/databases/${databaseId}/settings`)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Horizontal Table Tabs (Airtable-style) */}
        <DatabaseTableTabs
          tables={tables || []}
          activeTableId={activeTableId}
          onTabClick={(tableId) => setActiveTableId(tableId)}
          onCreateTable={() => setCreateTableOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden">
          {!activeTableId || !activeTable ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div className="max-w-md">
                <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                  <DatabaseIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-semibold mb-3">No tables yet</h3>
                <p className="text-muted-foreground mb-6 text-base">
                  Tables are where you store your data. Create your first table to start organizing and managing your information.
                </p>
                <Button onClick={() => setCreateTableOpen(true)} size="lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Table
                </Button>
                <p className="text-xs text-muted-foreground mt-6">
                  💡 Tip: Each table can have custom columns, primary keys, and unique constraints to fit your data structure.
                </p>
              </div>
            </div>
          ) : (
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
                    <Button
                      onClick={() => {
                        const event = new CustomEvent('openAddColumnDialog');
                        window.dispatchEvent(event);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Column
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setMoveTableOpen(true)}>
                          <FolderInput className="w-4 h-4 mr-2" />
                          Move Table
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 mt-3 text-sm text-muted-foreground">
                  <span>{columns?.length || 0} columns</span>
                  <span>{rowsData?.pagination.total || 0} rows</span>
                </div>
              </div>

              {/* Table Content */}
              <div className="flex-1 overflow-hidden">
                {/* Data Grid */}
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
                        Click "Add Column" above to define the structure of your table.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        💡 Tip: Start with a primary key column to uniquely identify each row.
                      </p>
                    </div>
                  ) : (
                    <InfiniteEditableDataGrid
                      tableId={activeTableId}
                      columns={columns || []}
                      onEditRow={openEditRow}
                      onDeleteRow={setDeleteRowConfirm}
                      onReorderColumns={handleReorderColumns}
                      onAddRow={() => setRowEditorOpen(true)}
                      onCreateRow={handleCreateRow}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <CreateTableModal
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        onSubmit={handleCreateTable}
        isLoading={createTableMutation.isPending}
      />

      <RowEditorModal
        open={rowEditorOpen}
        onOpenChange={setRowEditorOpen}
        columns={columns || []}
        onSubmit={handleAddRow}
        isLoading={isRowMutating}
        mode="add"
      />

      <RowEditorModal
        open={!!editingRow}
        onOpenChange={() => setEditingRow(null)}
        columns={columns || []}
        initialValues={editingRow?.values || {}}
        onSubmit={handleUpdateRow}
        isLoading={isRowMutating}
        mode="edit"
      />

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
              onClick={handleDeleteRow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRowMutating}
            >
              {isRowMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Row
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveTableModal
        open={moveTableOpen}
        onOpenChange={setMoveTableOpen}
        tableName={activeTable?.name || ""}
        currentDatabaseId={databaseId}
        databases={allDatabases || []}
        onMove={handleMoveTable}
        isLoading={moveTableMutation.isPending}
      />
    </div>
  );
}
