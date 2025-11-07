/**
 * Page Card Component
 * Displays one page (section) with its questions and logic blocks
 * Includes toolbars for adding questions and logic
 */

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
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSteps, useBlocks, useUpdateSection, useDeleteSection, useReorderSteps, useReorderBlocks } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { useToast } from "@/hooks/use-toast";
import { combinePageItems, recomputeOrders, getNextOrder } from "@/lib/dnd";
import { QuestionAddMenu } from "./QuestionAddMenu";
import { LogicAddMenu } from "./LogicAddMenu";
import { BlockCard } from "./BlockCard";
import { UI_LABELS } from "@/lib/labels";
import type { ApiSection, ApiBlock } from "@/lib/vault-api";

interface PageCardProps {
  workflowId: string;
  page: ApiSection;
  blocks: ApiBlock[];
}

export function PageCard({ workflowId, page, blocks }: PageCardProps) {
  const { data: steps = [] } = useSteps(page.id);
  const updateSectionMutation = useUpdateSection();
  const deleteSectionMutation = useDeleteSection();
  const reorderStepsMutation = useReorderSteps();
  const reorderBlocksMutation = useReorderBlocks();
  const { selectSection } = useWorkflowBuilder();
  const { toast } = useToast();

  // Combine steps and blocks into sortable items
  const pageBlocks = blocks.filter((b) => b.sectionId === page.id);
  const items = combinePageItems(steps, pageBlocks);

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

  const handleUpdateTitle = (title: string) => {
    updateSectionMutation.mutate({ id: page.id, workflowId, title });
  };

  const handleUpdateDescription = (description: string) => {
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

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          {/* Drag handle for page reordering (future feature) */}
          <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Page title and description */}
          <div className="flex-1 space-y-2">
            <Input
              value={page.title}
              onChange={(e) => handleUpdateTitle(e.target.value)}
              className="font-semibold text-base border-none shadow-none px-0 focus-visible:ring-0"
              placeholder="Page title"
            />
            <Textarea
              value={page.description || ""}
              onChange={(e) => handleUpdateDescription(e.target.value)}
              className="text-sm text-muted-foreground border-none shadow-none px-0 resize-none focus-visible:ring-0"
              placeholder="Page description (optional)"
              rows={2}
            />
          </div>

          {/* Page actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => selectSection(page.id)}
              title="Page settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              title="Delete page"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toolbars */}
        <div className="flex items-center gap-2 pt-2">
          <QuestionAddMenu sectionId={page.id} nextOrder={nextOrder} />
          <LogicAddMenu
            workflowId={workflowId}
            sectionId={page.id}
            nextOrder={nextOrder}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
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
                {items.map((item) => (
                  <BlockCard
                    key={item.id}
                    item={item}
                    workflowId={workflowId}
                    sectionId={page.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
