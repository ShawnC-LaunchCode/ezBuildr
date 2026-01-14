/**
 * ProjectView Page
 * Displays a single project with its contained workflows
 */

import { ArrowLeft, Plus, Edit } from "lucide-react";
import React, { useState } from "react";
import { Link, useParams, useLocation } from "wouter";

import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import {
  useProject,
  useUpdateProject,
  useArchiveProject,
  useDeleteProject,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useMoveWorkflow,
} from "@/lib/vault-hooks";

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Dialog states
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);

  // Form states
  const [newWorkflow, setNewWorkflow] = useState({ title: "", description: "" });
  const [editProject, setEditProject] = useState({ title: "", description: "" });

  // Data queries
  const { data: projectWithWorkflows, isLoading } = useProject(id);

  // Mutations
  const updateProjectMutation = useUpdateProject();
  const archiveProjectMutation = useArchiveProject();
  const deleteProjectMutation = useDeleteProject();
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const moveWorkflowMutation = useMoveWorkflow();

  // Handlers
  const handleCreateWorkflow = async () => {
    if (!newWorkflow.title.trim()) {
      toast({ title: "Error", description: "Workflow title is required", variant: "destructive" });
      return;
    }

    try {
      const workflow = await createWorkflowMutation.mutateAsync({
        ...newWorkflow,
        projectId: id,
      });
      toast({ title: "Success", description: "Workflow created successfully" });
      setIsCreateWorkflowOpen(false);
      setNewWorkflow({ title: "", description: "" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
    }
  };

  const handleUpdateProject = async () => {
    if (!editProject.title.trim()) {
      toast({ title: "Error", description: "Project title is required", variant: "destructive" });
      return;
    }

    try {
      await updateProjectMutation.mutateAsync({
        id: id,
        ...editProject,
      });
      toast({ title: "Success", description: "Project updated successfully" });
      setIsEditProjectOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  };

  const handleArchiveWorkflow = async (workflowId: string) => {
    try {
      await updateWorkflowMutation.mutateAsync({ id: workflowId, status: "archived" });
      toast({ title: "Success", description: "Workflow archived" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive workflow", variant: "destructive" });
    }
  };

  const handleActivateWorkflow = async (workflowId: string) => {
    try {
      await updateWorkflowMutation.mutateAsync({ id: workflowId, status: "active" });
      toast({ title: "Success", description: "Workflow activated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to activate workflow", variant: "destructive" });
    }
  };

  const handleMoveWorkflowOut = async (workflow: ApiWorkflow) => {
    try {
      await moveWorkflowMutation.mutateAsync({
        id: workflow.id,
        projectId: null,
      });
      toast({ title: "Success", description: "Workflow moved out of project" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to move workflow", variant: "destructive" });
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!deleteWorkflowId) {return;}

    try {
      await deleteWorkflowMutation.mutateAsync(deleteWorkflowId);
      toast({ title: "Success", description: "Workflow deleted" });
      setDeleteWorkflowId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete workflow", variant: "destructive" });
    }
  };

  const openEditDialog = () => {
    if (projectWithWorkflows) {
      setEditProject({
        title: projectWithWorkflows.title,
        description: projectWithWorkflows.description || "",
      });
      setIsEditProjectOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-8 max-w-7xl">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <div className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!projectWithWorkflows) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-8 max-w-7xl">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <h3 className="text-lg font-semibold mb-2">Project not found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                The project you're looking for doesn't exist or you don't have access to it.
              </p>
              <Link href="/workflows">
                <Button>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Workflows
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header with breadcrumb */}
        <div className="mb-8">
          <Link href="/workflows">
            <Button variant="ghost" className="mb-4 -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Workflows
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{projectWithWorkflows.title}</h1>
              {projectWithWorkflows.description && (
                <p className="text-muted-foreground mt-2">{projectWithWorkflows.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={openEditDialog}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Project
              </Button>
              <Button onClick={() => setIsCreateWorkflowOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Workflow
              </Button>
            </div>
          </div>
        </div>

        {/* Workflows Grid */}
        {projectWithWorkflows.workflows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <h3 className="text-lg font-semibold mb-2">No workflows in this project</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Get started by creating your first workflow in this project
              </p>
              <Button onClick={() => setIsCreateWorkflowOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projectWithWorkflows.workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onMove={handleMoveWorkflowOut}
                onArchive={handleArchiveWorkflow}
                onActivate={handleActivateWorkflow}
                onDelete={(id) => setDeleteWorkflowId(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update your project details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-title">Title *</Label>
              <Input
                id="project-title"
                placeholder="e.g., Customer Onboarding"
                value={editProject.title}
                onChange={(e) => setEditProject({ ...editProject, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateProject()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Optional description..."
                value={editProject.description}
                onChange={(e) => setEditProject({ ...editProject, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditProjectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProject} disabled={updateProjectMutation.isPending}>
              {updateProjectMutation.isPending ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workflow Dialog */}
      <Dialog open={isCreateWorkflowOpen} onOpenChange={setIsCreateWorkflowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>Create a new workflow in this project</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-title">Title *</Label>
              <Input
                id="workflow-title"
                placeholder="e.g., Onboarding Survey"
                value={newWorkflow.title}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleCreateWorkflow()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                placeholder="Optional description..."
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateWorkflowOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWorkflow} disabled={createWorkflowMutation.isPending}>
              {createWorkflowMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workflow Confirmation */}
      <AlertDialog open={!!deleteWorkflowId} onOpenChange={() => setDeleteWorkflowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All sections, steps, blocks, and runs will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkflow}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteWorkflowMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
