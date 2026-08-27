/**
 * ProjectView Page
 * Displays a single project with its contained workflows
 */

import { ArrowLeft, Plus, Edit, Share2, Copy, ArrowRightLeft, Trash2, Users, ShieldCheck, Plug, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useLocation } from "wouter";

import { buildWorkflowActions } from "@/components/dashboard/assetActions";
import { workflowToAssetRow } from "@/components/dashboard/assetRows";
import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { AssetTable } from "@/components/shared/AssetTable";
import { AssetToolbar } from "@/components/shared/AssetToolbar";
import { CreateWorkflowForm } from "@/components/workflows/CreateWorkflowForm";
import { ResourceAccessDialog } from "@/components/access/ResourceAccessDialog";
import { CopyAssetDialog } from "@/components/dialogs/CopyAssetDialog";
import { MoveWorkflowDialog } from "@/components/dialogs/MoveWorkflowDialog";
import { TransferOwnershipDialog } from "@/components/dialogs/TransferOwnershipDialog";
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
import { Badge } from "@/components/ui/badge";
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
import { useAssetBrowser } from "@/hooks/useAssetBrowser";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import { getOrgRestrictedActionReason, getOrgRoleForAsset } from "@/lib/ownership";
import type { ApiAssetCopyOptions, ApiWorkflow } from "@/lib/vault-api";
import {
  useProject,
  useUpdateProject,
  useArchiveProject,
  useDeleteProject,
  useCopyProject,
  useTransferProject,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useCopyWorkflow,
  useTransferWorkflow,
  useMoveWorkflow,
  useProjects,
} from "@/lib/vault-hooks";

// eslint-disable-next-line max-lines-per-function, complexity
export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Dialog states
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isCopyProjectOpen, setIsCopyProjectOpen] = useState(false);
  const [isTransferProjectOpen, setIsTransferProjectOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [copyingWorkflow, setCopyingWorkflow] = useState<ApiWorkflow | null>(null);
  const [transferringWorkflow, setTransferringWorkflow] = useState<ApiWorkflow | null>(null);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  const [movingWorkflow, setMovingWorkflow] = useState<ApiWorkflow | null>(null);

  // Form states
  const [editProject, setEditProject] = useState({ title: "", description: "" });

  const { search, setSearch, viewMode, setViewMode, sort, toggleSort, sortRows, matches } =
    useAssetBrowser("ezbuildr.project.view");

  // Data queries
  const { data: projectWithWorkflows, isLoading } = useProject(id);
  const { data: organizations, isLoading: organizationsLoading } = useOrganizations();
  const { data: allProjects } = useProjects();

  // Mutations
  const updateProjectMutation = useUpdateProject();
  const _archiveProjectMutation = useArchiveProject();
  const deleteProjectMutation = useDeleteProject();
  const copyProjectMutation = useCopyProject();
  const transferProjectMutation = useTransferProject();
  const updateWorkflowMutation = useUpdateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const copyWorkflowMutation = useCopyWorkflow();
  const transferWorkflowMutation = useTransferWorkflow();
  const moveWorkflowMutation = useMoveWorkflow();

  // Handlers
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

  // "Other Project" is an internal bucket, never somewhere a user files into.
  const moveDestinations = useMemo(
    () => (allProjects ?? []).filter((project) => project.title !== "Other Project"),
    [allProjects]
  );

  const handleMoveWorkflow = async (projectId: string | null) => {
    if (!movingWorkflow) { return; }
    try {
      await moveWorkflowMutation.mutateAsync({ id: movingWorkflow.id, projectId });
      const target = projectId === null
        ? "Unfiled"
        : moveDestinations.find((project) => project.id === projectId)?.title ?? "the project";
      toast({
        title: "Workflow moved",
        description: `"${movingWorkflow.title}" is now in ${target}.`,
      });
      setMovingWorkflow(null);
    } catch (error) {
      toast({
        title: "Move failed",
        description: error instanceof Error ? error.message : "Failed to move workflow",
        variant: "destructive",
      });
      throw error;
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

  const handleCopyProject = async (options: ApiAssetCopyOptions) => {
    if (!projectWithWorkflows) { return; }
    try {
      const result = await copyProjectMutation.mutateAsync({ id: projectWithWorkflows.id, options });
      toast({
        title: "Project copied",
        description: `Copied ${result.workflows?.length ?? 0} workflow${(result.workflows?.length ?? 0) === 1 ? "" : "s"}.`,
      });
      setIsCopyProjectOpen(false);
    } catch (error) {
      toast({ title: "Copy failed", description: error instanceof Error ? error.message : "Failed to copy project", variant: "destructive" });
      throw error;
    }
  };

  const handleTransferProject = async (targetOwnerType: "user" | "org", targetOwnerUuid: string) => {
    if (!projectWithWorkflows) { return; }
    try {
      await transferProjectMutation.mutateAsync({
        id: projectWithWorkflows.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({ title: "Project transferred", description: "Ownership is updated" });
      setIsTransferProjectOpen(false);
    } catch (error) {
      toast({ title: "Transfer failed", description: error instanceof Error ? error.message : "Failed to transfer project", variant: "destructive" });
      throw error;
    }
  };

  const handleDeleteProject = async () => {
    if (!projectWithWorkflows) { return; }
    try {
      await deleteProjectMutation.mutateAsync(projectWithWorkflows.id);
      toast({ title: "Project deleted" });
      setLocation("/workflows");
    } catch (error) {
      toast({ title: "Delete failed", description: error instanceof Error ? error.message : "Failed to delete project", variant: "destructive" });
    }
  };

  const handleCopyWorkflow = async (options: ApiAssetCopyOptions) => {
    if (!copyingWorkflow) { return; }
    try {
      await copyWorkflowMutation.mutateAsync({ id: copyingWorkflow.id, options });
      toast({ title: "Workflow copied" });
      setCopyingWorkflow(null);
    } catch (error) {
      toast({ title: "Copy failed", description: error instanceof Error ? error.message : "Failed to copy workflow", variant: "destructive" });
      throw error;
    }
  };

  const handleTransferWorkflow = async (targetOwnerType: "user" | "org", targetOwnerUuid: string) => {
    if (!transferringWorkflow) { return; }
    try {
      await transferWorkflowMutation.mutateAsync({
        id: transferringWorkflow.id,
        targetOwnerType,
        targetOwnerUuid,
      });
      toast({ title: "Workflow transferred", description: "Ownership is updated" });
      setTransferringWorkflow(null);
    } catch (error) {
      toast({ title: "Transfer failed", description: error instanceof Error ? error.message : "Failed to transfer workflow", variant: "destructive" });
      throw error;
    }
  };

  // One handler set feeds both the cards and the list rows, so the two views
  // expose exactly the same actions.
  const workflowHandlers = {
    onMove: (workflow: ApiWorkflow) => setMovingWorkflow(workflow),
    onCopy: (workflow: ApiWorkflow) => setCopyingWorkflow(workflow),
    onTransfer: (workflow: ApiWorkflow) => setTransferringWorkflow(workflow),
    onArchive: (workflowId: string) => { void handleArchiveWorkflow(workflowId); },
    onActivate: (workflowId: string) => { void handleActivateWorkflow(workflowId); },
    onDelete: (workflowId: string) => setDeleteWorkflowId(workflowId),
  };

  const projectWorkflows = projectWithWorkflows?.workflows ?? [];
  const filteredWorkflows = useMemo(() => projectWorkflows.filter(matches), [projectWorkflows, matches]);
  const workflowRows = useMemo(
    () => sortRows(filteredWorkflows.map((workflow) => workflowToAssetRow(
      workflow,
      buildWorkflowActions(
        workflow,
        workflowHandlers,
        getOrgRestrictedActionReason(workflow, organizations, organizationsLoading)
      ),
      user?.id
    ))),
    [filteredWorkflows, organizations, organizationsLoading, sortRows, user?.id]
  );

  const openEditDialog = () => {
    if (projectWithWorkflows) {
      setEditProject({
        title: projectWithWorkflows.title,
        description: projectWithWorkflows.description ?? "",
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
                The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
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

  const projectOrgRole = getOrgRoleForAsset(projectWithWorkflows, organizations);
  const projectOrgRestrictedReason = getOrgRestrictedActionReason(projectWithWorkflows, organizations, organizationsLoading);

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
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{projectWithWorkflows.title}</h1>
                {projectWithWorkflows.ownerType === "org" && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">
                    <Users className="w-3 h-3 mr-1" />
                    {projectWithWorkflows.ownerName ?? "Organization"}
                  </Badge>
                )}
                {projectOrgRole && (
                  <Badge variant={projectOrgRole === "admin" ? "default" : "outline"} className="gap-1">
                    {projectOrgRole === "admin" && <ShieldCheck className="w-3 h-3" />}
                    {projectOrgRole === "admin" ? "Admin" : "Member"}
                  </Badge>
                )}
              </div>
              {projectWithWorkflows.description && (
                <p className="text-muted-foreground mt-2">{projectWithWorkflows.description}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/projects/${id}/settings/integrations`}>
                <Button variant="outline">
                  <Plug className="w-4 h-4 mr-2" />
                  Integrations
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setIsShareOpen(true)}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" onClick={() => setIsCopyProjectOpen(true)}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsTransferProjectOpen(true)}
                disabled={!!projectOrgRestrictedReason}
                title={projectOrgRestrictedReason}
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Transfer
              </Button>
              <Button variant="outline" onClick={openEditDialog}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Project
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setIsDeleteProjectOpen(true)}
                disabled={!!projectOrgRestrictedReason}
                title={projectOrgRestrictedReason}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button onClick={() => { void setIsCreateWorkflowOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                New Workflow
              </Button>
            </div>
          </div>
        </div>

        {/* Workflows */}
        {projectWithWorkflows.workflows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <h3 className="text-lg font-semibold mb-2">No workflows in this project</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Get started by creating your first workflow in this project
              </p>
              <Button onClick={() => { setIsCreateWorkflowOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <AssetToolbar
              search={search}
              onSearchChange={setSearch}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              resultCount={filteredWorkflows.length}
              totalCount={projectWithWorkflows.workflows.length}
              itemNoun="workflow"
              placeholder="Search workflows in this project..."
            />

            {filteredWorkflows.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <SearchX className="w-10 h-10 text-muted-foreground mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-1" data-testid="text-no-search-results">
                    No matches for &quot;{search.trim()}&quot;
                  </h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    Try a different name, or clear the search to see every workflow.
                  </p>
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                </CardContent>
              </Card>
            ) : viewMode === "list" ? (
              <AssetTable
                rows={workflowRows}
                sort={sort}
                onSortChange={toggleSort}
                showKind={false}
                showWorkflowCount={false}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    currentUserId={user?.id}
                    currentUserOrgRole={getOrgRoleForAsset(workflow, organizations) ?? projectOrgRole}
                    orgRoleLoading={organizationsLoading}
                    onMove={workflowHandlers.onMove}
                    onCopy={workflowHandlers.onCopy}
                    onTransfer={workflowHandlers.onTransfer}
                    onArchive={workflowHandlers.onArchive}
                    onActivate={workflowHandlers.onActivate}
                    onDelete={workflowHandlers.onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <ResourceAccessDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        resourceType="project"
        resourceId={projectWithWorkflows.id}
        resourceName={projectWithWorkflows.title}
        ownerType={projectWithWorkflows.ownerType}
        ownerUuid={projectWithWorkflows.ownerUuid}
      />

      <CopyAssetDialog
        open={isCopyProjectOpen}
        onOpenChange={setIsCopyProjectOpen}
        assetType="project"
        assetName={projectWithWorkflows.title}
        onCopy={handleCopyProject}
        isPending={copyProjectMutation.isPending}
      />

      <TransferOwnershipDialog
        open={isTransferProjectOpen}
        onOpenChange={setIsTransferProjectOpen}
        assetType="project"
        assetName={projectWithWorkflows.title}
        sourceOwnerType={projectWithWorkflows.ownerType}
        sourceOwnerUuid={projectWithWorkflows.ownerUuid}
        onTransfer={handleTransferProject}
        isPending={transferProjectMutation.isPending}
      />

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
          projects={moveDestinations}
          onMove={handleMoveWorkflow}
          isPending={moveWorkflowMutation.isPending}
        />
      )}

      {transferringWorkflow && (
        <TransferOwnershipDialog
          open={transferringWorkflow !== null}
          onOpenChange={(open) => !open && setTransferringWorkflow(null)}
          assetType="workflow"
          assetName={transferringWorkflow.title}
          sourceOwnerType={transferringWorkflow.ownerType ?? projectWithWorkflows.ownerType}
          sourceOwnerUuid={transferringWorkflow.ownerUuid ?? projectWithWorkflows.ownerUuid}
          onTransfer={handleTransferWorkflow}
          isPending={transferWorkflowMutation.isPending}
        />
      )}

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
                onChange={(e) => { void setEditProject({ ...editProject, title: e.target.value }); }}
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                onKeyDown={(e) => { void e.key === "Enter" && handleUpdateProject(); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Optional description..."
                value={editProject.description}
                onChange={(e) => { void setEditProject({ ...editProject, description: e.target.value }); }}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void setIsEditProjectOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={() => { void handleUpdateProject(); }} disabled={updateProjectMutation.isPending}>
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
          <CreateWorkflowForm
            projectId={id}
            submitLabel="Create"
            autoFocus
            onCancel={() => { setIsCreateWorkflowOpen(false); }}
            onCreated={() => { setIsCreateWorkflowOpen(false); }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteProjectOpen} onOpenChange={setIsDeleteProjectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Workflows inside this project will be moved to unfiled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void handleDeleteProject(); }}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteProjectMutation.isPending}
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
              This action cannot be undone. All pages, steps, blocks, and runs will be permanently deleted.
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
