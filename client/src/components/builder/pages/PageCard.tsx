/**
 * Page Card Component
 * Displays one page (section) with its questions and logic blocks
 * Includes toolbars for adding questions and logic
 */

import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, Settings, Trash2, ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LogicIndicator, SectionLogicSheet } from "@/components/logic";
import { useSteps, useBlocks, useTransformBlocks, useUpdateSection, useDeleteSection, useReorderSteps, useReorderBlocks } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { useToast } from "@/hooks/use-toast";
import { combinePageItems, recomputeOrders, getNextOrder } from "@/lib/dnd";
import { QuestionAddMenu } from "./QuestionAddMenu";
import { LogicAddMenu } from "./LogicAddMenu";
import { BlockCard } from "./BlockCard";
import { QuestionCard } from "../questions/QuestionCard";
import { UI_LABELS } from "@/lib/labels";
import type { ApiSection, ApiBlock } from "@/lib/vault-api";

interface PageCardProps {
  workflowId: string;
  page: ApiSection;
  blocks: ApiBlock[];
}

export function PageCard({ workflowId, page, blocks }: PageCardProps) {
  const { data: steps = [] } = useSteps(page.id);
  const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
  const updateSectionMutation = useUpdateSection();
  const deleteSectionMutation = useDeleteSection();
  const reorderStepsMutation = useReorderSteps();
  const reorderBlocksMutation = useReorderBlocks();
  const { selectSection, selectBlock, selectStep, selection } = useWorkflowBuilder();
  const { toast } = useToast();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
  const [autoFocusStepId, setAutoFocusStepId] = useState<string | null>(null);
  const [isLogicSheetOpen, setIsLogicSheetOpen] = useState(false);
  const prevSelectionRef = useRef<typeof selection>(null);
  const prevItemsLengthRef = useRef<number>(0);

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
  const items = combinePageItems(steps, allPageBlocks);

  // Auto-expand and focus newly selected items
  useEffect(() => {
    // Check if a new step was just selected
    if (
      selection?.type === "step" &&
      selection.id &&
      prevSelectionRef.current?.id !== selection.id
    ) {
      // Check if this step belongs to this page
      const stepInThisPage = steps.find((s) => s.id === selection.id);
      if (stepInThisPage) {
        // Expand and auto-focus
        setExpandedStepIds((prev) => new Set(prev).add(selection.id!));
        setAutoFocusStepId(selection.id);

        // Clear auto-focus after a short delay
        setTimeout(() => setAutoFocusStepId(null), 100);
      }
    }

    // Check if a new block was just selected
    if (
      selection?.type === "block" &&
      selection.id &&
      prevSelectionRef.current?.id !== selection.id
    ) {
      // Check if this block belongs to this page
      const blockInThisPage = allPageBlocks.find((b) => b.id === selection.id);
      if (blockInThisPage) {
        // Expand the block
        setExpandedBlockIds((prev) => new Set(prev).add(selection.id!));
      }
    }
    prevSelectionRef.current = selection;
  }, [selection, steps, allPageBlocks]);

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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const { steps: reorderedSteps, blocks: reorderedBlocks } = recomputeOrders(
          items,
          oldIndex,
          newIndex
        );

        // Submit both reorder mutations
        if (reorderedSteps.length > 0) {
          reorderStepsMutation.mutate({ sectionId: page.id, steps: reorderedSteps });
        }
        if (reorderedBlocks.length > 0) {
          reorderBlocksMutation.mutate({ workflowId, blocks: reorderedBlocks });
        }
      }
    }
  };

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

          {/* Page title and description */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Input
                value={page.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="font-semibold text-base border-none shadow-none px-0 focus-visible:ring-0 flex-1"
                placeholder="Page title"
              />
              <LogicIndicator
                visibleIf={page.visibleIf}
                variant="badge"
                size="sm"
                elementType="page"
              />
            </div>
            <AutoExpandTextarea
              value={page.description || ""}
              onChange={(e) => handleDescriptionChange(e.target.value)}
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
                <DropdownMenuItem onClick={() => selectSection(page.id)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Page Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsLogicSheetOpen(true)}>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Visibility Logic
                  {page.visibleIf && (
                    <span className="ml-auto text-xs text-amber-600">Active</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
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

      <CardContent className="pt-0 space-y-3">
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {UI_LABELS.NO_QUESTIONS}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
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
                      <QuestionCard
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
                      />
                    );
                  }
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add buttons at the bottom */}
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
      </CardContent>
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
