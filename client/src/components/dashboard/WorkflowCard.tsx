/**
 * WorkflowCard Component
 * Displays a workflow document card with status
 */

import { FileText, Users, ShieldCheck } from "lucide-react";

import { buildWorkflowActions, getOrgRestrictedReasonFromRole } from "@/components/dashboard/assetActions";
import { EntityCard } from "@/components/shared/EntityCard";
import { Badge } from "@/components/ui/badge";
import type { OrgRole } from "@/lib/ownership";
import type { ApiWorkflow } from "@/lib/vault-api";

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
  const orgRestrictedReason = getOrgRestrictedReasonFromRole(workflow, currentUserOrgRole, orgRoleLoading);
  const actions = buildWorkflowActions(
    workflow,
    { onMove, onCopy, onTransfer, onArchive, onActivate, onDelete },
    orgRestrictedReason
  );

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
