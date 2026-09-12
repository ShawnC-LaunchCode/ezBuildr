/**
 * Action builders shared by the card and list presentations of projects and
 * workflows.
 *
 * Both `ProjectCard`/`WorkflowCard` and `AssetTable` render the same actions
 * menu, so the menu is built here exactly once. Keeping it in the components
 * meant two copies of the org-restriction rules and the separator logic, which
 * is precisely the sort of thing that drifts the moment one view gains an
 * action the other doesn't.
 */

import { Archive, ArrowRightLeft, Copy, Edit, Link, Move, Play, Trash2 } from "lucide-react";

import type { EntityAction } from "@/components/shared/EntityCard";
import { toast } from "@/hooks/use-toast";
import type { OrgRole, OwnedAsset } from "@/lib/ownership";
import type { ApiProject, ApiWorkflow } from "@/lib/vault-api";
import { workflowAPI } from "@/lib/vault-api";

/**
 * Why an action is unavailable, or `undefined` when it is available.
 *
 * `lib/ownership.ts` derives the same answer from the organization list; this
 * variant takes the already-resolved role, which is what the cards hold.
 */
export function getOrgRestrictedReasonFromRole(
  asset: OwnedAsset,
  currentUserOrgRole: OrgRole | null | undefined,
  orgRoleLoading = false
): string | undefined {
  if (asset.ownerType !== "org" || currentUserOrgRole === "admin") {
    return undefined;
  }
  return orgRoleLoading ? "Checking org role" : "Org admin required";
}

export interface ProjectActionHandlers {
  onEdit?: (project: ApiProject) => void;
  onCopy?: (id: string, title: string) => void;
  onTransfer?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
}

export function buildProjectActions(
  project: ApiProject,
  handlers: ProjectActionHandlers,
  orgRestrictedReason: string | undefined
): EntityAction[] {
  const { onEdit, onCopy, onTransfer, onDelete } = handlers;
  const actions: EntityAction[] = [];

  if (onEdit) {
    actions.push({ label: "Edit", icon: Edit, onClick: () => onEdit(project) });
  }

  if (onCopy) {
    actions.push({ label: "Copy", icon: Copy, onClick: () => onCopy(project.id, project.title), separator: true });
  }

  if (onTransfer) {
    actions.push({
      label: "Transfer",
      icon: ArrowRightLeft,
      onClick: () => onTransfer(project.id, project.title),
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  if (onDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      onClick: () => onDelete(project.id),
      variant: "destructive",
      separator: true,
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  return actions;
}

export interface WorkflowActionHandlers {
  onMove?: (workflow: ApiWorkflow) => void;
  onCopy?: (workflow: ApiWorkflow) => void;
  onTransfer?: (workflow: ApiWorkflow) => void;
  onArchive?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

async function copyPublicLink(workflowId: string): Promise<void> {
  try {
    const { publicUrl } = await workflowAPI.getPublicLink(workflowId);
    await navigator.clipboard.writeText(publicUrl);
    toast({ title: "Link copied!", description: "The workflow link has been copied to your clipboard." });
  } catch (error) {
    toast({
      title: "Failed to copy link",
      description: error instanceof Error ? error.message : "An error occurred",
      variant: "destructive",
    });
  }
}

export function buildWorkflowActions(
  workflow: ApiWorkflow,
  handlers: WorkflowActionHandlers,
  orgRestrictedReason: string | undefined
): EntityAction[] {
  const { onMove, onCopy, onTransfer, onArchive, onActivate, onDelete } = handlers;

  const actions: EntityAction[] = [
    { label: "Edit Builder", icon: Edit, href: `/workflows/${workflow.id}/builder` },
    {
      label: "Copy Link",
      icon: Link,
      onClick: () => { void copyPublicLink(workflow.id); },
    },
  ];

  if (onMove) {
    // Single verb, like its Copy/Transfer/Archive/Delete siblings — and honest on
    // surfaces where the destination may be another project or unfiled.
    actions.push({ label: "Move", icon: Move, onClick: () => onMove(workflow), separator: true });
  }

  if (onCopy) {
    actions.push({ label: "Copy", icon: Copy, onClick: () => onCopy(workflow), separator: !onMove });
  }

  if (onTransfer) {
    actions.push({
      label: "Transfer",
      icon: ArrowRightLeft,
      onClick: () => onTransfer(workflow),
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  // Activate and Archive are the two ends of one toggle, so only ever one shows.
  // Each is gated on its handler: an unguarded "Activate" used to render on every
  // draft workflow and quietly do nothing on surfaces that pass no `onActivate`.
  if (workflow.status === "draft" || workflow.status === "archived") {
    if (onActivate) {
      actions.push({
        label: "Activate",
        icon: Play,
        onClick: () => onActivate(workflow.id),
        separator: !onMove,
        disabled: !!orgRestrictedReason,
        disabledReason: orgRestrictedReason,
      });
    }
  } else if (onArchive) {
    actions.push({
      label: "Archive",
      icon: Archive,
      onClick: () => onArchive(workflow.id),
      separator: !onMove,
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  if (onDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      onClick: () => onDelete(workflow.id),
      variant: "destructive",
      separator: true,
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  return actions;
}
