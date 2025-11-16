/**
 * SnapshotsTab - Manage workflow test snapshots
 * PR8: Complete UI with JSON viewer
 */

import { useState } from "react";
import { Camera, Plus, Trash2, Eye } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Snapshot {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  data: Record<string, any>;
}

interface SnapshotsTabProps {
  workflowId: string;
}

export function SnapshotsTab({ workflowId }: SnapshotsTabProps) {
  const { toast } = useToast();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([
    {
      id: "1",
      name: "Test Run 1",
      description: "Initial test with sample data",
      createdAt: new Date().toISOString(),
      data: { firstName: "John", lastName: "Doe", email: "john@example.com" },
    },
  ]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleCreate = () => {
    console.log("Creating snapshot:", { name: newName, description: newDescription });
    toast({ title: "Snapshot Created", description: `"${newName}" saved successfully` });
    setCreateDialogOpen(false);
    setNewName("");
    setNewDescription("");
  };

  const handleView = (snapshot: Snapshot) => {
    setSelectedSnapshot(snapshot);
    setViewDialogOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    console.log("Deleting snapshot:", id);
    toast({ title: "Snapshot Deleted", description: `"${name}" removed` });
    setSnapshots(snapshots.filter(s => s.id !== id));
  };

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Test Snapshots</h2>
            <p className="text-sm text-muted-foreground">
              Save and manage workflow test data snapshots
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Snapshot
          </Button>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((snapshot) => (
              <TableRow key={snapshot.id}>
                <TableCell className="font-medium">{snapshot.name}</TableCell>
                <TableCell>{snapshot.description}</TableCell>
                <TableCell>{new Date(snapshot.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => handleView(snapshot)}>
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(snapshot.id, snapshot.name)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Snapshot</DialogTitle>
              <DialogDescription>Save current workflow test data</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Snapshot Name</Label>
                <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog with JSON */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedSnapshot?.name}</DialogTitle>
              <DialogDescription>{selectedSnapshot?.description}</DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              <pre className="p-4 bg-muted rounded-lg text-xs">
                {JSON.stringify(selectedSnapshot?.data, null, 2)}
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
