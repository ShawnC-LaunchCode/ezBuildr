/**
 * Workflow Dashboard
 * Lists projects and workflows, allows creation, shows hierarchy
 */
import { Plus, Workflow as WorkflowIcon, Folder } from "lucide-react";
import { useState } from "react";

import { CreateProjectDialog } from "@/components/dashboard/dialogs/CreateProjectDialog";
import { CreateWorkflowDialog } from "@/components/dashboard/dialogs/CreateWorkflowDialog";
import { MoveWorkflowDialog } from "@/components/dashboard/dialogs/MoveWorkflowDialog";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { CopyAssetDialog } from "@/components/dialogs/CopyAssetDialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { ApiAssetCopyOptions, ApiProject, ApiWorkflow } from "@/lib/vault-api";
import {
  useProjects,
  useUnfiledWorkflows,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useArchiveProject,
  useCopyProject,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useMoveWorkflow,
  useCopyWorkflow,
} from "@/lib/vault-hooks";
// eslint-disable-next-line max-lines-per-function, complexity
export default function WorkflowDashboard() {
  // Dialog states
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false);
  const [isMoveWorkflowOpen, setIsMoveWorkflowOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ApiProject | null>(null);
  const [movingWorkflow, setMovingWorkflow] = useState<ApiWorkflow | null>(null);
  const [copyingProject, setCopyingProject] = useState<ApiProject | null>(null);
  const [copyingWorkflow, setCopyingWorkflow] = useState<ApiWorkflow | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);

  // Data queries
  const { data: projects, isLoading: projectsLoading } = useProjects(true); // active only
  const { data: unfiledWorkflows, isLoading: workflowsLoading } = useUnfiledWorkflows();

  // Mutations
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const archiveProjectMutation = useArchiveProject();
  const copyProjectMutation = useCopyProject();
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const moveWorkflowMutation = useMoveWorkflow();
  const copyWorkflowMutation = useCopyWorkflow();
  const { toast } = useToast();

  // Project handlers
  const handleCreateProject = async (data: { title: string; description: string }) => {
    if (!data.title.trim()) {
      toast({ title: "Error", description: "Project title is required", variant: "destructive" });
      return;
    }
    try {
      await createProjectMutation.mutateAsync(data);
      toast({ title: "Success", description: "Project created successfully" });
      setIsCreateProjectOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
    }
  };

  const handleUpdateProject = async (data: { title: string; description: string }) => {
    if (!editingProject) {return;}
    if (!data.title.trim()) {
      toast({ title: "Error", description: "Project title is required", variant: "destructive" });
      return;
    }
    try {
      await updateProjectMutation.mutateAsync({
        id: editingProject.id,
        ...data,
      });
      toast({ title: "Success", description: "Project updated successfully" });
      setEditingProject(null);
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
    if (!deleteProjectId) { return; }
    try {
      await deleteProjectMutation.mutateAsync(deleteProjectId);
      toast({ title: "Success", description: "Project deleted" });
      setDeleteProjectId(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
  };

  const handleCopyProject = async (options: ApiAssetCopyOptions) => {
    if (!copyingProject) { return; }
    try {
      const result = await copyProjectMutation.mutateAsync({ id: copyingProject.id, options });
      toast({
        title: "Project copied",
        description: `Copied ${result.workflows?.length ?? 0} workflow${(result.workflows?.length ?? 0) === 1 ? "" : "s"}.`,
      });
      setCopyingProject(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy project", variant: "destructive" });
      throw error;
    }
  };

  // Workflow handlers
  const handleCreateWorkflow = async (data: { title: string; description: string }) => {
    if (!data.title.trim()) {
      toast({ title: "Error", description: "Workflow title is required", variant: "destructive" });
      return;
    }
    try {
      await createWorkflowMutation.mutateAsync(data);
      toast({ title: "Success", description: "Workflow created successfully" });
      setIsCreateWorkflowOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!deleteWorkflowId) { return; }
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

  const handleMoveWorkflow = async (targetProjectId: string | null) => {
    if (!movingWorkflow) { return; }
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to move workflow", variant: "destructive" });
    }
  };

  const handleCopyWorkflow = async (options: ApiAssetCopyOptions) => {
    if (!copyingWorkflow) { return; }
    try {
      await copyWorkflowMutation.mutateAsync({ id: copyingWorkflow.id, options });
      toast({ title: "Success", description: "Workflow copied" });
      setCopyingWorkflow(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy workflow", variant: "destructive" });
      throw error;
    }
  };

  const openMoveDialog = (workflow: ApiWorkflow) => {
    setMovingWorkflow(workflow);
    setIsMoveWorkflowOpen(true);
  };

  const openEditProjectDialog = (project: ApiProject) => {
    setEditingProject(project);
  };

  const isLoading = projectsLoading || workflowsLoading;
  const hasContent = (projects && projects.length > 0) ?? (unfiledWorkflows && unfiledWorkflows.length > 0);

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
            <Button variant="outline" onClick={() => { setIsCreateProjectOpen(true); }}>
              <Folder className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <Button onClick={() => { setIsCreateWorkflowOpen(true); }}>
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
                <Button variant="outline" onClick={() => { setIsCreateProjectOpen(true); }}>
                  <Folder className="w-4 h-4 mr-2" />
                  Create Project
                </Button>
                <Button onClick={() => { setIsCreateWorkflowOpen(true); }}>
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
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      onArchive={handleArchiveProject}
                      onCopy={(id) => {
                        const found = projects.find((candidate) => candidate.id === id);
                        setCopyingProject(found ?? project);
                      }}
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
                      onCopy={setCopyingWorkflow}
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      onArchive={handleArchiveWorkflow}
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

      <CreateProjectDialog
        open={isCreateProjectOpen || !!editingProject}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateProjectOpen(false);
            setEditingProject(null);
          }
        }}
        editingProject={editingProject}
        onSubmit={editingProject ? handleUpdateProject : handleCreateProject}
        isLoading={createProjectMutation.isPending || updateProjectMutation.isPending}
      />

      <CreateWorkflowDialog
        open={isCreateWorkflowOpen}
        onOpenChange={setIsCreateWorkflowOpen}
        onSubmit={handleCreateWorkflow}
        isLoading={createWorkflowMutation.isPending}
      />

      <MoveWorkflowDialog
        open={isMoveWorkflowOpen}
        onOpenChange={setIsMoveWorkflowOpen}
        workflow={movingWorkflow}
        projects={projects ?? []}
        onSubmit={handleMoveWorkflow}
        isLoading={moveWorkflowMutation.isPending}
      />

      {copyingProject && (
        <CopyAssetDialog
          open={copyingProject !== null}
          onOpenChange={(open) => !open && setCopyingProject(null)}
          assetType="project"
          assetName={copyingProject.title}
          onCopy={handleCopyProject}
          isPending={copyProjectMutation.isPending}
        />
      )}

      {copyingWorkflow && (
        <CopyAssetDialog
          open={copyingWorkflow !== null}
          onOpenChange={(open) => !open && setCopyingWorkflow(null)}
          assetType="workflow"
          assetName={copyingWorkflow.title}
          onCopy={handleCopyWorkflow}
          isPending={copyWorkflowMutation.isPending}
        />
      )}

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
