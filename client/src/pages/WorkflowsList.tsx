import { Plus, Wand2, ChevronDown, FolderPlus, Play, Loader2, Upload, SearchX } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";

import { buildProjectActions, buildWorkflowActions } from "@/components/dashboard/assetActions";
import { projectToAssetRow, workflowToAssetRow } from "@/components/dashboard/assetRows";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { CopyAssetDialog } from "@/components/dialogs/CopyAssetDialog";
import { MoveWorkflowDialog } from "@/components/dialogs/MoveWorkflowDialog";
import { TransferOwnershipDialog } from "@/components/dialogs/TransferOwnershipDialog";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { AssetTable } from "@/components/shared/AssetTable";
import { AssetToolbar } from "@/components/shared/AssetToolbar";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAssetBrowser } from "@/hooks/useAssetBrowser";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import { getOrgRestrictedActionReason, getOrgRoleForAsset } from "@/lib/ownership";
import { useCreateSampleWorkflow } from "@/lib/sample-workflow";
import type { ApiAssetCopyOptions, ApiProject, ApiWorkflow } from "@/lib/vault-api";
import { useUnfiledWorkflows, useDeleteWorkflow, useProjects, useDeleteProject, useCreateProject, useTransferWorkflow, useTransferProject, useCopyWorkflow, useCopyProject, useMoveWorkflow } from "@/lib/vault-hooks";

// eslint-disable-next-line max-lines-per-function, complexity
export default function WorkflowsList() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const createSampleMutation = useCreateSampleWorkflow();
  const [deletingWorkflow, setDeletingWorkflow] = useState<{ id: string; title: string } | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [transferringWorkflow, setTransferringWorkflow] = useState<{ id: string; title: string } | null>(null);
  const [transferringProject, setTransferringProject] = useState<{ id: string; title: string } | null>(null);
  const [copyingWorkflow, setCopyingWorkflow] = useState<{ id: string; title: string } | null>(null);
  const [copyingProject, setCopyingProject] = useState<{ id: string; title: string } | null>(null);
  const [movingWorkflow, setMovingWorkflow] = useState<ApiWorkflow | null>(null);

  const { search, setSearch, viewMode, setViewMode, sort, toggleSort, sortRows, matches } =
    useAssetBrowser("ezbuildr.workflows.view");

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
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: unfiledWorkflows, isLoading: workflowsLoading } = useUnfiledWorkflows();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: organizations, isLoading: organizationsLoading } = useOrganizations();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const deleteProjectMutation = useDeleteProject();
  const transferWorkflowMutation = useTransferWorkflow();
  const transferProjectMutation = useTransferProject();
  const copyWorkflowMutation = useCopyWorkflow();
  const copyProjectMutation = useCopyProject();
  const moveWorkflowMutation = useMoveWorkflow();
  const createProjectMutation = useCreateProject(); // Use shared hook with correct invalidation

  const transferringWorkflowAsset = useMemo(
    () => unfiledWorkflows?.find((workflow) => workflow.id === transferringWorkflow?.id),
    [transferringWorkflow?.id, unfiledWorkflows]
  );
  const transferringProjectAsset = useMemo(
    () => projects?.find((project) => project.id === transferringProject?.id),
    [projects, transferringProject?.id]
  );

  // "Other Project" is an internal bucket, not something the user filed anything into.
  const visibleProjects = useMemo(
    () => (projects ?? []).filter((project) => project.title !== "Other Project"),
    [projects]
  );
  const totalCount = visibleProjects.length + (unfiledWorkflows?.length ?? 0);
  const filteredProjects = useMemo(() => visibleProjects.filter(matches), [visibleProjects, matches]);
  const filteredWorkflows = useMemo(
    () => (unfiledWorkflows ?? []).filter(matches),
    [unfiledWorkflows, matches]
  );
  const resultCount = filteredProjects.length + filteredWorkflows.length;

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
      description: newProjectDescription ? newProjectDescription : undefined,
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
      onError: (error: unknown) => {
        toast({
          title: "Error",
          description: (error instanceof Error ? error.message : "Failed to create project"),
          variant: "destructive",
        });
      },
    });
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    deleteWorkflowMutation.mutate(workflowId, {
      onSuccess: () => {
        toast({ title: "Success", description: "Workflow deleted successfully" });
        setDeletingWorkflow(null);
      },
      onError: (error: unknown) => {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete workflow",
          variant: "destructive",
        });
        setDeletingWorkflow(null);
      },
    });
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProjectMutation.mutate(projectId, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project deleted successfully" });
        setDeletingProjectId(null);
      },
      onError: (error: unknown) => {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete project",
          variant: "destructive",
        });
        setDeletingProjectId(null);
      },
    });
  };

  const handleTransferWorkflow = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => {
    if (!transferringWorkflow) { return; }
    try {
      await transferWorkflowMutation.mutateAsync({
        id: transferringWorkflow.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({ title: "Success", description: `Workflow transferred successfully` });
      setTransferringWorkflow(null);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to transfer workflow",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleTransferProject = async (targetOwnerType: 'user' | 'org', targetOwnerUuid: string) => {
    if (!transferringProject) { return; }
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to transfer project",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleCopyWorkflow = async (options: ApiAssetCopyOptions) => {
    if (!copyingWorkflow) { return; }
    try {
      const result = await copyWorkflowMutation.mutateAsync({ id: copyingWorkflow.id, options });
      toast({
        title: "Workflow copied",
        description: result.copiedTables > 0
          ? `Copied ${result.copiedTables} table${result.copiedTables === 1 ? "" : "s"}.`
          : "Your workflow copy is ready.",
      });
      setCopyingWorkflow(null);
    } catch (error: unknown) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Failed to copy workflow",
        variant: "destructive",
      });
      throw error;
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
    } catch (error: unknown) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Failed to copy project",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleMoveWorkflow = async (projectId: string | null) => {
    if (!movingWorkflow) { return; }
    try {
      await moveWorkflowMutation.mutateAsync({ id: movingWorkflow.id, projectId });
      const target = projectId === null
        ? "Unfiled"
        : visibleProjects.find((project) => project.id === projectId)?.title ?? "the project";
      toast({
        title: "Workflow moved",
        description: `"${movingWorkflow.title}" is now in ${target}.`,
      });
      setMovingWorkflow(null);
    } catch (error: unknown) {
      toast({
        title: "Move failed",
        description: error instanceof Error ? error.message : "Failed to move workflow",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Handlers passed to both the cards and the list rows, so the two views offer
  // exactly the same menu.
  const projectHandlers = {
    onCopy: (id: string, title: string) => setCopyingProject({ id, title }),
    onTransfer: (id: string, title: string) => setTransferringProject({ id, title }),
    onDelete: (id: string) => setDeletingProjectId(id),
  };
  const workflowHandlers = {
    onMove: (workflow: ApiWorkflow) => setMovingWorkflow(workflow),
    onCopy: (workflow: ApiWorkflow) => setCopyingWorkflow({ id: workflow.id, title: workflow.title }),
    onTransfer: (workflow: ApiWorkflow) => setTransferringWorkflow({ id: workflow.id, title: workflow.title }),
    onDelete: (id: string) => {
      const found = (unfiledWorkflows ?? []).find((candidate) => candidate.id === id);
      setDeletingWorkflow({ id, title: found?.title ?? "this workflow" });
    },
  };

  const rows = useMemo(() => {
    const projectRows = filteredProjects.map((project: ApiProject) =>
      projectToAssetRow(
        project,
        buildProjectActions(
          project,
          projectHandlers,
          getOrgRestrictedActionReason(project, organizations, organizationsLoading)
        ),
        user?.id
      )
    );
    const workflowRows = filteredWorkflows.map((workflow: ApiWorkflow) =>
      workflowToAssetRow(
        workflow,
        buildWorkflowActions(
          workflow,
          workflowHandlers,
          getOrgRestrictedActionReason(workflow, organizations, organizationsLoading)
        ),
        user?.id
      )
    );
    return sortRows([...projectRows, ...workflowRows]);
  }, [filteredProjects, filteredWorkflows, organizations, organizationsLoading, sortRows, user?.id, unfiledWorkflows]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const dataLoading = projectsLoading || workflowsLoading;
  const hasAnything = totalCount > 0;

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
                  <DropdownMenuItem onClick={() => { setIsProjectDialogOpen(true); }}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    New Project
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/workflows/import" className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Import from a file
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Search + view switch — hidden until there is something to search. */}
          {!dataLoading && hasAnything && (
            <AssetToolbar
              search={search}
              onSearchChange={setSearch}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              resultCount={resultCount}
              totalCount={totalCount}
              itemNoun="item"
              placeholder="Search projects and workflows..."
            />
          )}

          {dataLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              <SkeletonCard count={6} height="h-48" />
            </div>
          ) : !hasAnything ? (
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
          ) : resultCount === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <SearchX className="w-10 h-10 text-muted-foreground mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground mb-1" data-testid="text-no-search-results">
                  No matches for &quot;{search.trim()}&quot;
                </h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Try a different name, or clear the search to see everything.
                </p>
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === "list" ? (
            <AssetTable rows={rows} sort={sort} onSortChange={toggleSort} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Projects first, then unfiled workflows */}
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  currentUserId={user?.id}
                  currentUserOrgRole={getOrgRoleForAsset(project, organizations)}
                  orgRoleLoading={organizationsLoading}
                  onTransfer={projectHandlers.onTransfer}
                  onCopy={projectHandlers.onCopy}
                  onDelete={projectHandlers.onDelete}
                />
              ))}
              {filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  currentUserId={user?.id}
                  currentUserOrgRole={getOrgRoleForAsset(workflow, organizations)}
                  orgRoleLoading={organizationsLoading}
                  onMove={workflowHandlers.onMove}
                  onCopy={workflowHandlers.onCopy}
                  onTransfer={workflowHandlers.onTransfer}
                  onDelete={workflowHandlers.onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Delete Project Confirmation Dialog */}
      {deletingProjectId !== null && (
        <AlertDialog open={deletingProjectId !== null} onOpenChange={() => setDeletingProjectId(null)}>
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
                onClick={() => { handleDeleteProject(deletingProjectId); }}
                disabled={deleteProjectMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Workflow Confirmation Dialog */}
      {deletingWorkflow !== null && (
        <AlertDialog open={deletingWorkflow !== null} onOpenChange={() => setDeletingWorkflow(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{deletingWorkflow.title}&quot;? This action cannot be undone.
                All pages, steps, and run data will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-workflow">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { handleDeleteWorkflow(deletingWorkflow.id); }}
                disabled={deleteWorkflowMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-workflow"
              >
                {deleteWorkflowMutation.isPending ? "Deleting..." : "Delete Workflow"}
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
                onChange={(e) => { setNewProjectName(e.target.value); }}
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
                onChange={(e) => { setNewProjectDescription(e.target.value); }}
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
              onClick={() => { handleCreateProject(); }}
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
          open={transferringWorkflow !== null}
          onOpenChange={(open) => !open && setTransferringWorkflow(null)}
          assetType="workflow"
          assetName={transferringWorkflow.title}
          sourceOwnerType={transferringWorkflowAsset?.ownerType}
          sourceOwnerUuid={transferringWorkflowAsset?.ownerUuid}
          onTransfer={handleTransferWorkflow}
          isPending={transferWorkflowMutation.isPending}
        />
      )}

      {/* Transfer Ownership Dialog - Project */}
      {transferringProject && (
        <TransferOwnershipDialog
          open={transferringProject !== null}
          onOpenChange={(open) => !open && setTransferringProject(null)}
          assetType="project"
          assetName={transferringProject.title}
          sourceOwnerType={transferringProjectAsset?.ownerType}
          sourceOwnerUuid={transferringProjectAsset?.ownerUuid}
          onTransfer={handleTransferProject}
          isPending={transferProjectMutation.isPending}
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

      {movingWorkflow && (
        <MoveWorkflowDialog
          open={movingWorkflow !== null}
          onOpenChange={(open) => !open && setMovingWorkflow(null)}
          workflow={movingWorkflow}
          projects={visibleProjects}
          onMove={handleMoveWorkflow}
          isPending={moveWorkflowMutation.isPending}
        />
      )}

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
    </div>
  );
}
