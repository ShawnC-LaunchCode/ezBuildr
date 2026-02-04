/**
 * Page Card Component
 * Displays one page (section) with its questions and logic blocks
 * Includes toolbars for adding questions and logic
 */
import { CSS } from "@dnd-kit/utilities";

import { SectionLogicSheet } from "@/components/logic";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ApiSection, ApiBlock, ApiStep } from "@/lib/vault-api";

import { PageCardHeader } from "./PageCard.Header";
import { usePageCardLogic } from "./PageCard.hooks";
import { PageContent } from "./PageContent";

interface PageCardProps {
  workflowId: string;
  page: ApiSection;
  blocks: ApiBlock[];
  allSteps: ApiStep[];
  index?: number;
  total?: number;
  onEditBlock?: (blockId: string) => void;
}

export function PageCard({
  workflowId,
  page,
  blocks,
  allSteps: steps,
  index,
  total,
  onEditBlock,
}: PageCardProps) {
  const {
    mode,
    isCollapsed,
    setIsCollapsed,
    isLogicSheetOpen,
    setIsLogicSheetOpen,
    expandedStepIds,
    setExpandedStepIds,
    expandedBlockIds,
    // setExpandedBlockIds is unused here
    autoFocusStepId,
    setAutoFocusStepId,
    items,
    isFinalDocumentsSection,
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    handleTitleChange,
    handleDescriptionChange,
    handleDelete,
    selectSection,
    selectBlock,
    selectStep,
    handleToggleExpand,
    handleToggleBlockExpand,
    nextOrder,
  } = usePageCardLogic(workflowId, page, blocks, steps);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={cn("shadow-sm", isDragging && "opacity-50")}>
        <PageCardHeader
          page={page}
          mode={mode}
          index={index}
          total={total}
          isFinalDocumentsSection={isFinalDocumentsSection}
          isCollapsed={isCollapsed}
          attributes={attributes}
          listeners={listeners}
          onToggleCollapse={(e) => {
            e.stopPropagation();
            setIsCollapsed(!isCollapsed);
          }}
          onTitleChange={handleTitleChange}
          onDescriptionChange={handleDescriptionChange}
          onSelectSection={() => {
            void selectSection(page.id);
          }}
          onOpenLogicSheet={() => {
            void setIsLogicSheetOpen(true);
          }}
          onDelete={() => {
            void handleDelete();
          }}
        />

        {!isCollapsed && (
          <PageContent
            page={page}
            workflowId={workflowId}
            mode={mode}
            isFinalDocumentsSection={isFinalDocumentsSection}
            items={items}
            expandedStepIds={expandedStepIds}
            expandedBlockIds={expandedBlockIds}
            autoFocusStepId={autoFocusStepId}
            nextOrder={nextOrder}
            onSelectStep={selectStep}
            onSelectBlock={selectBlock}
            onSetExpandedStepIds={setExpandedStepIds}
            onSetAutoFocusStepId={setAutoFocusStepId}
            onToggleExpand={handleToggleExpand}
            onToggleBlockExpand={handleToggleBlockExpand}
            onEditBlock={onEditBlock}
          />
        )}
      </Card>

      <SectionLogicSheet
        open={isLogicSheetOpen}
        onOpenChange={setIsLogicSheetOpen}
        section={page}
        workflowId={workflowId}
      />
    </div>
  );
}