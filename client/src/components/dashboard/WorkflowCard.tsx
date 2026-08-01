/**
 * WorkflowCard Component
 * Displays a workflow document card with status
 */

import { FileText, Archive, Trash2, Play, Move, Link, Copy, Users, ShieldCheck, ArrowRightLeft } from "lucide-react";

import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { OrgRole } from "@/lib/ownership";
import type { ApiWorkflow } from "@/lib/vault-api";
import { workflowAPI } from "@/lib/vault-api";

interface WorkflowCardProps {
  workflow: ApiWorkflow;
  currentUserId?: string;
  currentUserOrgRole?: OrgRole | null;
  orgRoleLoading?: boolean;
  onMove?: (workflow: ApiWorkflow) => void;
  onCopy?: (workflow: ApiWorkflow) => void;
  onTransfer?: (workflow: ApiWorkflow) => void;
  onArchive?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowCard({
  workflow,
  currentUserId,
  currentUserOrgRole,
  orgRoleLoading = false,
  onMove,
  onCopy,
  onTransfer,
  onArchive,
  onActivate,
  onDelete,
}: WorkflowCardProps) {
  const statusVariant = workflow.status === "active" ? "default" : workflow.status === "draft" ? "secondary" : "outline";
  const orgRestrictedReason = workflow.ownerType === "org" && currentUserOrgRole !== "admin"
    ? (orgRoleLoading ? "Checking org role" : "Org admin required")
    : undefined;

  const handleCopyLink = async () => {
    try {
      const { publicUrl } = await workflowAPI.getPublicLink(workflow.id);
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

  const actions: EntityAction[] = [
    {
      label: "Edit Builder",
      href: `/workflows/${workflow.id}/builder`,
    },
    {
      label: "Copy Link",
      icon: Link,
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onClick: handleCopyLink,
    },
  ];

  if (onMove) {
    actions.push({
      label: "Move to Project",
      icon: Move,
      onClick: () => onMove(workflow),
      separator: true,
    });
  }

  if (onCopy) {
    actions.push({
      label: "Copy",
      icon: Copy,
      onClick: () => onCopy(workflow),
      separator: !onMove,
    });
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

  // Conditional activate/archive action
  if (workflow.status === "draft" || workflow.status === "archived") {
    actions.push({
      label: "Activate",
      icon: Play,
      onClick: () => onActivate?.(workflow.id),
      separator: !onMove, // Only add separator if no move action above
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  } else if (onArchive) {
    actions.push({
      label: "Archive",
      icon: Archive,
      onClick: () => onArchive(workflow.id),
      separator: !onMove, // Only add separator if no move action above
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

  return (
    <EntityCard
      entity={workflow}
      icon={FileText}
      iconClassName="bg-secondary/50 text-secondary-foreground"
      link={{ href: `/workflows/${workflow.id}/builder` }}
      actions={actions}
      renderBadge={() => (
        <div className="flex gap-2">
          <Badge variant={statusVariant}>
            {workflow.status}
          </Badge>
          {currentUserId && workflow.ownerType === "user" && workflow.ownerUuid === currentUserId ? (
            <Badge variant="outline" className="opacity-70">Owner</Badge>
          ) : workflow.ownerType === "org" ? (
            <>
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">
                <Users className="w-3 h-3 mr-1" />
                {workflow.ownerName ?? "Organization"}
              </Badge>
              {currentUserOrgRole && (
                <Badge variant={currentUserOrgRole === "admin" ? "default" : "outline"} className="gap-1">
                  {currentUserOrgRole === "admin" && <ShieldCheck className="w-3 h-3" />}
                  {currentUserOrgRole === "admin" ? "Admin" : "Member"}
                </Badge>
              )}
            </>
          ) : null}
        </div>
      )}
    />
  );
}
