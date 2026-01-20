/**
 * CollectionsPage Component
 * Lists all collections for the current tenant with create/edit/delete capabilities
 */

import { Plus, Search, Loader2, Database } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";

import { CollectionCard } from "@/components/collections/CollectionCard";
import { CreateCollectionModal } from "@/components/collections/CreateCollectionModal";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { useAuth } from "@/hooks/useAuth";
import type { ApiCollectionWithStats } from "@/lib/vault-api";
import { useCollections, useCreateCollection, useDeleteCollection } from "@/lib/vault-hooks";

export default function CollectionsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const tenantId = user?.tenantId ?? undefined;

  const { data: collections, isLoading } = useCollections(tenantId, true);
  const createMutation = useCreateCollection();
  const deleteMutation = useDeleteCollection();

  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Filter collections by search query
  const filteredCollections = collections?.filter((collection) => {
    const query = searchQuery.toLowerCase();
    return (
      collection.name.toLowerCase().includes(query) ||
      collection.slug.toLowerCase().includes(query) ||
      collection.description?.toLowerCase().includes(query)
    );
  });

  const handleCreate = async (data: { name: string; slug?: string; description?: string }) => {
    if (!tenantId) { return; }

    try {
      await createMutation.mutateAsync({
        tenantId,
        ...data,
      });

      toast({
        title: "Collection created",
        description: `${data.name} has been created successfully.`,
      });

      setCreateModalOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create collection",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm || !tenantId) { return; }

    try {
      await deleteMutation.mutateAsync({
        tenantId,
        collectionId: deleteConfirm.id,
      });

      toast({
        title: "Collection deleted",
        description: `${deleteConfirm.name} has been deleted successfully.`,
      });

      setDeleteConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete collection",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCollectionClick = (collection: ApiCollectionWithStats) => {
    setLocation(`/data/${collection.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
            <p className="text-muted-foreground mt-1">
              Manage your data tables and records
            </p>
          </div>
          <Button onClick={() => { void setCreateModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Collection
          </Button>
        </div>

        {/* Search */}
        {collections && collections.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => { void setSearchQuery(e.target.value); }}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* Collections Grid */}
      {filteredCollections && filteredCollections.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCollections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onClick={() => { void handleCollectionClick(collection); }}
              onDelete={(id) =>
                setDeleteConfirm({
                  id,
                  name: collection.name,
                })
              }
            />
          ))}
        </div>
      ) : searchQuery ? (
        <EmptyState
          icon={Search}
          title="No collections found"
          description={`No collections match "${searchQuery}"`}
        />
      ) : (
        <EmptyState
          icon={Database}
          title="No collections yet"
          description="Create your first collection to start storing structured data"
          action={
            <Button onClick={() => { void setCreateModalOpen(true); }}>
              Create Collection
            </Button>
          }
        />
      )}

      {/* Create Collection Modal */}
      <CreateCollectionModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={(data) => { void handleCreate(data); }}
        isLoading={createMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
              This will permanently delete all fields and records in this collection.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete Collection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
