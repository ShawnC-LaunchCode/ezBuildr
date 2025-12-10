/**
 * Block Card Component
 * Renders a card for either a Question (step) or Logic Block
 * Used in the inline page view
 */

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, FileText, Code2, Database, CheckCircle, GitBranch, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { useDeleteStep, useDeleteBlock, useDeleteTransformBlock, useUpdateStep, useUpdateTransformBlock } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { JSBlockEditor } from "@/components/blocks/JSBlockEditor";
import { getBlockByType } from "@/lib/blockRegistry";
import type { PageItem } from "@/lib/dnd";
import {
  TextCardEditor,
  BooleanCardEditor,
  PhoneCardEditor,
  EmailCardEditor,
  WebsiteCardEditor,
  NumberCardEditor,
  ChoiceCardEditor,
  AddressCardEditor,
  MultiFieldCardEditor,
  ScaleCardEditor,
  DisplayCardEditor,
  FinalBlockEditor,
  SignatureBlockEditor,
} from "@/components/builder/cards";

interface BlockCardProps {
  item: PageItem;
  workflowId: string;
  sectionId: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEnterNext?: () => void;
}

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

export function BlockCard({ item, workflowId, sectionId, isExpanded = false, onToggleExpand, onEnterNext }: BlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { selection, selectStep, selectBlock } = useWorkflowBuilder();
  const deleteStepMutation = useDeleteStep();
  const deleteBlockMutation = useDeleteBlock();
  const deleteTransformBlockMutation = useDeleteTransformBlock();
  const updateStepMutation = useUpdateStep();
  const updateTransformBlockMutation = useUpdateTransformBlock();
  const { toast } = useToast();

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingAlias, setEditingAlias] = useState(false);
  const [titleValue, setTitleValue] = useState(item.kind === "step" ? item.data.title : "");
  const [aliasValue, setAliasValue] = useState(item.kind === "step" ? (item.data.alias || "") : "");

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
        // Use different API for transform blocks (type === "js")
        if (item.data.type === "js") {
          await deleteTransformBlockMutation.mutateAsync({ id: item.id, workflowId });
        } else {
          await deleteBlockMutation.mutateAsync({ id: item.id, workflowId });
        }
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

  const handleTitleChange = (newTitle: string) => {
    setTitleValue(newTitle);
  };

  const handleTitleBlur = () => {
    if (item.kind === "step" && titleValue !== item.data.title) {
      updateStepMutation.mutate(
        { id: item.id, sectionId, title: titleValue },
        {
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to update question title",
              variant: "destructive",
            });
            setTitleValue(item.data.title);
          },
        }
      );
    }
    setEditingTitle(false);
  };

  const handleAliasChange = (newAlias: string) => {
    setAliasValue(newAlias);
  };

  const handleAliasBlur = () => {
    if (item.kind === "step") {
      const trimmedAlias = aliasValue.trim();
      const finalAlias = trimmedAlias === "" ? null : trimmedAlias;

      if (finalAlias !== item.data.alias) {
        updateStepMutation.mutate(
          { id: item.id, sectionId, alias: finalAlias },
          {
            onError: (error: any) => {
              toast({
                title: "Error",
                description: error?.message || "Failed to update variable name",
                variant: "destructive",
              });
              setAliasValue(item.data.alias || "");
            },
          }
        );
      }
    }
    setEditingAlias(false);
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    if (item.kind === "step" && isSelected) {
      e.stopPropagation();
      setEditingTitle(true);
    }
  };

  const handleAliasClick = (e: React.MouseEvent) => {
    if (item.kind === "step" && isSelected) {
      e.stopPropagation();
      setEditingAlias(true);
    }
  };

  const handleJSBlockChange = (updated: any) => {
    if (item.kind === "block" && item.data.type === "js") {
      updateTransformBlockMutation.mutate({
        id: item.id,
        workflowId,
        name: updated.config?.name,
        code: updated.config?.code,
        inputKeys: updated.config?.inputKeys,
        outputKey: updated.config?.outputKey,
        timeoutMs: updated.config?.timeoutMs,
      });
    }
  };

  const renderStepEditor = (step: any, workflowId: string, sectionId: string) => {
    const stepType = step.type;

    // Text blocks
    if (stepType === "short_text" || stepType === "long_text" || stepType === "text") {
      return <TextCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Boolean blocks
    if (stepType === "yes_no" || stepType === "true_false" || stepType === "boolean") {
      return <BooleanCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Phone block
    if (stepType === "phone") {
      return <PhoneCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Email block
    if (stepType === "email") {
      return <EmailCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Website block
    if (stepType === "website") {
      return <WebsiteCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Number/Currency blocks
    if (stepType === "number" || stepType === "currency") {
      return <NumberCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Choice blocks (radio, multiple_choice, choice)
    if (stepType === "radio" || stepType === "multiple_choice" || stepType === "choice") {
      return <ChoiceCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Address block
    if (stepType === "address") {
      return <AddressCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Multi-field block
    if (stepType === "multi_field") {
      return <MultiFieldCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Scale block
    if (stepType === "scale") {
      return <ScaleCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Display block
    if (stepType === "display") {
      return <DisplayCardEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Final block
    if (stepType === "final_documents") {
      return <FinalBlockEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Signature block
    if (stepType === "signature_block") {
      return <SignatureBlockEditor stepId={step.id} sectionId={sectionId} step={step} />;
    }

    // Default fallback - show a message
    return (
      <div className="p-4 border-t bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Editor for {stepType} blocks is not yet implemented.
        </p>
      </div>
    );
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

            {/* Icon and Collapse Button (stacked vertically) */}
            <div className="flex flex-col items-center gap-1">
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
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.();
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.kind === "step" ? (
                <>
                  {editingTitle && isSelected ? (
                    <Input
                      value={titleValue}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      onBlur={handleTitleBlur}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                          // Navigate to next item after blur completes
                          setTimeout(() => onEnterNext?.(), 0);
                        }
                      }}
                      autoFocus
                      className="font-medium text-sm h-7 mb-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className={cn(
                        "font-medium text-sm truncate",
                        isSelected && "cursor-text hover:bg-accent/50 rounded px-1 -mx-1"
                      )}
                      onClick={handleTitleClick}
                    >
                      {item.data.title}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {getBlockByType(item.data.type)?.label || item.data.type}
                    </Badge>
                    {editingAlias && isSelected ? (
                      <Input
                        value={aliasValue}
                        onChange={(e) => handleAliasChange(e.target.value)}
                        onBlur={handleAliasBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                            // Navigate to next item after blur completes
                            setTimeout(() => onEnterNext?.(), 0);
                          }
                        }}
                        autoFocus
                        placeholder="variable name"
                        className="font-mono text-xs h-6 w-32"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        {item.data.alias ? (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs font-mono",
                              isSelected && "cursor-text hover:bg-secondary/80"
                            )}
                            onClick={handleAliasClick}
                          >
                            {item.data.alias}
                          </Badge>
                        ) : isSelected && (
                          <Badge
                            variant="outline"
                            className="text-xs font-mono cursor-text hover:bg-accent/50 text-muted-foreground"
                            onClick={handleAliasClick}
                          >
                            + variable
                          </Badge>
                        )}
                      </>
                    )}
                    {item.data.required && (
                      <span className="text-xs text-destructive">Required</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-sm">
                    {item.data.type === "js" && item.data.config?.name
                      ? item.data.config.name
                      : (BLOCK_TYPE_LABELS[item.data.type] || item.data.type)}
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

          {/* Expanded Content - Block Editors */}
          {isExpanded && item.kind === "block" && item.data.type === "js" && (
            <div className="mt-3 pt-3 border-t">
              <JSBlockEditor
                block={item.data}
                onChange={handleJSBlockChange}
                workflowId={workflowId}
              />
            </div>
          )}

          {/* Expanded Content - Step Card Editors */}
          {isExpanded && item.kind === "step" && (
            <div className="mt-0">
              {renderStepEditor(item.data, workflowId, sectionId)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
