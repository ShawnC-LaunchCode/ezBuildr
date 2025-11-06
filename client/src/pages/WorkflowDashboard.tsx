/**
 * Workflow Dashboard
 * Lists workflows, allows creation, shows recent runs
 */

import { useState } from "react";
import { Link } from "wouter";
import { Plus, Workflow as WorkflowIcon, Play, Archive, MoreVertical } from "lucide-react";
import { useWorkflows, useCreateWorkflow, useDeleteWorkflow, useUpdateWorkflow } from "@/lib/vault-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function WorkflowDashboard() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newWorkflow, setNewWorkflow] = useState({ title: "", description: "" });

  const { data: workflows, isLoading } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const updateMutation = useUpdateWorkflow();
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!newWorkflow.title.trim()) {
      toast({ title: "Error", description: "Workflow title is required", variant: "destructive" });
      return;
    }

    try {
      await createMutation.mutateAsync(newWorkflow);
      toast({ title: "Success", description: "Workflow created successfully" });
      setIsCreateOpen(false);
      setNewWorkflow({ title: "", description: "" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync(deleteId);
      toast({ title: "Success", description: "Workflow deleted" });
      setDeleteId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete workflow", variant: "destructive" });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, status: "archived" });
      toast({ title: "Success", description: "Workflow archived" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive workflow", variant: "destructive" });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, status: "active" });
      toast({ title: "Success", description: "Workflow activated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to activate workflow", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage workflow automation logic
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>

        {/* Empty State */}
        {!isLoading && workflows?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <WorkflowIcon className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Get started by creating your first workflow
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Workflow Grid */}
        {workflows && workflows.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="group hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link href={`/workflows/${workflow.id}/builder`}>
                        <CardTitle className="text-xl hover:text-primary cursor-pointer">
                          {workflow.title}
                        </CardTitle>
                      </Link>
                      <CardDescription className="mt-1 line-clamp-2">
                        {workflow.description || "No description"}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/workflows/${workflow.id}/builder`}>
                            Edit Builder
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {workflow.status === "draft" || workflow.status === "archived" ? (
                          <DropdownMenuItem onClick={() => handleActivate(workflow.id)}>
                            <Play className="w-4 h-4 mr-2" />
                            Activate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleArchive(workflow.id)}>
                            <Archive className="w-4 h-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(workflow.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={workflow.status === "active" ? "default" : workflow.status === "draft" ? "secondary" : "outline"}>
                      {workflow.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Give your workflow a name and optional description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Customer Onboarding"
                value={newWorkflow.title}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description..."
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All sections, steps, blocks, and runs will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
