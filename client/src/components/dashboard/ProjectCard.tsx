/**
 * ProjectCard Component
 * Displays a project folder card with workflow count
 */

import { Folder, Archive, Trash2, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import type { ApiProject } from "@/lib/vault-api";

interface ProjectCardProps {
  project: ApiProject & { workflowCount?: number };
  onEdit?: (project: ApiProject) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ProjectCard({ project, onEdit, onArchive, onDelete }: ProjectCardProps) {
  const actions: EntityAction[] = [];

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
    });
  }

  if (onDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      onClick: () => onDelete(project.id),
      variant: "destructive",
      separator: true,
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
        <Badge variant={entity.status === "active" ? "default" : "outline"}>
          {entity.workflowCount ?? 0} workflow{(entity.workflowCount ?? 0) !== 1 ? 's' : ''}
        </Badge>
      )}
    />
  );
}
