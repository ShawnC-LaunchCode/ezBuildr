/**
 * Page Canvas Component
 * Main canvas that renders the vertical stack of page cards
 */

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
import { useSections, useBlocks, useReorderSections } from "@/lib/vault-hooks";
import { PageCard } from "./PageCard";
import { UI_LABELS } from "@/lib/labels";

interface PageCanvasProps {
  workflowId: string;
}

export function PageCanvas({ workflowId }: PageCanvasProps) {
  const { data: pages = [] } = useSections(workflowId);
  const { data: allBlocks = [] } = useBlocks(workflowId);
  const reorderSectionsMutation = useReorderSections();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pages.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {pages.map((page) => (
                <PageCard
                  key={page.id}
                  workflowId={workflowId}
                  page={page}
                  blocks={allBlocks}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
