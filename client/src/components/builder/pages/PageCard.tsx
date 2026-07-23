/**
 * Page Card Component
 * Displays one page (section) with its questions and logic blocks
 * Includes toolbars for adding questions and logic
 */
import { CSS } from "@dnd-kit/utilities";

import { SectionLogicSheet } from "@/components/logic";
import { DeleteImpactDialog } from "@/components/shared/DeleteImpactDialog";
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    transform,
    transition,
    isDragging,
    localTitle,
    localDescription,
    handleTitleChange,
    flushTitle,
    handleDescriptionChange,
    flushDescription,
    handleDelete,
    handleDuplicate,
    isDeleteImpactOpen,
    setIsDeleteImpactOpen,
    pendingDeleteImpact,
    confirmDestructiveDelete,
    isDeleteSectionPending,
    selectSection,
    selectBlock,
    selectStep,
    handleToggleExpand,
    handleToggleBlockExpand,
    nextOrder,
  } = usePageCardLogic(workflowId, page, blocks, steps);

  const style = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
          flushTitle={flushTitle}
          localTitle={localTitle}
          onDescriptionChange={handleDescriptionChange}
          flushDescription={flushDescription}
          localDescription={localDescription}
          onSelectSection={() => {
            void selectSection(page.id);
          }}
          onOpenLogicSheet={() => {
            void setIsLogicSheetOpen(true);
          }}
          onDuplicate={() => {
            void handleDuplicate();
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

      <DeleteImpactDialog
        open={isDeleteImpactOpen}
        onOpenChange={setIsDeleteImpactOpen}
        impact={pendingDeleteImpact}
        itemLabel="page"
        onConfirm={confirmDestructiveDelete}
        isPending={isDeleteSectionPending}
      />
    </div>
  );
}