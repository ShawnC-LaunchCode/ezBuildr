/**
 * Page Canvas Component
 * Main canvas that renders pages and their optional Section hierarchy.
 * One DndContext coordinates Section, page, and step sorting.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildCanvasLayout,
  canvasCollisionDetection,
  canvasKeyboardCoordinates,
  type CanvasLayoutUnit,
} from "@/lib/dnd";
import { UI_LABELS } from "@/lib/labels";
import type { Mode } from "@/lib/mode";
import type { ApiBlock, ApiPage, ApiStep } from "@/lib/vault-api";
import {
  useAllSteps,
  useBlocks,
  useCreatePageAtEnd,
  usePages,
  useSections,
  useTransformBlocks,
  useWorkflowMode,
} from "@/lib/vault-hooks";

import { BlockEditorDialog, type UniversalBlock } from "../BlockEditorDialog";

import { CanvasLandingRail, PageDropIndicator } from "./CanvasDropIndicator";
import { CanvasSection } from "./CanvasSection";
import { EmptySectionConfirmation } from "./EmptySectionConfirmation";
import { usePageDragAndDrop } from "./PageCanvas.hooks";
import { PageCard } from "./PageCard";

interface PageCanvasProps {
  workflowId: string;
}

interface CanvasPageProps {
  workflowId: string;
  page: ApiPage;
  blocks: ApiBlock[];
  steps: ApiStep[];
  total: number;
  landingLabel: string | null;
  onEditBlock: (blockId: string) => void;
}

function CanvasPage({
  workflowId,
  page,
  blocks,
  steps,
  total,
  landingLabel,
  onEditBlock,
}: CanvasPageProps) {
  return (
    <div data-canvas-page={page.id}>
      <PageDropIndicator label={landingLabel} />
      <PageCard
        workflowId={workflowId}
        page={page}
        blocks={blocks}
        allSteps={steps}
        index={page.order}
        total={total}
        onEditBlock={onEditBlock}
      />
    </div>
  );
}

function ungroupedLandingLabel(unit: CanvasLayoutUnit | undefined, isAfter: boolean): string {
  if (!unit) {
    return "Land as an ungrouped page at the end";
  }
  const title = unit.kind === "section" ? `Section “${unit.section.title}”` : `“${unit.page.title}”`;
  return `Land as an ungrouped page ${isAfter ? "after" : "before"} ${title}`;
}

export function PageCanvas({ workflowId }: PageCanvasProps) {
  const { data: pages = [] } = usePages(workflowId);
  const { data: sections = [] } = useSections(workflowId);
  const { data: allBlocks = [] } = useBlocks(workflowId);
  const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
  const { data: modeData } = useWorkflowMode(workflowId);
  const mode = modeData?.mode ?? "easy";
  const { createPageAtEnd } = useCreatePageAtEnd(workflowId);

  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);

  const handleEditBlock = (blockId: string): void => {
    const regularBlock = allBlocks.find((block) => block.id === blockId);
    const transformBlock = transformBlocks.find((block) => block.id === blockId);
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

  const allSteps = useAllSteps(pages);
  const {
    activeDragData,
    overId,
    landingLabel,
    landingSectionId,
    pendingEmptySection,
    isSubmitting,
    handleDragStart,
    handleDragOver,
    handleDragCancel,
    handleDragEnd,
    cancelPendingMove,
    confirmPendingMove,
  } = usePageDragAndDrop(workflowId, pages, sections, allSteps);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: canvasKeyboardCoordinates }),
  );

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h3 className="mb-2 text-lg font-semibold">{UI_LABELS.NO_PAGES}</h3>
          <p className="text-sm text-muted-foreground">
            Use the &quot;{UI_LABELS.ADD_PAGE}&quot; button in the sidebar to create your first page.
          </p>
        </div>
      </div>
    );
  }

  const pageDragActive = activeDragData?.kind === "page";
  const layout = sections.length === 0 ? [] : buildCanvasLayout(pages, sections);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-3 sm:p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={canvasCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={(event) => { void handleDragEnd(event); }}
        >
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {landingLabel ?? ""}
          </div>

          {sections.length === 0 ? (
            <SortableContext
              items={pages.map((page) => page.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-6">
                {pages.map((page) => (
                  <PageCard
                    key={page.id}
                    workflowId={workflowId}
                    page={page}
                    blocks={allBlocks}
                    allSteps={allSteps[page.id] ?? []}
                    index={page.order}
                    total={pages.length}
                    onEditBlock={handleEditBlock}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <SortableContext
              items={layout.map((unit) => unit.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {layout.map((unit) => {
                  const firstPageIndex = unit.kind === "page"
                    ? unit.page.order
                    : unit.pages[0]?.order ?? 0;
                  return (
                    <div key={unit.id}>
                      <CanvasLandingRail
                        index={firstPageIndex}
                        label={ungroupedLandingLabel(unit, false)}
                        enabled={pageDragActive}
                      />
                      {unit.kind === "page" ? (
                        <CanvasPage
                          workflowId={workflowId}
                          page={unit.page}
                          blocks={allBlocks}
                          steps={allSteps[unit.page.id] ?? []}
                          total={pages.length}
                          landingLabel={overId === unit.page.id ? landingLabel : null}
                          onEditBlock={handleEditBlock}
                        />
                      ) : (
                        <CanvasSection
                          section={unit.section}
                          pages={unit.pages}
                          isLandingTarget={landingSectionId === unit.section.id}
                        >
                          {unit.pages.map((page) => (
                            <CanvasPage
                              key={page.id}
                              workflowId={workflowId}
                              page={page}
                              blocks={allBlocks}
                              steps={allSteps[page.id] ?? []}
                              total={pages.length}
                              landingLabel={overId === page.id ? landingLabel : null}
                              onEditBlock={handleEditBlock}
                            />
                          ))}
                        </CanvasSection>
                      )}
                    </div>
                  );
                })}
                <CanvasLandingRail
                  index={pages.length}
                  label={ungroupedLandingLabel(layout.at(-1), true)}
                  enabled={pageDragActive}
                />
              </div>
            </SortableContext>
          )}

          <div className="pb-8 pt-6">
            <Button
              onClick={() => { void createPageAtEnd(); }}
              variant="outline"
              className="h-14 w-full rounded-lg border-dashed bg-card text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
            >
              <Plus className="mr-2 size-4" />
              {UI_LABELS.ADD_PAGE}
            </Button>
          </div>
        </DndContext>

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
        <EmptySectionConfirmation
          sectionTitle={pendingEmptySection?.title ?? null}
          isPending={isSubmitting}
          onCancel={cancelPendingMove}
          onConfirm={confirmPendingMove}
        />
      </div>
    </div>
  );
}
