/**
 * Page Canvas Component
 * Main canvas that renders the vertical stack of page cards
 * Supports drag-and-drop for both sections and steps (including cross-section)
 */
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { UI_LABELS } from "@/lib/labels";
import type {  } from "@/lib/vault-api";
import { useSections, useBlocks, useReorderSections, useAllSteps, useUpdateStep, useReorderSteps, useCreateSection, useWorkflowMode, useTransformBlocks } from "@/lib/vault-hooks";

import { BlockEditorDialog, type UniversalBlock } from "../BlockEditorDialog";

import { PageCard } from "./PageCard";
interface PageCanvasProps {
  workflowId: string;
}
interface DragData {
  type: 'section' | 'step';
  id: string;
  sectionId?: string; // For steps, which section they belong to
}
export function PageCanvas({ workflowId }: PageCanvasProps) {
  const { data: pages = [] } = useSections(workflowId);
  const { data: allBlocks = [] } = useBlocks(workflowId);
  const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
  const { data: modeData } = useWorkflowMode(workflowId);
  const mode = modeData?.mode || 'easy';
  const reorderSectionsMutation = useReorderSections();
  const reorderStepsMutation = useReorderSteps();
  const updateStepMutation = useUpdateStep();
  const createSectionMutation = useCreateSection();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const handleCreateSection = async () => {
    const order = pages?.length || 0;
    await createSectionMutation.mutateAsync({
      workflowId,
      title: `${UI_LABELS.PAGE} ${order + 1}`,
      order,
    });
  };
  const handleEditBlock = (blockId: string) => {
    // Find the block in regular blocks or transform blocks
    const regularBlock = allBlocks.find(b => b.id === blockId);
    const transformBlock = transformBlocks.find(tb => tb.id === blockId);
    if (regularBlock) {
      setEditingBlock({
        id: regularBlock.id,
        type: regularBlock.type,
        phase: regularBlock.phase,
        order: regularBlock.order,
        enabled: regularBlock.enabled,
        raw: regularBlock,
        source: 'regular',
        title: undefined,
        displayType: regularBlock.type,
      });
      setIsBlockEditorOpen(true);
    } else if (transformBlock) {
      setEditingBlock({
        id: transformBlock.id,
        type: 'js',
        phase: transformBlock.phase,
        order: transformBlock.order,
        enabled: transformBlock.enabled,
        raw: transformBlock,
        source: 'transform',
        title: transformBlock.name,
        displayType: 'js',
      });
      setIsBlockEditorOpen(true);
    }
  };
  // Fetch all steps for all sections using the proper useAllSteps hook
  // This respects React's Rules of Hooks by using useQueries internally
  const allSteps = useAllSteps(pages);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveId(active.id);
    // Determine what type of item is being dragged
    const isSection = pages.some(p => p.id === active.id);
    if (isSection) {
      setActiveDragData({ type: 'section', id: active.id });
    } else {
      // Find which section this step belongs to
      const sectionId = Object.keys(allSteps).find(
        sId => allSteps[sId].some(step => step.id === active.id)
      );
      if (sectionId) {
        setActiveDragData({ type: 'step', id: active.id, sectionId });
      }
    }
  };
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragData(null);
    if (!over || active.id === over.id) {return;}
    // Handle section reordering
    if (activeDragData?.type === 'section') {
      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(pages, oldIndex, newIndex);
        const updates = reordered.map((page, index) => ({
          id: page.id,
          order: index,
        }));
        reorderSectionsMutation.mutate({
          workflowId,
          sections: updates,
        });
      }
      return;
    }
    // Handle step drag
    if (activeDragData?.type === 'step') {
      const sourceSectionId = activeDragData.sectionId!;
      // Determine target section (could be a section ID or a step ID)
      let targetSectionId: string | null = null;
      let targetStepId: string | null = null;
      // Check if dropped on a section
      if (pages.some(p => p.id === over.id)) {
        targetSectionId = over.id as string;
      } else {
        // Dropped on a step - find which section
        targetStepId = over.id as string;
        targetSectionId = Object.keys(allSteps).find(
          sId => allSteps[sId].some(step => step.id === targetStepId)
        ) || null;
      }
      if (!targetSectionId) {return;}
      const sourceSteps = [...allSteps[sourceSectionId]];
      const oldIndex = sourceSteps.findIndex(s => s.id === active.id);
      if (oldIndex === -1) {return;}
      // Same section - just reorder
      if (sourceSectionId === targetSectionId) {
        const targetSteps = [...allSteps[targetSectionId]];
        const newIndex = targetStepId
          ? targetSteps.findIndex(s => s.id === targetStepId)
          : targetSteps.length;
        if (newIndex === -1) {return;}
        const reordered = arrayMove(targetSteps, oldIndex, newIndex);
        const updates = reordered.map((step, index) => ({
          id: step.id,
          order: index,
        }));
        reorderStepsMutation.mutate({
          sectionId: targetSectionId,
          steps: updates,
        });
      } else {
        // Different section - move step and reorder both sections
        const draggedStep = sourceSteps[oldIndex];
        const targetSteps = [...allSteps[targetSectionId]];
        const newIndex = targetStepId
          ? targetSteps.findIndex(s => s.id === targetStepId)
          : targetSteps.length;
        // Update the step's section
        await updateStepMutation.mutateAsync({
          id: draggedStep.id,
          sectionId: targetSectionId,
          order: newIndex,
        });
        // Reorder remaining steps in source section
        const remainingSourceSteps = sourceSteps.filter(s => s.id !== draggedStep.id);
        const sourceUpdates = remainingSourceSteps.map((step, index) => ({
          id: step.id,
          order: index,
        }));
        if (sourceUpdates.length > 0) {
          reorderStepsMutation.mutate({
            sectionId: sourceSectionId,
            steps: sourceUpdates,
          });
        }
        // Reorder steps in target section
        const targetUpdatesWithNew = [
          ...targetSteps.slice(0, newIndex),
          draggedStep,
          ...targetSteps.slice(newIndex),
        ].map((step, index) => ({
          id: step.id,
          order: index,
        }));
        reorderStepsMutation.mutate({
          sectionId: targetSectionId,
          steps: targetUpdatesWithNew,
        });
      }
    }
  };
  if (pages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold mb-2">{UI_LABELS.NO_PAGES}</h3>
          <p className="text-muted-foreground text-sm">
            Use the "{UI_LABELS.ADD_PAGE}" button in the sidebar to create your first page.
          </p>
        </div>
      </div>
    );
  }
  // Get all sortable item IDs (sections + all steps from all sections)
  const allItemIds = [
    ...pages.map(p => p.id),
    ...Object.values(allSteps).flat().map(s => s.id),
  ];
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allItemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {pages.map((page, index) => (
                <PageCard
                  key={page.id}
                  workflowId={workflowId}
                  page={page}
                  blocks={allBlocks}
                  allSteps={allSteps[page.id] || []}
                  index={index}
                  total={pages.length}
                  onEditBlock={handleEditBlock}
                />
              ))}
              {/* Add Page Button at Bottom */}
              <div className="flex justify-center pt-4 pb-8">
                <Button
                  onClick={() => { void handleCreateSection(); }} // Ensure this function is defined
                  variant="outline"
                  className="w-full max-w-sm border-dashed text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {UI_LABELS.ADD_PAGE}
                </Button>
              </div>
            </div>
          </SortableContext>
        </DndContext>
        {/* Block Editor Dialog */}
        <BlockEditorDialog
          workflowId={workflowId}
          block={editingBlock}
          mode={mode as any}
          isOpen={isBlockEditorOpen}
          onClose={() => {
            setIsBlockEditorOpen(false);
            setEditingBlock(null);
          }}
        />
      </div>
    </div>
  );
}