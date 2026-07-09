/**
 * DataVault Databases List Page
 * Lists all databases with stats, search, and create/delete actions
 * DataVault Phase 2: Databases feature
 */

import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

import { CreateDatabaseModal } from "@/components/datavault/CreateDatabaseModal";
import { TransferOwnershipDialog } from "@/components/dialogs/TransferOwnershipDialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultDatabases,
  useCreateDatavaultDatabase,
  useDeleteDatavaultDatabase,
  useTransferDatavaultDatabase,
} from "@/lib/datavault-hooks";

import { DatabasesGrid } from "./DatabasesGrid";
import { DatabasesPageHeader } from "./DatabasesPageHeader";

export default function DataVaultDatabasesPage(): React.JSX.Element {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: databases, isLoading } = useDatavaultDatabases();
  const createDatabaseMutation = useCreateDatavaultDatabase();
  const deleteDatabaseMutation = useDeleteDatavaultDatabase();
  const transferDatabaseMutation = useTransferDatavaultDatabase();

  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [transferringDatabase, setTransferringDatabase] = useState<{ id: string; name: string } | null>(null);

  const filteredDatabases = databases?.filter((database) => {
    const query = searchQuery.toLowerCase();
    return (
      database.name.toLowerCase().includes(query) ||
      (database.description?.toLowerCase().includes(query) ?? false)
    );
  });
  const handleCreate = async (data: { name: string; description?: string; scopeType: 'account' | 'project' | 'workflow'; scopeId?: string }): Promise<void> => {
    try {
      await createDatabaseMutation.mutateAsync(data);
      toast({ title: "Database created", description: `${data.name} has been created successfully.` });
      setCreateModalOpen(false);
    } catch (error: unknown) {
      toast({
        title: "Failed to create database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteConfirm) { return; }
    try {
      await deleteDatabaseMutation.mutateAsync(deleteConfirm.id);
      toast({
        title: "Database deleted",
        description: `${deleteConfirm.name} has been deleted successfully. Tables have been moved to the main folder.`,
      });
      setDeleteConfirm(null);
    } catch (error: unknown) {
      toast({
        title: "Failed to delete database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleTransfer = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string): Promise<void> => {
    if (!transferringDatabase) { return; }
    try {
      await transferDatabaseMutation.mutateAsync({
        id: transferringDatabase.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({
        title: "Database transferred",
        description: `${transferringDatabase.name} has been transferred successfully. All tables remain in the database.`,
      });
      setTransferringDatabase(null);
    } catch (error: unknown) {
      toast({
        title: "Failed to transfer database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Keyboard shortcut: Ctrl/Cmd + K to create database
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCreateModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title="Databases" description="Organize your tables into databases" />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            <DatabasesPageHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onCreateClick={() => setCreateModalOpen(true)}
              showSearch={databases !== undefined && databases !== null && databases.length > 0}
            />
            <DatabasesGrid
              isLoading={isLoading}
              databases={databases}
              filteredDatabases={filteredDatabases}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery("")}
              onDatabaseClick={(id) => setLocation(`/datavault/databases/${id}`)}
              onTransfer={(id, name) => setTransferringDatabase({ id, name })}
              onDelete={(db) => setDeleteConfirm({ id: db.id, name: db.name })}
              onCreateClick={() => setCreateModalOpen(true)}
            />
          </div>
        </main>
      </div>
      <CreateDatabaseModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreate}
        isLoading={createDatabaseMutation.isPending}
      />

      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Database?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}&rdquo;? This action cannot be undone.
              All tables in this database will be moved to the main folder (they will NOT be deleted).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDatabaseMutation.isPending}
            >
              {deleteDatabaseMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {transferringDatabase !== null && (
        <TransferOwnershipDialog
          open={transferringDatabase !== null}
          onOpenChange={(open) => { if (!open) { setTransferringDatabase(null); } }}
          assetType="database"
          assetName={transferringDatabase.name}
          onTransfer={handleTransfer}
          isPending={transferDatabaseMutation.isPending}
        />
      )}
    </div>
  );
}
