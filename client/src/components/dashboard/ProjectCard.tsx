/**
 * ProjectCard Component
 * Displays a project folder card with workflow count
 */

import { Folder, Archive, Trash2, Edit, ArrowRightLeft, Users, Copy, ShieldCheck } from "lucide-react";

import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import { Badge } from "@/components/ui/badge";
import type { OrgRole } from "@/lib/ownership";
import type { ApiProject } from "@/lib/vault-api";

interface ProjectCardProps {
  project: ApiProject & { workflowCount?: number };
  currentUserId?: string;
  currentUserOrgRole?: OrgRole | null;
  orgRoleLoading?: boolean;
  onEdit?: (project: ApiProject) => void;
  onArchive?: (id: string) => void;
  onCopy?: (id: string, title: string) => void;
  onTransfer?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
}

export function ProjectCard({
  project,
  currentUserId,
  currentUserOrgRole,
  orgRoleLoading = false,
  onEdit,
  onArchive,
  onCopy,
  onTransfer,
  onDelete,
}: ProjectCardProps) {
  const actions: EntityAction[] = [];
  const orgRestrictedReason = project.ownerType === "org" && currentUserOrgRole !== "admin"
    ? (orgRoleLoading ? "Checking org role" : "Org admin required")
    : undefined;

  if (onEdit) {
    actions.push({
      label: "Edit",
      icon: Edit,
      onClick: () => onEdit(project),
    });
  }

  if (onArchive) {
    actions.push({
      label: project.status === "archived" ? "Unarchive" : "Archive",
      icon: Archive,
      onClick: () => onArchive(project.id),
      separator: true,
      disabled: !!orgRestrictedReason,
      disabledReason: orgRestrictedReason,
    });
  }

  if (onCopy) {
    actions.push({
      label: "Copy",
      icon: Copy,
      onClick: () => onCopy(project.id, project.title),
    });
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

  return (
    <EntityCard
      entity={project}
      icon={Folder}
      iconClassName="bg-primary/10 text-primary"
      link={{ href: `/projects/${project.id}` }}
      actions={actions}
      className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200/50 dark:border-blue-800/50"
      renderBadge={(entity) => (
        <div className="flex gap-2">
          {currentUserId && entity.ownerType === 'user' && entity.ownerUuid === currentUserId ? (
            <Badge variant="outline" className="opacity-70">Owner</Badge>
          ) : entity.ownerType === 'org' ? (
            <>
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">
                <Users className="w-3 h-3 mr-1" />
                {entity.ownerName ?? "Organization"}
              </Badge>
              {currentUserOrgRole && (
                <Badge variant={currentUserOrgRole === "admin" ? "default" : "outline"} className="gap-1">
                  {currentUserOrgRole === "admin" && <ShieldCheck className="w-3 h-3" />}
                  {currentUserOrgRole === "admin" ? "Admin" : "Member"}
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200">
              Shared
            </Badge>
          )}
          <Badge variant={entity.status === "active" ? "default" : "outline"}>
            {entity.workflowCount ?? 0} workflow{(entity.workflowCount ?? 0) !== 1 ? 's' : ''}
          </Badge>
        </div>
      )}
    />
  );
}
