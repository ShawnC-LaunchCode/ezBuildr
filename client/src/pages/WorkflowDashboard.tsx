/**
 * Workflow Dashboard
 * Lists projects and workflows, allows creation, shows hierarchy
 */
import { Plus, Workflow as WorkflowIcon, Folder } from "lucide-react";
import React, { useState } from "react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiProject, ApiWorkflow } from "@/lib/vault-api";
import {
  useProjects,
  useUnfiledWorkflows,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useMoveWorkflow,
} from "@/lib/vault-hooks";
export default function WorkflowDashboard() {
  // Dialog states
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false);
  const [isMoveWorkflowOpen, setIsMoveWorkflowOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ApiProject | null>(null);
  const [movingWorkflow, setMovingWorkflow] = useState<ApiWorkflow | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  // Form states
  const [newProject, setNewProject] = useState({ title: "", description: "" });
  const [newWorkflow, setNewWorkflow] = useState({ title: "", description: "" });
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  // Data queries
  const { data: projects, isLoading: projectsLoading } = useProjects(true); // active only
  const { data: unfiledWorkflows, isLoading: workflowsLoading } = useUnfiledWorkflows();
  // Mutations
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const archiveProjectMutation = useArchiveProject();
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const moveWorkflowMutation = useMoveWorkflow();
  const { toast } = useToast();
  // Project handlers
  const handleCreateProject = async () => {
    if (!newProject.title.trim()) {
      toast({ title: "Error", description: "Project title is required", variant: "destructive" });
      return;
    }
    try {
      await createProjectMutation.mutateAsync(newProject);
      toast({ title: "Success", description: "Project created successfully" });
      setIsCreateProjectOpen(false);
      setNewProject({ title: "", description: "" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    }
  };
  const handleUpdateProject = async () => {
    if (!editingProject || !newProject.title.trim()) {
      toast({ title: "Error", description: "Project title is required", variant: "destructive" });
      return;
    }
    try {
      await updateProjectMutation.mutateAsync({
        id: editingProject.id,
        ...newProject,
      });
      toast({ title: "Success", description: "Project updated successfully" });
      setEditingProject(null);
      setNewProject({ title: "", description: "" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  };
  const handleArchiveProject = async (id: string) => {
    try {
      await archiveProjectMutation.mutateAsync(id);
      toast({ title: "Success", description: "Project archived" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive project", variant: "destructive" });
    }
  };
  const handleDeleteProject = async () => {
    if (!deleteProjectId) {return;}
    try {
      await deleteProjectMutation.mutateAsync(deleteProjectId);
      toast({ title: "Success", description: "Project deleted" });
      setDeleteProjectId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
  };
  // Workflow handlers
  const handleCreateWorkflow = async () => {
    if (!newWorkflow.title.trim()) {
      toast({ title: "Error", description: "Workflow title is required", variant: "destructive" });
      return;
    }
    try {
      await createWorkflowMutation.mutateAsync(newWorkflow);
      toast({ title: "Success", description: "Workflow created successfully" });
      setIsCreateWorkflowOpen(false);
      setNewWorkflow({ title: "", description: "" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
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
  const handleArchiveWorkflow = async (id: string) => {
    try {
      await updateWorkflowMutation.mutateAsync({ id, status: "archived" });
      toast({ title: "Success", description: "Workflow archived" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive workflow", variant: "destructive" });
    }
  };
  const handleActivateWorkflow = async (id: string) => {
    try {
      await updateWorkflowMutation.mutateAsync({ id, status: "active" });
      toast({ title: "Success", description: "Workflow activated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to activate workflow", variant: "destructive" });
    }
  };
  const handleMoveWorkflow = async () => {
    if (!movingWorkflow) {return;}
    try {
      await moveWorkflowMutation.mutateAsync({
        id: movingWorkflow.id,
        projectId: targetProjectId,
      });
      toast({
        title: "Success",
        description: targetProjectId ? "Workflow moved to project" : "Workflow moved to unfiled",
      });
      setIsMoveWorkflowOpen(false);
      setMovingWorkflow(null);
      setTargetProjectId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to move workflow", variant: "destructive" });
    }
  };
  const openMoveDialog = (workflow: ApiWorkflow) => {
    setMovingWorkflow(workflow);
    setTargetProjectId(workflow.projectId);
    setIsMoveWorkflowOpen(true);
  };
  const openEditProjectDialog = (project: ApiProject) => {
    setEditingProject(project);
    setNewProject({ title: project.title, description: project.description || "" });
  };
  const isLoading = projectsLoading || workflowsLoading;
  const hasContent = (projects && projects.length > 0) || (unfiledWorkflows && unfiledWorkflows.length > 0);
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="text-muted-foreground mt-1">
              Organize workflows in projects and manage automation logic
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { void setIsCreateProjectOpen(true); }}>
              <Folder className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <Button onClick={() => { void setIsCreateWorkflowOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>
        {/* Empty State */}
        {!isLoading && !hasContent && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <WorkflowIcon className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects or workflows yet</h3>
              <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
                Get started by creating your first project to organize workflows, or create a workflow directly
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { void setIsCreateProjectOpen(true); }}>
                  <Folder className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
                <Button onClick={() => { void setIsCreateWorkflowOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Workflow
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <div className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        )}
        {/* Projects & Workflows Grid */}
        {!isLoading && hasContent && (
          <div className="space-y-8">
            {/* Projects Section */}
            {projects && projects.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Projects</h2>
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onEdit={openEditProjectDialog}
                      onArchive={handleArchiveProject}
                      onDelete={(id) => setDeleteProjectId(id)}
                    />
                  ))}
                </div>
              </section>
            )}
            {/* Unfiled Workflows Section */}
            {unfiledWorkflows && unfiledWorkflows.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Unfiled Workflows</h2>
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {unfiledWorkflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      onMove={openMoveDialog}
                      onArchive={handleArchiveWorkflow}
                      onActivate={handleActivateWorkflow}
                      onDelete={(id) => setDeleteWorkflowId(id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      {/* Create/Edit Project Dialog */}
      <Dialog
        open={isCreateProjectOpen || !!editingProject}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateProjectOpen(false);
            setEditingProject(null);
            setNewProject({ title: "", description: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>
              {editingProject
                ? "Update your project details"
                : "Create a new project to organize your workflows"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-title">Title *</Label>
              <Input
                id="project-title"
                placeholder="e.g., Customer Onboarding"
                value={newProject.title}
                onChange={(e) => { void setNewProject({ ...newProject, title: e.target.value }); }}
                onKeyDown={(e) =>
                  e.key === "Enter" && (editingProject ? handleUpdateProject() : handleCreateProject())
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Optional description..."
                value={newProject.description}
                onChange={(e) => { void setNewProject({ ...newProject, description: e.target.value }); }}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateProjectOpen(false);
                setEditingProject(null);
                setNewProject({ title: "", description: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingProject ? handleUpdateProject : handleCreateProject}
              disabled={createProjectMutation.isPending || updateProjectMutation.isPending}
            >
              {createProjectMutation.isPending || updateProjectMutation.isPending
                ? "Saving..."
                : editingProject
                  ? "Update"
                  : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create Workflow Dialog */}
      <Dialog open={isCreateWorkflowOpen} onOpenChange={setIsCreateWorkflowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Create a new workflow. You can move it to a project later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-title">Title *</Label>
              <Input
                id="workflow-title"
                placeholder="e.g., Onboarding Survey"
                value={newWorkflow.title}
                onChange={(e) => { void setNewWorkflow({ ...newWorkflow, title: e.target.value }); }}
                onKeyDown={(e) => { void e.key === "Enter" && handleCreateWorkflow(); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                placeholder="Optional description..."
                value={newWorkflow.description}
                onChange={(e) => { void setNewWorkflow({ ...newWorkflow, description: e.target.value }); }}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void setIsCreateWorkflowOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={() => { void handleCreateWorkflow(); }} disabled={createWorkflowMutation.isPending}>
              {createWorkflowMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Move Workflow Dialog */}
      <Dialog open={isMoveWorkflowOpen} onOpenChange={setIsMoveWorkflowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Workflow</DialogTitle>
            <DialogDescription>
              Move "{movingWorkflow?.title}" to a project or unfiled
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="target-project">Target Project</Label>
              <Select
                value={targetProjectId || "unfiled"}
                onValueChange={(value) => setTargetProjectId(value === "unfiled" ? null : value)}
              >
                <SelectTrigger id="target-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unfiled">Unfiled</SelectItem>
                  {projects?.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void setIsMoveWorkflowOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={() => { void handleMoveWorkflow(); }} disabled={moveWorkflowMutation.isPending}>
              {moveWorkflowMutation.isPending ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Project Confirmation */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The project will be deleted, but workflows inside will be moved to
              unfiled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleDeleteProject(); }}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              onClick={() => { void handleDeleteWorkflow(); }}
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