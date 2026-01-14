/**
 * CollectionDetailPage Component
 * Shows collection details with fields manager and records viewer
 */

import { Plus, Loader2, ArrowLeft, Database } from "lucide-react";
import React, { useState } from "react";
import { useParams, useLocation } from "wouter";

import { CreateFieldModal } from "@/components/collections/CreateFieldModal";
import { FieldsList } from "@/components/collections/FieldsList";
import { RecordEditorModal } from "@/components/collections/RecordEditorModal";
import { RecordsList } from "@/components/collections/RecordsList";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ApiCollectionField, ApiCollectionRecord } from "@/lib/vault-api";
import {
  useCollection,
  useCollectionFields,
  useCollectionRecords,
  useCreateCollectionField,
  useUpdateCollectionField,
  useDeleteCollectionField,
  useCreateCollectionRecord,
  useUpdateCollectionRecord,
  useDeleteCollectionRecord,
} from "@/lib/vault-hooks";

export default function CollectionDetailPage() {
  const { id: collectionId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const tenantId = user?.tenantId ?? undefined;

  const { data: collection, isLoading: loadingCollection } = useCollection(tenantId, collectionId, false);
  const { data: fields, isLoading: loadingFields } = useCollectionFields(tenantId, collectionId);

  // Records pagination state
  const [recordsPage, setRecordsPage] = useState(1);
  const recordsPageSize = 50;

  const { data: recordsData, isLoading: loadingRecords } = useCollectionRecords(
    tenantId,
    collectionId,
    {
      offset: (recordsPage - 1) * recordsPageSize,
      limit: recordsPageSize,
    }
  );

  const createFieldMutation = useCreateCollectionField();
  const updateFieldMutation = useUpdateCollectionField();
  const deleteFieldMutation = useDeleteCollectionField();

  const createRecordMutation = useCreateCollectionRecord();
  const updateRecordMutation = useUpdateCollectionRecord();
  const deleteRecordMutation = useDeleteCollectionRecord();

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<ApiCollectionField | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ApiCollectionRecord | undefined>();
  const [deleteRecordConfirm, setDeleteRecordConfirm] = useState<{ id: string } | null>(null);

  const handleCreateField = async (data: Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) => {
    if (!tenantId || !collectionId) {return;}

    try {
      await createFieldMutation.mutateAsync({
        tenantId,
        collectionId,
        ...data,
      });

      toast({
        title: "Field created",
        description: `${data.name} has been added to the collection.`,
      });

      setFieldModalOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create field",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateField = async (data: Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) => {
    if (!tenantId || !collectionId || !editingField) {return;}

    try {
      await updateFieldMutation.mutateAsync({
        tenantId,
        collectionId,
        fieldId: editingField.id,
        name: data.name,
        slug: data.slug,
        isRequired: data.isRequired,
        options: data.options,
        defaultValue: data.defaultValue,
      });

      toast({
        title: "Field updated",
        description: `${data.name} has been updated.`,
      });

      setEditingField(undefined);
      setFieldModalOpen(false);
    } catch (error) {
      toast({
        title: "Failed to update field",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteField = async () => {
    if (!deleteConfirm || !tenantId || !collectionId) {return;}

    try {
      await deleteFieldMutation.mutateAsync({
        tenantId,
        collectionId,
        fieldId: deleteConfirm.id,
      });

      toast({
        title: "Field deleted",
        description: `${deleteConfirm.name} has been removed from the collection.`,
      });

      setDeleteConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete field",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleEditField = (field: ApiCollectionField) => {
    setEditingField(field);
    setFieldModalOpen(true);
  };

  const handleFieldModalClose = (open: boolean) => {
    if (!open) {
      setEditingField(undefined);
    }
    setFieldModalOpen(open);
  };

  const handleCreateRecord = async (data: Record<string, any>) => {
    if (!tenantId || !collectionId) {return;}

    try {
      await createRecordMutation.mutateAsync({
        tenantId,
        collectionId,
        data,
      });

      toast({
        title: "Record created",
        description: "The record has been added to the collection.",
      });

      setRecordModalOpen(false);
      setEditingRecord(undefined);
    } catch (error) {
      toast({
        title: "Failed to create record",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleUpdateRecord = async (data: Record<string, any>) => {
    if (!tenantId || !collectionId || !editingRecord) {return;}

    try {
      await updateRecordMutation.mutateAsync({
        tenantId,
        collectionId,
        recordId: editingRecord.id,
        data,
      });

      toast({
        title: "Record updated",
        description: "The record has been updated successfully.",
      });

      setRecordModalOpen(false);
      setEditingRecord(undefined);
    } catch (error) {
      toast({
        title: "Failed to update record",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRecord = async () => {
    if (!deleteRecordConfirm || !tenantId || !collectionId) {return;}

    try {
      await deleteRecordMutation.mutateAsync({
        tenantId,
        collectionId,
        recordId: deleteRecordConfirm.id,
      });

      toast({
        title: "Record deleted",
        description: "The record has been removed from the collection.",
      });

      setDeleteRecordConfirm(null);
    } catch (error) {
      toast({
        title: "Failed to delete record",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleEditRecord = (record: ApiCollectionRecord) => {
    setEditingRecord(record);
    setRecordModalOpen(true);
  };

  const handleRecordModalClose = (open: boolean) => {
    if (!open) {
      setEditingRecord(undefined);
    }
    setRecordModalOpen(open);
  };

  if (loadingCollection || loadingFields) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Collection not found</h1>
          <Button onClick={() => setLocation("/data")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Collections
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/data")}
          title="Back to collections"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
            {collection.description && (
              <p className="text-muted-foreground mt-1">{collection.description}</p>
            )}
            <code className="text-xs text-muted-foreground mt-1 block">slug: {collection.slug}</code>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fields" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fields">
            Fields ({fields?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="records">
            Records ({(recordsData as any)?.total || 0})
          </TabsTrigger>
        </TabsList>

        {/* Fields Tab */}
        <TabsContent value="fields" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Define the structure of your data by adding fields
            </p>
            <Button onClick={() => setFieldModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>

          <FieldsList
            fields={fields || []}
            onEdit={handleEditField}
            onDelete={(id) => {
              const field = fields?.find(f => f.id === id);
              if (field) {
                setDeleteConfirm({ id, name: field.name });
              }
            }}
          />
        </TabsContent>

        {/* Records Tab */}
        <TabsContent value="records" className="space-y-4">
          {fields && fields.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Please add fields to this collection before adding records.</p>
            </div>
          ) : (
            <RecordsList
              records={(recordsData as any)?.records || []}
              fields={fields || []}
              isLoading={loadingRecords}
              page={recordsPage}
              pageSize={recordsPageSize}
              totalRecords={(recordsData as any)?.total || 0}
              onPageChange={setRecordsPage}
              onRecordClick={handleEditRecord}
              onAddRecord={() => setRecordModalOpen(true)}
              onDelete={(id) => setDeleteRecordConfirm({ id })}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Field Modal */}
      <CreateFieldModal
        open={fieldModalOpen}
        onOpenChange={handleFieldModalClose}
        onSubmit={editingField ? handleUpdateField : handleCreateField}
        isLoading={createFieldMutation.isPending || updateFieldMutation.isPending}
        field={editingField}
      />

      {/* Delete Field Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the field <strong>{deleteConfirm?.name}</strong>?
              This will remove the field from all records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFieldMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete Field
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Record Modal */}
      <RecordEditorModal
        open={recordModalOpen}
        onOpenChange={handleRecordModalClose}
        fields={fields || []}
        record={editingRecord}
        onSubmit={editingRecord ? handleUpdateRecord : handleCreateRecord}
        isLoading={createRecordMutation.isPending || updateRecordMutation.isPending}
      />

      {/* Delete Record Confirmation Dialog */}
      <AlertDialog open={!!deleteRecordConfirm} onOpenChange={() => setDeleteRecordConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecord}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRecordMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
