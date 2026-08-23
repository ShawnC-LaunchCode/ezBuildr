import { DraggableAttributes } from "@dnd-kit/core";
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { useDebouncedFieldMutation } from "@/hooks/useDebouncedFieldMutation";
import { combinePageItems, getNextOrder, PageItem } from "@/lib/dnd";
import { ApiBlock, ApiPage, ApiStep, pageAPI, type ApiDeleteImpact } from "@/lib/vault-api";
import {
    useDeletePage,
    useDuplicatePage,
    useTransformBlocks,
    useUpdatePage,
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
    isFinalDocumentsPage: boolean;
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    setNodeRef: (node: HTMLElement | null) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform: any; // Transform type is complex, any or specific
    transition: string | undefined;
    isDragging: boolean;
    localTitle: string;
    localDescription: string;
    handleTitleChange: (title: string) => void;
    flushTitle: () => void;
    handleDescriptionChange: (description: string) => void;
    flushDescription: () => void;
    handleDelete: () => Promise<void>;
    handleDuplicate: () => Promise<void>;
    isDeleteImpactOpen: boolean;
    setIsDeleteImpactOpen: React.Dispatch<React.SetStateAction<boolean>>;
    pendingDeleteImpact: ApiDeleteImpact | null;
    confirmDestructiveDelete: () => void;
    isDeletePagePending: boolean;
    selectPage: (id: string) => void;
    selectBlock: (id: string) => void;
    selectStep: (id: string) => void;
    handleToggleExpand: (stepId: string) => void;
    handleToggleBlockExpand: (blockId: string) => void;
    nextOrder: number;
}

export function usePageCardLogic(
    workflowId: string,
    page: ApiPage,
    blocks: ApiBlock[],
    steps: ApiStep[]
): UsePageCardLogicReturn {
    const { data: transformBlocks = [] } = useTransformBlocks(workflowId);
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";
    const updatePageMutation = useUpdatePage();
    const deletePageMutation = useDeletePage();
    const duplicatePageMutation = useDuplicatePage();
    const { selectPage, selectBlock, selectStep } = useWorkflowBuilder();
    const { toast } = useToast();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isLogicSheetOpen, setIsLogicSheetOpen] = useState(false);

    // Delete-impact warning (ICW2-13): only shown when the page's steps have stored answers.
    const [isDeleteImpactOpen, setIsDeleteImpactOpen] = useState(false);
    const [pendingDeleteImpact, setPendingDeleteImpact] = useState<ApiDeleteImpact | null>(null);

    // Check if this is a Final Documents page
    const isFinalDocumentsPage =
        (page.config as { finalBlock?: boolean } | undefined)?.finalBlock === true;

    // For Final Documents pages, filter out all steps
    const filteredSteps = isFinalDocumentsPage
        ? steps.filter((s) => s.type === "final_documents")
        : steps;

    // Combine steps and blocks into sortable items
    const pageBlocks = blocks.filter((b) => b.pageId === page.id);

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

    const { localValue: localTitle, onChange: handleTitleChange, onBlur: flushTitle } = useDebouncedFieldMutation(
        page.title,
        (title: string) => updatePageMutation.mutate({ id: page.id, workflowId, title })
    );

    const { localValue: localDescription, onChange: handleDescriptionChange, onBlur: flushDescription } = useDebouncedFieldMutation(
        page.description ?? "",
        (description: string) => updatePageMutation.mutate({ id: page.id, workflowId, description })
    );

    const performDelete = async (): Promise<void> => {
        try {
            await deletePageMutation.mutateAsync({ id: page.id, workflowId });
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

    const handleDelete = async (): Promise<void> => {
        try {
            const impact = await pageAPI.getDeleteImpact(page.id);
            if (impact.answerCount > 0) {
                setPendingDeleteImpact(impact);
                setIsDeleteImpactOpen(true);
                return;
            }
        } catch {
            // Impact check failed (e.g. network hiccup) — fall back to the
            // existing plain confirmation rather than silently skipping it.
        }
        if (
            // eslint-disable-next-line no-alert
            !window.confirm(
                `Delete page "${page.title}"? This will remove all questions and logic blocks.`
            )
        ) {
            return;
        }
        await performDelete();
    };

    const confirmDestructiveDelete = (): void => {
        setIsDeleteImpactOpen(false);
        void performDelete();
    };

    const handleDuplicate = async (): Promise<void> => {
        try {
            await duplicatePageMutation.mutateAsync({ id: page.id, workflowId });
            toast({
                title: "Page duplicated",
                description: `A copy of "${page.title}" was added`,
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to duplicate page",
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
        isFinalDocumentsPage,
        attributes,
        listeners,
        setNodeRef,
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
        isDeletePagePending: deletePageMutation.isPending,
        selectPage,
        selectBlock,
        selectStep,
        handleToggleExpand,
        handleToggleBlockExpand,
        nextOrder,
    };
}
