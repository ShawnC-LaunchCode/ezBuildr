// @ts-nocheck
/**
 * SnapshotsTab - Manage workflow test snapshots
 * Fully integrated with backend API for snapshot management
 */
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { type ApiSnapshot } from "@/lib/vault-api";
import {
  useSnapshots,
  useRenameSnapshot,
  useDeleteSnapshot,
} from "@/lib/vault-hooks";
import { usePreviewStore } from "@/store/preview";

import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";

import { DeleteSnapshotDialog } from "./snapshots/DeleteSnapshotDialog";
import { RenameSnapshotDialog } from "./snapshots/RenameSnapshotDialog";
import { SnapshotsTable } from "./snapshots/SnapshotsTable";
import { ViewSnapshotDialog } from "./snapshots/ViewSnapshotDialog";


interface SnapshotsTabProps {
  workflowId: string;
}

export function SnapshotsTab({ workflowId }: SnapshotsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const _setPreviewToken = usePreviewStore((s) => s.setToken);

  // Fetch snapshots from API
  const { data: snapshots, isLoading, error } = useSnapshots(workflowId);
  const renameSnapshot = useRenameSnapshot();
  const deleteSnapshot = useDeleteSnapshot();

  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ApiSnapshot | null>(null);

  // Handle rename snapshot
  const handleRename = async (newName: string) => {
    if (!selectedSnapshot) {return;}

    try {
      await renameSnapshot.mutateAsync({
        workflowId,
        snapshotId: selectedSnapshot.id,
        name: newName.trim(),
      });
      toast({ title: "Success", description: "Snapshot renamed" });
      setRenameDialogOpen(false);
      setSelectedSnapshot(null);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to rename snapshot",
        variant: "destructive",
      });
    }
  };

  // Handle delete snapshot
  const handleDelete = async () => {
    if (!selectedSnapshot) {return;}

    try {
      await deleteSnapshot.mutateAsync({
        workflowId,
        snapshotId: selectedSnapshot.id,
      });
      toast({ title: "Success", description: "Snapshot deleted" });
      setDeleteDialogOpen(false);
      setSelectedSnapshot(null);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete snapshot",
        variant: "destructive",
      });
    }
  };

  // Handle preview with snapshot (navigate to new WorkflowPreview with snapshot parameter)
  const handlePreview = (snapshot: ApiSnapshot) => {
    toast({
      title: "Scenario Loaded",
      description: `Previewing scenario "${snapshot.name}"`,
    });
    // Navigate to workflow preview with snapshot ID
    setLocation(`/workflows/${workflowId}/preview?snapshotId=${snapshot.id}`);
  };

  // Handle view snapshot data
  const handleView = (snapshot: ApiSnapshot) => {
    setSelectedSnapshot(snapshot);
    setViewDialogOpen(true);
  };

  // Open rename dialog
  const handleOpenRename = (snapshot: ApiSnapshot) => {
    setSelectedSnapshot(snapshot);
    setRenameDialogOpen(true);
  };

  // Open delete confirmation
  const handleOpenDelete = (snapshot: ApiSnapshot) => {
    setSelectedSnapshot(snapshot);
    setDeleteDialogOpen(true);
  };

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div>
          <h2 className="text-lg font-semibold">Saved Scenarios</h2>
          <p className="text-sm text-muted-foreground">
            Save different client situations (e.g. &quot;Married with Kids&quot;) to quick-check your workflow logic.
          </p>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load scenarios: {error.message}
            </AlertDescription>
          </Alert>
        )}

        <SnapshotsTable
          snapshots={snapshots}
          isLoading={isLoading}
          onPreview={handlePreview}
          onView={handleView}
          onRename={handleOpenRename}
          onDelete={handleOpenDelete}
        />

        {/* Dialogs */}
        <RenameSnapshotDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          currentName={selectedSnapshot?.name ?? ""}
          onRename={handleRename}
          isRenaming={renameSnapshot.isPending}
        />

        <DeleteSnapshotDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          snapshotName={selectedSnapshot?.name ?? ""}
          onDelete={handleDelete}
          isDeleting={deleteSnapshot.isPending}
        />

        <ViewSnapshotDialog
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
          snapshot={selectedSnapshot}
        />
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}