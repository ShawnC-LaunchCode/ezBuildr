/**
 * WorkflowCard Component
 * Displays a workflow document card with status
 */

import { FileText, Archive, Trash2, Play, Move } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import type { ApiWorkflow } from "@/lib/vault-api";

interface WorkflowCardProps {
  workflow: ApiWorkflow;
  onMove?: (workflow: ApiWorkflow) => void;
  onArchive?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowCard({ workflow, onMove, onArchive, onActivate, onDelete }: WorkflowCardProps) {
  const statusVariant = workflow.status === "active" ? "default" : workflow.status === "draft" ? "secondary" : "outline";

  const actions: EntityAction[] = [
    {
      label: "Edit Builder",
      href: `/workflows/${workflow.id}/builder`,
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

  // Conditional activate/archive action
  if (workflow.status === "draft" || workflow.status === "archived") {
    actions.push({
      label: "Activate",
      icon: Play,
      onClick: () => onActivate?.(workflow.id),
      separator: !onMove, // Only add separator if no move action above
    });
  } else if (onArchive) {
    actions.push({
      label: "Archive",
      icon: Archive,
      onClick: () => onArchive(workflow.id),
      separator: !onMove, // Only add separator if no move action above
    });
  }

  if (onDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      onClick: () => onDelete(workflow.id),
      variant: "destructive",
      separator: true,
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
        <Badge variant={statusVariant}>
          {workflow.status}
        </Badge>
      )}
    />
  );
}
