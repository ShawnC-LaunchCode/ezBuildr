/**
 * Block Card Component
 * Renders a card for either a Question (step) or Logic Block
 * Used in the inline page view
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, FileText, Code2, Database, CheckCircle, GitBranch, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { useDeleteStep, useDeleteBlock } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import type { PageItem } from "@/lib/dnd";

interface BlockCardProps {
  item: PageItem;
  workflowId: string;
  sectionId: string;
}

const STEP_TYPE_LABELS: Record<string, string> = {
  short_text: "Short Text",
  long_text: "Long Text",
  radio: "Radio",
  multiple_choice: "Multiple Choice",
  yes_no: "Yes/No",
  date_time: "Date/Time",
  file_upload: "File Upload",
};

const BLOCK_TYPE_ICONS: Record<string, any> = {
  prefill: Database,
  validate: CheckCircle,
  branch: GitBranch,
  js: Code2,
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  prefill: "Prefill Data",
  validate: "Validate",
  branch: "Branch",
  js: "JS Transform",
};

export function BlockCard({ item, workflowId, sectionId }: BlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { selection, selectStep, selectBlock } = useWorkflowBuilder();
  const deleteStepMutation = useDeleteStep();
  const deleteBlockMutation = useDeleteBlock();
  const { toast } = useToast();

  const isSelected =
    (item.kind === "step" && selection?.type === "step" && selection.id === item.id) ||
    (item.kind === "block" && selection?.type === "block" && selection.id === item.id);

  const handleClick = () => {
    if (item.kind === "step") {
      selectStep(item.id);
    } else {
      selectBlock(item.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (item.kind === "step") {
      try {
        await deleteStepMutation.mutateAsync({ id: item.id, sectionId });
        toast({
          title: "Question deleted",
          description: "Question removed from page",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete question",
          variant: "destructive",
        });
      }
    } else {
      try {
        await deleteBlockMutation.mutateAsync({ id: item.id, workflowId });
        toast({
          title: "Logic block deleted",
          description: "Logic block removed from page",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete logic block",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-shadow",
          isSelected && "ring-2 ring-primary",
          isDragging && "opacity-50"
        )}
        onClick={handleClick}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <button
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Icon */}
            <div className="mt-0.5">
              {item.kind === "step" ? (
                <FileText className="h-4 w-4 text-muted-foreground" />
              ) : (
                (() => {
                  const Icon = BLOCK_TYPE_ICONS[item.data.type] || Code2;
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.kind === "step" ? (
                <>
                  <div className="font-medium text-sm truncate">
                    {item.data.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {STEP_TYPE_LABELS[item.data.type] || item.data.type}
                    </Badge>
                    {item.data.alias && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {item.data.alias}
                      </Badge>
                    )}
                    {item.data.required && (
                      <span className="text-xs text-destructive">Required</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-sm">
                    {BLOCK_TYPE_LABELS[item.data.type] || item.data.type}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {item.data.type}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {item.data.phase}
                    </Badge>
                    {item.data.type === "js" && item.data.config?.outputKey && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        → {item.data.config.outputKey}
                      </Badge>
                    )}
                    {!item.data.enabled && (
                      <span className="text-xs text-muted-foreground">Disabled</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Delete Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={handleDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
