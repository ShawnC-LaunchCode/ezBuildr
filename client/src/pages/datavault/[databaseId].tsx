/**
 * Database Detail Page - Airtable Style
 * Shows database with horizontal tab bar for tables
 * Clicking a tab loads that table's grid view
 * DataVault Phase 2: PR 6
 */
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";

import { CreateTableModal } from "@/components/datavault/CreateTableModal";
import { DatabaseTableTabs } from "@/components/datavault/DatabaseTableTabs";
import { MoveTableModal } from "@/components/datavault/MoveTableModal";
import { RowEditorModal } from "@/components/datavault/RowEditorModal";
import Header from "@/components/layout/Header"; // eslint-disable-line @typescript-eslint/naming-convention
import Sidebar from "@/components/layout/Sidebar"; // eslint-disable-line @typescript-eslint/naming-convention
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
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultDatabase,
  useDatabaseTables,
  useDatavaultColumns,
  useDatavaultRows,
  useDatavaultDatabases,
} from "@/lib/datavault-hooks";

import { DatabaseDetailHeader } from "./DatabaseDetailHeader";
import { TableContentArea } from "./TableContentArea";
import { useDatabaseDetailHandlers } from "./useDatabaseDetailHandlers";

export default function DatabaseDetailPage(): React.JSX.Element | null {
  const { databaseId } = useParams<{ databaseId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: database, isLoading: dbLoading } = useDatavaultDatabase(databaseId);
  const { data: tables } = useDatabaseTables(databaseId);
  const { data: allDatabases } = useDatavaultDatabases();

  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [rowEditorOpen, setRowEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<{ id: string; values: Record<string, unknown> } | null>(null);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState<string | null>(null);
  const [moveTableOpen, setMoveTableOpen] = useState(false);

  const activeTable = tables?.find((t) => t.id === activeTableId) ?? null;

  // Auto-select first table when tables load
  useEffect(() => {
    if (tables && tables.length > 0 && !activeTableId) {
      setActiveTableId(tables[0].id);
    }
  }, [tables, activeTableId]);

  // Data for active table
  const { data: columns } = useDatavaultColumns(activeTableId ?? undefined);
  const { data: rowsData } = useDatavaultRows(activeTableId ?? undefined, { limit: 25, offset: 0 });

  const handlers = useDatabaseDetailHandlers({
    databaseId,
    activeTableId,
    activeTableName: activeTable?.name,
    editingRow,
    deleteRowConfirm,
    toast,
    setLocation,
    setCreateTableOpen,
    setActiveTableId,
    setRowEditorOpen,
    setEditingRow,
    setDeleteRowConfirm,
    setMoveTableOpen,
  });

  if (dbLoading || !database) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header title={dbLoading ? "Loading..." : "Not Found"} description="" />
          <main className="flex-1 overflow-y-auto flex items-center justify-center">
            {dbLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">Database not found</h2>
                <Button onClick={() => setLocation("/datavault/databases")}>Back to Databases</Button>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }


  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <DatabaseDetailHeader
          database={database}
          onNavigateBack={() => setLocation("/datavault/databases")}
          onNavigateSettings={() => setLocation(`/datavault/databases/${databaseId}/settings`)}
        />

        <DatabaseTableTabs
          tables={tables ?? []}
          activeTableId={activeTableId}
          onTabClick={(tableId) => setActiveTableId(tableId)}
          onCreateTable={() => setCreateTableOpen(true)}
        />

        <main className="flex-1 overflow-hidden">
          <TableContentArea
            activeTable={activeTable}
            activeTableId={activeTableId}
            columns={columns}
            rowsData={rowsData}
            onOpenAddColumn={() => {
              const event = new CustomEvent('openAddColumnDialog');
              window.dispatchEvent(event);
            }}
            onOpenMoveTable={() => setMoveTableOpen(true)}
            onOpenCreateTable={() => setCreateTableOpen(true)}
            onAddRow={() => setRowEditorOpen(true)}
            onEditRow={handlers.openEditRow}
            onDeleteRow={setDeleteRowConfirm}
            onReorderColumns={handlers.handleReorderColumns}
            onCreateRow={handlers.handleCreateRow}
          />
        </main>
      </div>

      {/* Modals */}
      <CreateTableModal
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        onSubmit={(data) => { void handlers.handleCreateTable(data); }}
        isLoading={handlers.createTableMutation.isPending}
      />

      <RowEditorModal
        open={rowEditorOpen}
        onOpenChange={setRowEditorOpen}
        columns={columns ?? []}
        onSubmit={handlers.handleAddRow}
        isLoading={handlers.isRowMutating}
        mode="add"
      />

      <RowEditorModal
        open={editingRow !== null}
        onOpenChange={() => setEditingRow(null)}
        columns={columns ?? []}
        initialValues={editingRow?.values ?? {}}
        onSubmit={handlers.handleUpdateRow}
        isLoading={handlers.isRowMutating}
        mode="edit"
      />

      <AlertDialog open={deleteRowConfirm !== null} onOpenChange={() => setDeleteRowConfirm(null)}>
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
              onClick={() => { void handlers.handleDeleteRow(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={handlers.isRowMutating}
            >
              {handlers.isRowMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
              Delete Row
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveTableModal
        open={moveTableOpen}
        onOpenChange={setMoveTableOpen}
        tableName={activeTable?.name ?? ""}
        currentDatabaseId={databaseId}
        databases={allDatabases ?? []}
        onMove={handlers.handleMoveTable}
        isLoading={handlers.moveTableMutation.isPending}
      />
    </div>
  );
}