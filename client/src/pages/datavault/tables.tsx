/**
 * DataVault Tables List Page
 * Lists all tables with stats, search, and create/delete actions
 *
 * PR 8: Table Templates "Coming Soon" section
 * PR 10: UX polish - skeleton loading, keyboard shortcuts (⌘K)
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  useDatavaultTables,
  useCreateDatavaultTable,
  useDeleteDatavaultTable,
  useCreateDatavaultColumn,
} from "@/lib/datavault-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Plus, Sparkles } from "lucide-react";
import { CreateTableModal } from "@/components/datavault/CreateTableModal";
import { TableCard } from "@/components/datavault/TableCard";
import { TemplateCard } from "@/components/datavault/TemplateCard";
import { TablesListSkeleton } from "@/components/datavault/LoadingSkeleton";
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
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

// Template definitions for "Coming Soon" cards
const TABLE_TEMPLATES = [
  {
    name: "People",
    description: "Manage contacts, team members, or any person-related data",
    icon: "fas fa-users",
    previewColumns: ["First Name", "Last Name", "Email", "Phone", "Company", "Title", "Notes"],
  },
  {
    name: "Businesses",
    description: "Track companies, vendors, partners, or business entities",
    icon: "fas fa-building",
    previewColumns: ["Company Name", "Industry", "Website", "Phone", "Email", "Address", "Tax ID"],
  },
  {
    name: "Contacts",
    description: "Simple contact list with essential communication details",
    icon: "fas fa-address-book",
    previewColumns: ["Name", "Email", "Phone", "Address", "Tags", "Last Contact"],
  },
  {
    name: "Case Records",
    description: "Organize cases, tickets, or incident tracking workflows",
    icon: "fas fa-folder-open",
    previewColumns: ["Case ID", "Title", "Status", "Priority", "Assigned To", "Created Date", "Description"],
  },
];

export default function DataVaultTablesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: tables, isLoading } = useDatavaultTables(true);
  const createTableMutation = useCreateDatavaultTable();
  const deleteTableMutation = useDeleteDatavaultTable();
  const createColumnMutation = useCreateDatavaultColumn();

  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Filter tables by search query
  const filteredTables = tables?.filter((table) => {
    const query = searchQuery.toLowerCase();
    return (
      table.name.toLowerCase().includes(query) ||
      table.slug.toLowerCase().includes(query) ||
      table.description?.toLowerCase().includes(query)
    );
  });

  const handleCreate = async (data: {
    name: string;
    slug?: string;
    description?: string;
    columns: Array<{ name: string; type: string; required: boolean }>;
  }) => {
    try {
      // Create table first
      const table = await createTableMutation.mutateAsync({
        name: data.name,
        slug: data.slug,
        description: data.description,
      });

      // Create columns
      for (const column of data.columns) {
        await createColumnMutation.mutateAsync({
          tableId: table.id,
          name: column.name,
          type: column.type,
          required: column.required,
        });
      }

      toast({
        title: "Table created",
        description: `${data.name} has been created with ${data.columns.length} columns.`,
      });

      setCreateModalOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create table",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteTableMutation.mutateAsync(deleteConfirm.id);

      toast({
        title: "Table deleted",
        description: `${deleteConfirm.name} has been deleted successfully.`,
      });

      setDeleteConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete table",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleTableClick = (tableId: string) => {
    setLocation(`/datavault/tables/${tableId}`);
  };

  // Keyboard shortcut: Ctrl/Cmd + K to create table
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
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">
                    <i className="fas fa-table mr-3"></i>
                    Tables
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Manage your custom data tables
                  </p>
                </div>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Table
                  <kbd className="ml-2 hidden sm:inline-block pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </Button>
              </div>

              {/* Search */}
              {tables && tables.length > 0 && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search tables..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              )}
            </div>

            {/* Table Templates Section - Coming Soon */}
            {!isLoading && (
              <div className="mb-12">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-semibold">Browse Templates</h2>
                  <Badge variant="secondary" className="ml-2">
                    Coming Soon
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Quick-start your data collection with pre-built table templates
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {TABLE_TEMPLATES.map((template) => (
                    <TemplateCard
                      key={template.name}
                      name={template.name}
                      description={template.description}
                      icon={template.icon}
                      previewColumns={template.previewColumns}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Your Tables Section */}
            {!isLoading && tables && tables.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">Your Tables</h2>
              </div>
            )}

            {/* Loading State */}
            {isLoading && <TablesListSkeleton />}

            {/* Tables Grid */}
            {!isLoading && filteredTables && filteredTables.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    onClick={() => handleTableClick(table.id)}
                    onDelete={() => setDeleteConfirm({ id: table.id, name: table.name })}
                  />
                ))}
              </div>
            ) : !isLoading && tables?.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <i className="fas fa-table text-4xl text-muted-foreground"></i>
                </div>
                <h3 className="text-xl font-semibold mb-2">No tables yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  Get started by creating your first data table with custom columns
                </p>
                <Button onClick={() => setCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Table
                </Button>
              </div>
            ) : !isLoading && searchQuery && filteredTables?.length === 0 ? (
              /* No Search Results */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground mb-4">
                  No tables match "{searchQuery}"
                </p>
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear Search
                </Button>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {/* Create Table Modal */}
      <CreateTableModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreate}
        isLoading={createTableMutation.isPending || createColumnMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
              All columns, rows, and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTableMutation.isPending}
            >
              {deleteTableMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
