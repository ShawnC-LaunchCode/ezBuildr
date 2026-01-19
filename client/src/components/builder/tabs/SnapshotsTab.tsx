/**
 * SnapshotsTab - Manage workflow test snapshots
 * Fully integrated with backend API for snapshot management
 */
import { Camera, Trash2, Eye, Play, Edit2, AlertCircle, AlertTriangle } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {  type ApiSnapshot } from "@/lib/vault-api";
import {
  useSnapshots,
  useRenameSnapshot,
  useDeleteSnapshot,
} from "@/lib/vault-hooks";
import { usePreviewStore } from "@/store/preview";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
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
    if (!selectedSnapshot || !newName.trim()) {return;}
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
    if (!selectedSnapshot) {return;}
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
          <h2 className="text-lg font-semibold">Saved Scenarios</h2>
          <p className="text-sm text-muted-foreground">
            Save different client situations (e.g. "Married with Kids") to quick-check your workflow logic.
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading scenarios...</div>
          </div>
        ) : snapshots && snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No saved scenarios yet</h3>
            <p className="text-sm text-muted-foreground text-center">
              Create a scenario by running a Preview. At any point, you can click "Save Scenario" to capture the current answers for later use.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario Name</TableHead>
                <TableHead>Data Points</TableHead>
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
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 px-1.5 py-0.5 rounded"
                            title="Scenario created on an older version of this workflow"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span className="hidden sm:inline">Needs Update</span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {valueCount} {valueCount === 1 ? 'answer' : 'answers'}
                    </TableCell>
                    <TableCell>{new Date(snapshot.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => { void handlePreview(snapshot); }}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run Scenario
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { void handleView(snapshot); }}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { void handleOpenRename(snapshot); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { void handleOpenDelete(snapshot); }}>
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
              <DialogTitle>Rename Scenario</DialogTitle>
              <DialogDescription>Give this scenario a descriptive name (e.g. "Scenario A: High Net Worth")</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rename">Scenario Name</Label>
                <Input
                  id="rename"
                  value={newName}
                  onChange={(e) => { void setNewName(e.target.value); }}
                  onKeyDown={(e) => { void e.key === "Enter" && handleRename(); }}
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
              <Button onClick={() => { void handleRename(); }} disabled={renameSnapshot.isPending || !newName.trim()}>
                {renameSnapshot.isPending ? "Saving..." : "Save Name"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Scenario</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{selectedSnapshot?.name}"?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { void setDeleteDialogOpen(false); }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => { void handleDelete(); }} disabled={deleteSnapshot.isPending}>
                {deleteSnapshot.isPending ? "Deleting..." : "Delete Scenario"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* View Dialog with JSON */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedSnapshot?.name} (Data View)</DialogTitle>
              <DialogDescription>
                {Object.keys(selectedSnapshot?.values || {}).length} stored values in this scenario
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <pre className="p-4 bg-muted rounded-lg text-xs font-mono">
                {JSON.stringify(selectedSnapshot?.values, null, 2)}
              </pre>
            </div>
            <DialogFooter>
              <Button onClick={() => { void setViewDialogOpen(false); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}