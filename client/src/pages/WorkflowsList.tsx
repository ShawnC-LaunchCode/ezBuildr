import {   useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Wand2, ChevronDown, FolderPlus, Link as LinkIcon, Play, Loader2, ArrowRightLeft } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Link } from "wouter";

import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { TransferOwnershipDialog } from "@/components/dialogs/TransferOwnershipDialog";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCreateSampleWorkflow } from "@/lib/sample-workflow";
import { workflowAPI } from "@/lib/vault-api";
import { useUnfiledWorkflows, useDeleteWorkflow, useProjects, useDeleteProject, useCreateProject, useTransferWorkflow, useTransferProject } from "@/lib/vault-hooks";
import type {  } from "@shared/schema";
export default function WorkflowsList() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const createSampleMutation = useCreateSampleWorkflow();
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [transferringWorkflow, setTransferringWorkflow] = useState<{ id: string; title: string } | null>(null);
  const [transferringProject, setTransferringProject] = useState<{ id: string; title: string } | null>(null);
  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);
  const { data: unfiledWorkflows, isLoading: workflowsLoading } = useUnfiledWorkflows();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const deleteProjectMutation = useDeleteProject();
  const transferWorkflowMutation = useTransferWorkflow();
  const transferProjectMutation = useTransferProject();
  const createProjectMutation = useCreateProject(); // Use shared hook with correct invalidation
  // Wrap the shared mutation to handle toast/reset logic locally
  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }
    createProjectMutation.mutate({
      title: newProjectName,
      description: newProjectDescription || undefined,
    }, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Project created successfully",
        });
        setIsProjectDialogOpen(false);
        setNewProjectName("");
        setNewProjectDescription("");
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to create project",
          variant: "destructive",
        });
      },
    });
  };
  const handleDeleteWorkflow = (workflowId: string) => {
    setDeletingWorkflowId(workflowId);
    deleteWorkflowMutation.mutate(workflowId, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Workflow deleted successfully",
        });
        setDeletingWorkflowId(null);
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete workflow",
          variant: "destructive",
        });
        setDeletingWorkflowId(null);
      },
    });
  };
  const handleDeleteProject = (projectId: string) => {
    setDeletingProjectId(projectId);
    deleteProjectMutation.mutate(projectId, {
      onSuccess: () => {
        toast({
          title: "Success",
          description: "Project deleted successfully",
        });
        setDeletingProjectId(null);
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete project",
          variant: "destructive",
        });
        setDeletingProjectId(null);
      },
    });
  };
  const handleTransferWorkflow = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => {
    if (!transferringWorkflow) {return;}
    try {
      await transferWorkflowMutation.mutateAsync({
        id: transferringWorkflow.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({
        title: "Success",
        description: `Workflow transferred successfully`,
      });
      setTransferringWorkflow(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to transfer workflow",
        variant: "destructive",
      });
      throw error;
    }
  };
  const handleTransferProject = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => {
    if (!transferringProject) {return;}
    try {
      await transferProjectMutation.mutateAsync({
        id: transferringProject.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({
        title: "Success",
        description: `Project transferred successfully (all workflows also transferred)`,
      });
      setTransferringProject(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to transfer project",
        variant: "destructive",
      });
      throw error;
    }
  };
  const handleCopyLink = async (workflowId: string) => {
    try {
      const { publicUrl } = await workflowAPI.getPublicLink(workflowId);
      await navigator.clipboard.writeText(publicUrl);
      toast({
        title: "Link copied!",
        description: "The workflow link has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Failed to copy link",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };
  if (isLoading || !isAuthenticated) {
    return null;
  }
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="My Workflows"
          description="Create, manage, and run your workflows"
          actions={
            <div className="flex items-center">
              <DropdownMenu>
                <div className="flex">
                  <Link href="/workflows/new">
                    <Button
                      data-testid="button-create-workflow"
                      className="bg-indigo-600 hover:bg-indigo-700 rounded-r-none border-r border-indigo-500"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Workflow
                    </Button>
                  </Link>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700 rounded-l-none px-2"
                      data-testid="button-create-dropdown"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/workflows/new" className="cursor-pointer">
                      <Plus className="w-4 h-4 mr-2" />
                      New Workflow
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { void setIsProjectDialogOpen(true); }}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    New Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Projects and Workflows Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {(projectsLoading || workflowsLoading) ? (
              <SkeletonCard count={6} height="h-48" />
            ) : (projects && projects.length > 0) || (unfiledWorkflows && unfiledWorkflows.length > 0) ? (
              <>
                {/* Projects - shown first */}
                {projects?.filter(p => p.title !== 'Other Project').map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    currentUserId={user?.id}
                    onTransfer={(id, title) => setTransferringProject({ id, title })}
                    onDelete={(id) => setDeletingProjectId(id)}
                  />
                ))}
                {/* Workflows */}
                {unfiledWorkflows?.map((workflow) => (
                  <Card key={workflow.id} className="hover:shadow-md transition-shadow min-h-[220px]">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg font-semibold text-foreground line-clamp-2" data-testid={`text-workflow-title-${workflow.id}`}>
                          {workflow.title}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {user?.id && workflow.creatorId !== user.id ? (
                            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200 text-xs px-1.5 h-5">Shared</Badge>
                          ) : null}
                          <StatusBadge status={workflow.status} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {workflow.description && (
                        <p className="text-muted-foreground text-sm mb-4 line-clamp-3" data-testid={`text-workflow-description-${workflow.id}`}>
                          {workflow.description}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Created: {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'Unknown'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Link href={`/workflows/${workflow.id}/builder`}>
                            <Button variant="outline" size="sm" data-testid={`button-edit-workflow-${workflow.id}`}>
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { void handleCopyLink(workflow.id); }}
                            data-testid={`button-copy-link-workflow-${workflow.id}`}
                          >
                            <LinkIcon className="w-4 h-4 mr-1" />
                            Copy Link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { void setTransferringWorkflow({ id: workflow.id, title: workflow.title }); }}
                            data-testid={`button-transfer-workflow-${workflow.id}`}
                          >
                            <ArrowRightLeft className="w-4 h-4 mr-1" />
                            Transfer
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-workflow-${workflow.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{workflow.title}"? This action cannot be undone.
                                  All sections, steps, and run data will be permanently deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-cancel-delete-${workflow.id}`}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => { void handleDeleteWorkflow(workflow.id); }}
                                  disabled={deletingWorkflowId === workflow.id}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  data-testid={`button-confirm-delete-${workflow.id}`}
                                >
                                  {deletingWorkflowId === workflow.id ? "Deleting..." : "Delete Workflow"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <div className="col-span-full">
                <Card className="border-dashed bg-muted/40">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
                      <Wand2 className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2" data-testid="text-no-workflows">
                      Start your first workflow
                    </h3>
                    <p className="text-muted-foreground text-center mb-8 max-w-md text-sm leading-relaxed">
                      ezBuildr helps you build powerful data collection workflows. Create one from scratch or explore a sample to see how it works.
                    </p>
                    <div className="flex items-center gap-3">
                      <Link href="/workflows/new">
                        <Button data-testid="button-create-first-workflow" className="bg-indigo-600 hover:bg-indigo-700 min-w-[140px]">
                          <Plus className="w-4 h-4 mr-2" />
                          New Workflow
                        </Button>
                      </Link>
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">or</span>
                      <Button
                        variant="outline"
                        onClick={() => { void createSampleMutation.mutate(); }}
                        disabled={createSampleMutation.isPending}
                        className="bg-background min-w-[140px]"
                      >
                        {createSampleMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 mr-2 text-emerald-600" />
                        )}
                        Explore Sample
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
      {/* Delete Project Confirmation Dialog */}
      {deletingProjectId && (
        <AlertDialog open={!!deletingProjectId} onOpenChange={() => setDeletingProjectId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this project? This action cannot be undone.
                All workflows within this project will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { void handleDeleteProject(deletingProjectId); }}
                disabled={deleteProjectMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {/* New Project Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Projects help you organize related workflows together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                placeholder="Enter project name"
                value={newProjectName}
                onChange={(e) => { void setNewProjectName(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateProject();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Enter project description (optional)"
                value={newProjectDescription}
                onChange={(e) => { void setNewProjectDescription(e.target.value); }}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsProjectDialogOpen(false);
                setNewProjectName("");
                setNewProjectDescription("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => { void handleCreateProject(); }}
              disabled={createProjectMutation.isPending || !newProjectName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Transfer Ownership Dialog - Workflow */}
      {transferringWorkflow && (
        <TransferOwnershipDialog
          open={!!transferringWorkflow}
          onOpenChange={(open) => !open && setTransferringWorkflow(null)}
          assetType="workflow"
          assetName={transferringWorkflow.title}
          onTransfer={handleTransferWorkflow}
          isPending={transferWorkflowMutation.isPending}
        />
      )}
      {/* Transfer Ownership Dialog - Project */}
      {transferringProject && (
        <TransferOwnershipDialog
          open={!!transferringProject}
          onOpenChange={(open) => !open && setTransferringProject(null)}
          assetType="project"
          assetName={transferringProject.title}
          onTransfer={handleTransferProject}
          isPending={transferProjectMutation.isPending}
        />
      )}
    </div>
  );
}