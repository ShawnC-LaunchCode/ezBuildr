/**
 * Page Canvas Component
 * Main canvas that renders the vertical stack of page cards
 * Supports drag-and-drop for both pages and steps (including cross-page)
 */
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { UI_LABELS } from "@/lib/labels";
import { Mode } from "@/lib/mode";
import {
  useBlocks,
  useCreatePageAtEnd,
  usePages,
  useTransformBlocks,
  useWorkflowMode,
  useAllSteps,
} from "@/lib/vault-hooks";

import { BlockEditorDialog, UniversalBlock } from "../BlockEditorDialog";

import { usePageDragAndDrop } from "./PageCanvas.hooks";
import { PageCard } from "./PageCard";

interface PageCanvasProps {
  workflowId: string;
}

export function PageCanvas({ workflowId }: PageCanvasProps) {
  const { data: pages = [] } = usePages(workflowId);
  const { data: allBlocks = [] } = useBlocks(workflowId);
  const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
  const { data: modeData } = useWorkflowMode(workflowId);
  const mode = modeData?.mode ?? "easy";

  const { createPageAtEnd } = useCreatePageAtEnd(workflowId);

  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);

  const handleCreatePage = async () => {
    await createPageAtEnd();
  };

  const handleEditBlock = (blockId: string) => {
    // Find the block in regular blocks or transform blocks
    const regularBlock = allBlocks.find((b) => b.id === blockId);
    const transformBlock = transformBlocks.find((tb) => tb.id === blockId);

    if (regularBlock) {
      setEditingBlock({
        id: regularBlock.id,
        type: regularBlock.type,
        phase: regularBlock.phase,
        order: regularBlock.order,
        enabled: regularBlock.enabled,
        raw: regularBlock as unknown as Record<string, unknown>,
        source: "regular",
        title: undefined,
        displayType: regularBlock.type,
      });
      setIsBlockEditorOpen(true);
    } else if (transformBlock) {
      setEditingBlock({
        id: transformBlock.id,
        type: "js",
        phase: transformBlock.phase,
        order: transformBlock.order,
        enabled: transformBlock.enabled,
        raw: transformBlock as unknown as Record<string, unknown>,
        source: "transform",
        title: transformBlock.name,
        displayType: "js",
      });
      setIsBlockEditorOpen(true);
    }
  };

  // Fetch all steps for all pages using the proper useAllSteps hook
  // This respects React's Rules of Hooks by using useQueries internally
  const allSteps = useAllSteps(pages);

  const { handleDragStart, handleDragEnd } = usePageDragAndDrop(
    workflowId,
    pages,
    allSteps
  );

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

  if (pages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold mb-2">{UI_LABELS.NO_PAGES}</h3>
          <p className="text-muted-foreground text-sm">
            Use the &quot;{UI_LABELS.ADD_PAGE}&quot; button in the sidebar to create your first page.
          </p>
        </div>
      </div>
    );
  }

  // Get all sortable item IDs (pages + all steps from all pages)
  const allItemIds = [
    ...pages.map((p) => p.id),
    ...Object.values(allSteps)
      .flat()
      .map((s) => s.id),
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={(e) => { void handleDragEnd(e); }}
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
                  allSteps={allSteps[page.id] ?? []}
                  index={index}
                  total={pages.length}
                  onEditBlock={handleEditBlock}
                />
              ))}
              {/* Add Page Button at Bottom
                  Sized and coloured to read as the next card in the stack:
                  same width, card surface, rounded-lg and shadow-sm as the
                  PageCards above. The dashed border is what keeps it legible
                  as an empty slot rather than a real page. */}
              <div className="pb-8">
                <Button
                  onClick={() => { void handleCreatePage(); }}
                  variant="outline"
                  className="h-14 w-full rounded-lg border-dashed bg-card text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
                >
                  <Plus className="mr-2 h-4 w-4" />
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
          mode={mode as Mode}
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