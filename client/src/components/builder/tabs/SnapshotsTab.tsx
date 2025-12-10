/**
 * SnapshotsTab - Manage workflow test snapshots
 * Fully integrated with backend API for snapshot management
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Camera, Plus, Trash2, Eye, Play, Edit2, AlertCircle, AlertTriangle } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePreviewStore } from "@/store/preview";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useSnapshots,
  useRenameSnapshot,
  useDeleteSnapshot,
} from "@/lib/vault-hooks";
import { runAPI, type ApiSnapshot } from "@/lib/vault-api";

interface SnapshotsTabProps {
  workflowId: string;
}

export function SnapshotsTab({ workflowId }: SnapshotsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const setPreviewToken = usePreviewStore((s) => s.setToken);

  // Fetch snapshots from API
  const { data: snapshots, isLoading, error } = useSnapshots(workflowId);
  const renameSnapshot = useRenameSnapshot();
  const deleteSnapshot = useDeleteSnapshot();

  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ApiSnapshot | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  // Handle rename snapshot
  const handleRename = async () => {
    if (!selectedSnapshot || !newName.trim()) return;

    try {
      await renameSnapshot.mutateAsync({
        workflowId,
        snapshotId: selectedSnapshot.id,
        name: newName.trim(),
      });
      toast({ title: "Success", description: "Snapshot renamed" });
      setRenameDialogOpen(false);
      setSelectedSnapshot(null);
      setNewName("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rename snapshot",
        variant: "destructive",
      });
    }
  };

  // Handle delete snapshot
  const handleDelete = async () => {
    if (!selectedSnapshot) return;

    try {
      await deleteSnapshot.mutateAsync({
        workflowId,
        snapshotId: selectedSnapshot.id,
      });
      toast({ title: "Success", description: "Snapshot deleted" });
      setDeleteDialogOpen(false);
      setSelectedSnapshot(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete snapshot",
        variant: "destructive",
      });
    }
  };

  // Handle preview with snapshot (navigate to new WorkflowPreview with snapshot parameter)
  const handlePreview = async (snapshot: ApiSnapshot) => {
    toast({
      title: "Preview Started",
      description: `Running with snapshot "${snapshot.name}"`,
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
    setNewName(snapshot.name);
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
          <h2 className="text-lg font-semibold">Test Snapshots</h2>
          <p className="text-sm text-muted-foreground">
            Preview and manage saved workflow test data. Create snapshots from the preview page.
          </p>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load snapshots: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading snapshots...</div>
          </div>
        ) : snapshots && snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Camera className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No snapshots yet</h3>
            <p className="text-sm text-muted-foreground">
              Create snapshots from the preview page to save test data for this workflow
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Values</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots?.map((snapshot) => {
                const valueCount = Object.keys(snapshot.values).length;
                // Show outdated indicator if no versionHash (old snapshot) or hash missing
                const isOutdated = !snapshot.versionHash;

                return (
                  <TableRow key={snapshot.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {snapshot.name}
                        {isOutdated && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                            title="Snapshot may be outdated - created before versioning was enabled"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span className="hidden sm:inline">May be outdated</span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {valueCount} {valueCount === 1 ? 'value' : 'values'}
                    </TableCell>
                    <TableCell>{new Date(snapshot.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handlePreview(snapshot)}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Preview
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleView(snapshot)}>
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleOpenRename(snapshot)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleOpenDelete(snapshot)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Snapshot</DialogTitle>
              <DialogDescription>Change the name of this snapshot</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rename">Snapshot Name</Label>
                <Input
                  id="rename"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRenameDialogOpen(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={renameSnapshot.isPending || !newName.trim()}>
                {renameSnapshot.isPending ? "Renaming..." : "Rename"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Snapshot</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{selectedSnapshot?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteSnapshot.isPending}>
                {deleteSnapshot.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog with JSON */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedSnapshot?.name}</DialogTitle>
              <DialogDescription>
                {Object.keys(selectedSnapshot?.values || {}).length} stored values
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <pre className="p-4 bg-muted rounded-lg text-xs">
                {JSON.stringify(selectedSnapshot?.values, null, 2)}
              </pre>
            </div>
            <DialogFooter>
              <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}
