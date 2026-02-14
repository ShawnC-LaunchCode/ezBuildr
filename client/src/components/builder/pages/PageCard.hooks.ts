import { DraggableAttributes } from "@dnd-kit/core";
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { combinePageItems, getNextOrder, PageItem } from "@/lib/dnd";
import { ApiBlock, ApiSection, ApiStep } from "@/lib/vault-api";
import {
    useDeleteSection,
    useTransformBlocks,
    useUpdateSection,
    useWorkflowMode,
} from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { useAutoFocus } from "./PageCard.focus.hooks";
import { mapTransformToBlock } from "./PageCard.utils";

interface UsePageCardLogicReturn {
    mode: string;
    isCollapsed: boolean;
    setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    isLogicSheetOpen: boolean;
    setIsLogicSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
    expandedStepIds: Set<string>;
    setExpandedStepIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    expandedBlockIds: Set<string>;
    setExpandedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    autoFocusStepId: string | null;
    setAutoFocusStepId: React.Dispatch<React.SetStateAction<string | null>>;
    items: PageItem[];
    isFinalDocumentsSection: boolean;
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    setNodeRef: (node: HTMLElement | null) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: any; // Transform type is complex, any or specific
    transition: string | undefined;
    isDragging: boolean;
    handleTitleChange: (title: string) => void;
    handleDescriptionChange: (description: string) => void;
    handleDelete: () => Promise<void>;
    selectSection: (id: string) => void;
    selectBlock: (id: string) => void;
    selectStep: (id: string) => void;
    handleToggleExpand: (stepId: string) => void;
    handleToggleBlockExpand: (blockId: string) => void;
    nextOrder: number;
}

export function usePageCardLogic(
    workflowId: string,
    page: ApiSection,
    blocks: ApiBlock[],
    steps: ApiStep[]
): UsePageCardLogicReturn {
    const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";
    const updateSectionMutation = useUpdateSection();
    const deleteSectionMutation = useDeleteSection();
    const { selectSection, selectBlock, selectStep } = useWorkflowBuilder();
    const { toast } = useToast();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isLogicSheetOpen, setIsLogicSheetOpen] = useState(false);

    // Check if this is a Final Documents section
    const isFinalDocumentsSection =
        (page.config as { finalBlock?: boolean } | undefined)?.finalBlock === true;

    // For Final Documents sections, filter out all steps
    const filteredSteps = isFinalDocumentsSection
        ? steps.filter((s) => s.type === "final_documents")
        : steps;

    // Combine steps and blocks into sortable items
    const pageBlocks = blocks.filter((b) => b.sectionId === page.id);

    const pageTransformBlocks: ApiBlock[] = mapTransformToBlock(
        transformBlocks,
        page.id
    );

    const allPageBlocks = [...pageBlocks, ...pageTransformBlocks];
    const items = combinePageItems(filteredSteps, allPageBlocks);

    // Auto-expand/focus logic
    const {
        expandedStepIds,
        setExpandedStepIds,
        expandedBlockIds,
        setExpandedBlockIds,
        autoFocusStepId,
        setAutoFocusStepId,
    } = useAutoFocus(steps, items);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: page.id });

    const handleTitleChange = (title: string): void => {
        updateSectionMutation.mutate({ id: page.id, workflowId, title });
    };

    const handleDescriptionChange = (description: string): void => {
        updateSectionMutation.mutate({ id: page.id, workflowId, description });
    };

    const handleDelete = async (): Promise<void> => {
        if (
            // eslint-disable-next-line no-alert
            !window.confirm(
                `Delete page "${page.title}"? This will remove all questions and logic blocks.`
            )
        ) {
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

    const handleToggleExpand = (stepId: string): void => {
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

    const handleToggleBlockExpand = (blockId: string): void => {
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

    const nextOrder = getNextOrder(items);

    return {
        mode,
        isCollapsed,
        setIsCollapsed,
        isLogicSheetOpen,
        setIsLogicSheetOpen,
        expandedStepIds,
        setExpandedStepIds,
        expandedBlockIds,
        setExpandedBlockIds,
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
    };
}
