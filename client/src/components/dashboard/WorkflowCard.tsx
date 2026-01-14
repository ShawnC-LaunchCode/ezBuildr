/**
 * WorkflowCard Component
 * Displays a workflow document card with status
 */

import { FileText, Archive, Trash2, Play, Move, Link } from "lucide-react";

import { EntityCard, type EntityAction } from "@/components/shared/EntityCard";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { workflowAPI } from "@/lib/vault-api";

interface WorkflowCardProps {
  workflow: ApiWorkflow;
  onMove?: (workflow: ApiWorkflow) => void;
  onArchive?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkflowCard({ workflow, onMove, onArchive, onActivate, onDelete }: WorkflowCardProps) {
  const statusVariant = workflow.status === "active" ? "default" : workflow.status === "draft" ? "secondary" : "outline";

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
        <div className="flex gap-2">
          {workflow.intakeConfig?.isIntake && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Intake
            </Badge>
          )}
          <Badge variant={statusVariant}>
            {workflow.status}
          </Badge>
        </div>
      )}
    />
  );
}
