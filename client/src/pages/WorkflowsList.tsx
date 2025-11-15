import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWorkflows, useDeleteWorkflow, useProjects, useDeleteProject } from "@/lib/vault-hooks";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Workflow } from "@shared/schema";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Link } from "wouter";
import { Plus, Edit, Trash2, PenSquare, Wand2, ChevronDown, FolderPlus } from "lucide-react";

export default function WorkflowsList() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

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

  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const deleteProjectMutation = useDeleteProject();

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
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
      name: newProjectName,
      description: newProjectDescription || undefined,
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
                  <DropdownMenuItem onClick={() => setIsProjectDialogOpen(true)}>
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
            ) : (projects && projects.length > 0) || (workflows && workflows.length > 0) ? (
              <>
                {/* Projects - shown first */}
                {projects?.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={(id) => setDeletingProjectId(id)}
                  />
                ))}

                {/* Workflows */}
                {workflows?.map((workflow) => (
                  <Card key={workflow.id} className="hover:shadow-md transition-shadow min-h-[220px]">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg font-semibold text-foreground line-clamp-2" data-testid={`text-workflow-title-${workflow.id}`}>
                          {workflow.title}
                        </CardTitle>
                        <StatusBadge status={workflow.status} />
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
                                  onClick={() => handleDeleteWorkflow(workflow.id)}
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
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center mb-4">
                      <Wand2 className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2" data-testid="text-no-workflows">
                      Create your first project or workflow
                    </h3>
                    <p className="text-muted-foreground text-center mb-6 max-w-md text-sm">
                      Build workflows with sections, steps, logic, and blocks. Organize them in projects.
                    </p>
                    <Link href="/workflows/new">
                      <Button data-testid="button-create-first-workflow" className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        New Workflow
                      </Button>
                    </Link>
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
                onClick={() => handleDeleteProject(deletingProjectId)}
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
                onChange={(e) => setNewProjectName(e.target.value)}
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
                onChange={(e) => setNewProjectDescription(e.target.value)}
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
              onClick={handleCreateProject}
              disabled={createProjectMutation.isPending || !newProjectName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
