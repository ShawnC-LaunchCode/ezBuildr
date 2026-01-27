/**
 * Page Card Component
 * Displays one page (section) with its questions and logic blocks
 * Includes toolbars for adding questions and logic
 */
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings, Trash2, ChevronDown, ChevronRight, EyeOff, FileText } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { LogicIndicator, SectionLogicSheet } from "@/components/logic";
import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { combinePageItems, getNextOrder } from "@/lib/dnd";
import { UI_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ApiSection, ApiBlock, ApiStep } from "@/lib/vault-api";
import { useTransformBlocks, useUpdateSection, useDeleteSection, useReorderBlocks, useWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { StepCard } from "../cards/StepCard";
import { FinalDocumentsSectionEditor } from "../final/FinalDocumentsSectionEditor";

import { BlockCard } from "./BlockCard";
import { LogicAddMenu } from "./LogicAddMenu";
import { QuestionAddMenu } from "./QuestionAddMenu";
interface PageCardProps {
  workflowId: string;
  page: ApiSection;
  blocks: ApiBlock[];
  allSteps: ApiStep[];
  index?: number;
  total?: number;
  onEditBlock?: (blockId: string) => void;
}
export function PageCard({ workflowId, page, blocks, allSteps: steps, index, total, onEditBlock }: PageCardProps) {
  const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
  const { data: modeData } = useWorkflowMode(workflowId);
  const mode = modeData?.mode || 'easy';
  const updateSectionMutation = useUpdateSection();
  const deleteSectionMutation = useDeleteSection();
  const reorderBlocksMutation = useReorderBlocks();
  const { selectSection, selectBlock, selectStep, selection } = useWorkflowBuilder();
  const { toast } = useToast();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
  const [autoFocusStepId, setAutoFocusStepId] = useState<string | null>(null);
  const [isLogicSheetOpen, setIsLogicSheetOpen] = useState(false);
  const prevSelectionRef = useRef<typeof selection>(null);
  const prevItemsLengthRef = useRef<number>(0);
  // Check if this is a Final Documents section
  const isFinalDocumentsSection = (page.config)?.finalBlock === true;
  // For Final Documents sections, filter out all steps (they shouldn't exist, but if they do, hide them)
  // The only step should be the system step of type 'final_documents' which is hidden anyway
  const filteredSteps = isFinalDocumentsSection
    ? steps.filter(s => s.type === 'final_documents')
    : steps;
  // Combine steps and blocks into sortable items
  const pageBlocks = blocks.filter((b) => b.sectionId === page.id);
  // Convert transform blocks to ApiBlock format for this section
  const pageTransformBlocks: ApiBlock[] = transformBlocks
    .filter((tb) => tb.sectionId === page.id)
    .map((tb) => ({
      id: tb.id,
      workflowId: tb.workflowId,
      sectionId: tb.sectionId ?? null,
      type: "js" as const,
      phase: tb.phase as any,
      config: {
        name: tb.name,
        language: tb.language,
        code: tb.code,
        inputKeys: tb.inputKeys,
        outputKey: tb.outputKey,
        timeoutMs: tb.timeoutMs,
      },
      enabled: tb.enabled,
      order: tb.order,
      createdAt: tb.createdAt,
      updatedAt: tb.updatedAt,
    }));
  // Combine regular blocks and transform blocks
  const allPageBlocks = [...pageBlocks, ...pageTransformBlocks];
  const items = combinePageItems(filteredSteps, allPageBlocks);
  // Auto-expand and focus newly selected items
  // We track a "pending" focus ID to handle the race condition where selection updates
  // before the new step data has propagated to the props.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    // If we have a selected step
    if (selection?.type === "step" && selection.id) {
      // Check if it's a new selection
      const isNewSelection = prevSelectionRef.current?.id !== selection.id;

      // If it's a new selection, we validly want to try to focus it
      if (isNewSelection) {
        setPendingFocusId(selection.id);
      }
    }
    prevSelectionRef.current = selection;
  }, [selection]);

  // Effect to apply focus once the step is available
  useEffect(() => {
    if (pendingFocusId) {
      const stepInThisPage = steps.find((s) => s.id === pendingFocusId);

      if (stepInThisPage) {
        // Step is now available!
        setExpandedStepIds((prev) => new Set(prev).add(pendingFocusId));
        setAutoFocusStepId(pendingFocusId);
        setPendingFocusId(null);

        // Clear auto-focus after a short delay to allow animation
        setTimeout(() => setAutoFocusStepId(null), 100);
      }
    }
  }, [pendingFocusId, steps]);
  // Auto-expand newly created items
  useEffect(() => {
    if (items.length > prevItemsLengthRef.current && prevItemsLengthRef.current > 0) {
      // A new item was just added, find it and expand it
      const newItem = items[items.length - 1];
      if (newItem) {
        if (newItem.kind === "step") {
          setExpandedStepIds((prev) => new Set(prev).add(newItem.id));
          setAutoFocusStepId(newItem.id);
          setTimeout(() => setAutoFocusStepId(null), 100);
        } else {
          setExpandedBlockIds((prev) => new Set(prev).add(newItem.id));
        }
      }
    }
    prevItemsLengthRef.current = items.length;
  }, [items]);
  // Make the page card sortable for page reordering
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });
  // Immediate update with optimistic rendering
  const handleTitleChange = (title: string) => {
    updateSectionMutation.mutate({ id: page.id, workflowId, title });
  };
  // Immediate update with optimistic rendering
  const handleDescriptionChange = (description: string) => {
    updateSectionMutation.mutate({ id: page.id, workflowId, description });
  };
  const handleDelete = async () => {
    if (!confirm(`Delete page "${page.title}"? This will remove all questions and logic blocks.`)) {
      return;
    }
    try {
      await deleteSectionMutation.mutateAsync({ id: page.id, workflowId });
      toast({
        title: "Page deleted",
        description: `"${page.title}" has been removed`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete page",
        variant: "destructive",
      });
    }
  };
  const nextOrder = getNextOrder(items);
  const handleToggleExpand = (stepId: string) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };
  const handleToggleBlockExpand = (blockId: string) => {
    setExpandedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <Card className={cn("shadow-sm", isDragging && "opacity-50")}>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-2">
            {/* Drag handle for page reordering */}
            <button
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            {/* Collapse/Expand button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 mt-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(!isCollapsed);
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            {/* Page title and description */}
            <div className="flex-1 space-y-1">
              {mode === 'easy' && typeof index === 'number' && typeof total === 'number' && !isFinalDocumentsSection && (
                <div className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest pl-1 select-none">
                  Page {index + 1} of {total}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={page.title}
                  onChange={(e) => { void handleTitleChange(e.target.value); }}
                  className="font-semibold text-base border-none shadow-none px-0 focus-visible:ring-0 flex-1"
                  placeholder="Page title"
                />
                {isFinalDocumentsSection && (
                  <Badge variant="secondary" className="text-xs px-2 py-1">
                    <FileText className="h-3 w-3 mr-1" />
                    Final Documents Block
                  </Badge>
                )}
                <LogicIndicator
                  visibleIf={page.visibleIf}
                  variant="badge"
                  size="sm"
                  elementType="page"
                />
              </div>
              <AutoExpandTextarea
                value={page.description || ""}
                onChange={(e) => { void handleDescriptionChange(e.target.value); }}
                className="text-sm text-muted-foreground border-none shadow-none px-0 focus-visible:ring-0 min-h-0"
                placeholder="Page description (optional)"
                minRows={1}
                maxRows={4}
              />
            </div>
            {/* Page actions */}
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" title="Page settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { void selectSection(page.id); }}>
                    <Settings className="h-4 w-4 mr-2" />
                    Page Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { void setIsLogicSheetOpen(true); }}>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Visibility Logic
                    {page.visibleIf && (
                      <span className="ml-auto text-xs text-amber-600">Active</span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => { void handleDelete(); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Page
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        {!isCollapsed && (
          <CardContent className="pt-0 space-y-3">
            {isFinalDocumentsSection ? (
              <FinalDocumentsSectionEditor section={page} workflowId={workflowId} />
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                {mode === 'easy' ? (
                  <>
                    <div className="p-3 bg-amber-50 rounded-full mb-2">
                      <FileText className="w-6 h-6 text-amber-500" />
                    </div>
                    <p className="font-medium text-amber-900">Add your first question to this page</p>
                    <p className="text-xs text-amber-700 max-w-xs">
                      Start by asking something simple. You can always add more pages later.
                    </p>
                  </>
                ) : (
                  UI_LABELS.NO_QUESTIONS
                )}
              </div>
            ) : (
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {items.map((item, index) => {
                    const handleEnterNext = () => {
                      // Find next item in list
                      if (index < items.length - 1) {
                        const nextItem = items[index + 1];
                        if (nextItem.kind === "step") {
                          // Select and expand next step
                          selectStep(nextItem.id);
                          setExpandedStepIds((prev) => new Set(prev).add(nextItem.id));
                          setAutoFocusStepId(nextItem.id);
                        } else {
                          // Just select next block
                          selectBlock(nextItem.id);
                        }
                      }
                    };
                    if (item.kind === "step") {
                      return (
                        <StepCard
                          key={item.id}
                          step={item.data}
                          sectionId={page.id}
                          workflowId={workflowId}
                          isExpanded={expandedStepIds.has(item.id)}
                          autoFocus={autoFocusStepId === item.id}
                          onToggleExpand={() => handleToggleExpand(item.id)}
                          onEnterNext={handleEnterNext}
                        />
                      );
                    } else {
                      return (
                        <BlockCard
                          key={item.id}
                          item={item}
                          workflowId={workflowId}
                          sectionId={page.id}
                          isExpanded={expandedBlockIds.has(item.id)}
                          onToggleExpand={() => handleToggleBlockExpand(item.id)}
                          onEnterNext={handleEnterNext}
                          onEdit={() => onEditBlock?.(item.id)}
                        />
                      );
                    }
                  })}
                </div>
              </SortableContext>
            )}
            {/* Add buttons at the bottom - hidden for Final Documents sections */}
            {!isFinalDocumentsSection && (
              <div className="space-y-2">
                {mode === 'easy' && items.length > 0 && (
                  <div className="flex items-center gap-2 px-1 pb-1 animate-in fade-in slide-in-from-top-1">
                    <span className="text-[10px] text-muted-foreground italic">
                      You can add another question here, or create a new page below.
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <QuestionAddMenu
                    sectionId={page.id}
                    nextOrder={nextOrder}
                    workflowId={workflowId}
                  />
                  <LogicAddMenu
                    workflowId={workflowId}
                    sectionId={page.id}
                    nextOrder={nextOrder}
                  />
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
      {/* Section Logic Sheet */}
      <SectionLogicSheet
        open={isLogicSheetOpen}
        onOpenChange={setIsLogicSheetOpen}
        section={page}
        workflowId={workflowId}
      />
    </div>
  );
}