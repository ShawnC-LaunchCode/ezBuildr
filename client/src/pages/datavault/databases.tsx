/**
 * DataVault Databases List Page
 * Lists all databases with stats, search, and create/delete actions
 * DataVault Phase 2: Databases feature
 */

import { Loader2, Search, Plus, Database as DatabaseIcon } from "lucide-react";
import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";

import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CreateDatabaseModal } from "@/components/datavault/CreateDatabaseModal";
import { DatabaseCard } from "@/components/datavault/DatabaseCard";
import { TransferOwnershipDialog } from "@/components/dialogs/TransferOwnershipDialog";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultDatabases,
  useCreateDatavaultDatabase,
  useDeleteDatavaultDatabase,
  useTransferDatavaultDatabase,
} from "@/lib/datavault-hooks";

export default function DataVaultDatabasesPage() {
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

  // Filter databases by search query
  const filteredDatabases = databases?.filter((database) => {
    const query = searchQuery.toLowerCase();
    return (
      database.name.toLowerCase().includes(query) ||
      database.description?.toLowerCase().includes(query)
    );
  });

  const handleCreate = async (data: {
    name: string;
    description?: string;
    scopeType: 'account' | 'project' | 'workflow';
    scopeId?: string;
  }) => {
    try {
      await createDatabaseMutation.mutateAsync(data);

      toast({
        title: "Database created",
        description: `${data.name} has been created successfully.`,
      });

      setCreateModalOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) { return; }

    try {
      await deleteDatabaseMutation.mutateAsync(deleteConfirm.id);

      toast({
        title: "Database deleted",
        description: `${deleteConfirm.name} has been deleted successfully. Tables have been moved to the main folder.`,
      });

      setDeleteConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleTransfer = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => {
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
    } catch (error) {
      toast({
        title: "Failed to transfer database",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDatabaseClick = (databaseId: string) => {
    setLocation(`/datavault/databases/${databaseId}`);
  };

  // Keyboard shortcut: Ctrl/Cmd + K to create database
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
            {/* Breadcrumbs */}
            <div className="mb-4">
              <Breadcrumbs
                items={[
                  { label: "DataVault", href: "/datavault", icon: <DatabaseIcon className="w-3 h-3" /> },
                  { label: "Databases" },
                ]}
              />
            </div>

            {/* Page Header */}
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">
                    <DatabaseIcon className="inline-block w-8 h-8 mr-3" />
                    Databases
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Organize your tables into databases by project, workflow, or account
                  </p>
                </div>
                <Button onClick={() => { void setCreateModalOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Database
                  <kbd className="ml-2 hidden sm:inline-block pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </Button>
              </div>

              {/* Search */}
              {databases && databases.length > 0 && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search databases..."
                    value={searchQuery}
                    onChange={(e) => { void setSearchQuery(e.target.value); }}
                    className="pl-9"
                  />
                </div>
              )}
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-48 bg-muted animate-pulse rounded-lg"
                  />
                ))}
              </div>
            )}

            {/* Databases Grid */}
            {!isLoading && filteredDatabases && filteredDatabases.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredDatabases.map((database) => (
                  <DatabaseCard
                    key={database.id}
                    database={database}
                    onClick={() => { void handleDatabaseClick(database.id); }}
                    onTransfer={(id, name) => setTransferringDatabase({ id, name })}
                    onDelete={() => setDeleteConfirm({ id: database.id, name: database.name })}
                  />
                ))}
              </div>
            ) : !isLoading && databases?.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <DatabaseIcon className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No databases yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  Get started by creating your first database to organize your tables
                </p>
                <Button onClick={() => { void setCreateModalOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Database
                </Button>
              </div>
            ) : !isLoading && searchQuery && filteredDatabases?.length === 0 ? (
              /* No Search Results */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground mb-4">
                  No databases match "{searchQuery}"
                </p>
                <Button variant="outline" onClick={() => { void setSearchQuery(""); }}>
                  Clear Search
                </Button>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {/* Create Database Modal */}
      <CreateDatabaseModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={(data) => handleCreate(data)}
        isLoading={createDatabaseMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Database?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
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
              {deleteDatabaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Dialog */}
      {transferringDatabase && (
        <TransferOwnershipDialog
          open={!!transferringDatabase}
          onOpenChange={(open) => !open && setTransferringDatabase(null)}
          assetType="database"
          assetName={transferringDatabase.name}
          onTransfer={handleTransfer}
          isPending={transferDatabaseMutation.isPending}
        />
      )}
    </div>
  );
}
