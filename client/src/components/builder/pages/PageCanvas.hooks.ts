import type {
    DragCancelEvent,
    DragEndEvent,
    DragOverEvent,
    DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { queryKeys } from "@/hooks/api/queryKeys";
import { useToast } from "@/hooks/use-toast";
import {
    findEmptiedSection,
    isCanvasDragData,
    movePageInCanvasLayout,
    moveSectionInCanvasLayout,
    sectionNamesForMove,
    type CanvasDragData,
    type CanvasLayoutMove,
    type PageDropDestination,
} from "@/lib/dnd";
import {
    FetchApiError,
    type ApiPage,
    type ApiReorderSkipRuleWarning,
    type ApiSection,
    type ApiStep,
} from "@/lib/vault-api";
import {
    useReorderPages,
    useReorderSteps,
    useUpdateStep,
} from "@/lib/vault-hooks";

interface PendingLayoutMove extends CanvasLayoutMove {
    sectionNames: string[];
    emptiedSection: ApiSection | null;
    subject: "page" | "Section";
}

interface UsePageDragAndDropReturn {
    activeId: string | null;
    activeDragData: CanvasDragData | null;
    overId: string | null;
    landingLabel: string | null;
    landingSectionId: string | null;
    pendingEmptySection: ApiSection | null;
    isSubmitting: boolean;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragOver: (event: DragOverEvent) => void;
    handleDragCancel: (event: DragCancelEvent) => void;
    handleDragEnd: (event: DragEndEvent) => Promise<void>;
    cancelPendingMove: () => void;
    confirmPendingMove: () => void;
}

function fallbackDragData(
    id: string,
    pages: ApiPage[],
    allSteps: Record<string, ApiStep[]>,
): CanvasDragData | null {
    const page = pages.find((candidate) => candidate.id === id);
    if (page) {
        return { kind: "page", pageId: page.id, sectionId: page.sectionId ?? null };
    }
    const pageId = Object.keys(allSteps).find((candidatePageId) =>
        allSteps[candidatePageId].some((step) => step.id === id)
    );
    return pageId ? { kind: "step", stepId: id, pageId } : null;
}

function eventDragData(
    data: unknown,
    id: string,
    pages: ApiPage[],
    allSteps: Record<string, ApiStep[]>,
): CanvasDragData | null {
    return isCanvasDragData(data) ? data : fallbackDragData(id, pages, allSteps);
}

function useStepDragAndDrop(
    pages: ApiPage[],
    allSteps: Record<string, ApiStep[]>,
): (
    activeId: string,
    overId: string,
    dragData: Extract<CanvasDragData, { kind: "step" }>,
    overData: CanvasDragData | null,
) => Promise<void> {
    const queryClient = useQueryClient();
    const reorderStepsMutation = useReorderSteps();
    const updateStepMutation = useUpdateStep();

    return async (activeId, overId, dragData, overData): Promise<void> => {
        const sourcePageId = dragData.pageId;
        let targetPageId: string | null = null;
        let targetStepId: string | null = null;
        if (overData?.kind === "page") {
            targetPageId = overData.pageId;
        } else if (overData?.kind === "step") {
            targetStepId = overData.stepId;
            targetPageId = overData.pageId;
        } else {
            const targetPage = pages.find((page) => page.id === overId);
            targetPageId = targetPage?.id ?? null;
            targetStepId = targetPage ? null : overId;
            targetPageId ??= Object.keys(allSteps).find((candidatePageId) =>
                allSteps[candidatePageId].some((step) => step.id === targetStepId)
            ) ?? null;
        }
        if (!targetPageId) { return; }

        const sourceSteps = [...(allSteps[sourcePageId] ?? [])];
        const oldIndex = sourceSteps.findIndex((step) => step.id === activeId);
        if (oldIndex === -1) { return; }
        const targetSteps = [...(allSteps[targetPageId] ?? [])];
        const newIndex = targetStepId
            ? targetSteps.findIndex((step) => step.id === targetStepId)
            : targetSteps.length;

        if (sourcePageId === targetPageId) {
            if (newIndex === -1) { return; }
            const reordered = arrayMove(targetSteps, oldIndex, newIndex);
            reorderStepsMutation.mutate({
                pageId: targetPageId,
                steps: reordered.map((step, order) => ({ id: step.id, order })),
            });
            return;
        }

        const draggedStep = sourceSteps[oldIndex];
        const sourceUpdates = sourceSteps
            .filter((step) => step.id !== draggedStep.id)
            .map((step, order) => ({ id: step.id, order }));
        const targetUpdates = [
            ...targetSteps.slice(0, newIndex),
            draggedStep,
            ...targetSteps.slice(newIndex),
        ].map((step, order) => ({ id: step.id, order }));

        try {
            await updateStepMutation.mutateAsync({
                id: draggedStep.id,
                pageId: targetPageId,
                order: newIndex,
            });
            await Promise.all([
                sourceUpdates.length > 0
                    ? reorderStepsMutation.mutateAsync({
                        pageId: sourcePageId,
                        steps: sourceUpdates,
                    })
                    : Promise.resolve(),
                reorderStepsMutation.mutateAsync({
                    pageId: targetPageId,
                    steps: targetUpdates,
                }),
            ]);
        } catch {
            await Promise.allSettled([
                queryClient.invalidateQueries({ queryKey: queryKeys.steps(sourcePageId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.steps(targetPageId) }),
            ]);
        }
    };
}

export function usePageDragAndDrop(
    workflowId: string,
    pages: ApiPage[],
    sections: ApiSection[],
    allSteps: Record<string, ApiStep[]>
): UsePageDragAndDropReturn {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<CanvasDragData | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [landingLabel, setLandingLabel] = useState<string | null>(null);
    const [landingSectionId, setLandingSectionId] = useState<string | null>(null);
    const [pendingMove, setPendingMove] = useState<PendingLayoutMove | null>(null);

    const { toast } = useToast();
    const reorderPagesMutation = useReorderPages();
    const handleStepReorder = useStepDragAndDrop(pages, allSteps);

    const clearDragState = (): void => {
        setActiveId(null);
        setActiveDragData(null);
        setOverId(null);
        setLandingLabel(null);
        setLandingSectionId(null);
    };

    const warnAboutBrokenSkipRules = (rules: ApiReorderSkipRuleWarning[]): void => {
        if (rules.length === 0) { return; }
        const describe = (rule: ApiReorderSkipRuleWarning): string =>
            `"${rule.conditionPageTitle}" → "${rule.targetPageTitle}"`;
        toast({
            title: rules.length === 1
                ? "A skip rule can no longer fire"
                : `${rules.length} skip rules can no longer fire`,
            description: `This reorder moved a "skip to" target at or before the page that triggers it, so it will never fire: ${rules.map(describe).join(", ")}. Fix it in Logic before publishing.`,
            variant: "destructive",
        });
    };

    const nameForMove = (move: PendingLayoutMove): string =>
        move.sectionNames[0] ?? move.emptiedSection?.title ?? "Section layout";

    const submitLayout = async (
        move: PendingLayoutMove,
        deleteEmptySectionIds: string[] = [],
    ): Promise<void> => {
        try {
            const result = await reorderPagesMutation.mutateAsync({
                workflowId,
                pages: move.updates,
                deleteEmptySectionIds,
            });
            setPendingMove(null);
            warnAboutBrokenSkipRules(result.affectedSkipRules);
        } catch (error) {
            if (error instanceof FetchApiError
                && error.status === 409
                && move.emptiedSection
                && deleteEmptySectionIds.length === 0) {
                setPendingMove(move);
                return;
            }

            const sectionName = nameForMove(move);
            if (error instanceof FetchApiError && error.status === 400) {
                toast({
                    title: "Section layout rejected",
                    description: `${error.message} The canvas was restored to the server’s accepted layout.`,
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: `Couldn’t move ${move.subject} in “${sectionName}”`,
                description: `“${sectionName}” and its page order were restored. Try again after the canvas refreshes.`,
                variant: "destructive",
            });
        }
    };

    const handleDragStart = (event: DragStartEvent): void => {
        const id = String(event.active.id);
        setActiveId(id);
        setActiveDragData(eventDragData(event.active.data?.current, id, pages, allSteps));
    };

    const describeLanding = (overData: CanvasDragData): {
        label: string | null;
        sectionId: string | null;
    } => {
        if (overData.kind === "landing") {
            return { label: overData.label, sectionId: overData.sectionId };
        }
        if (overData.kind !== "page") {
            return { label: null, sectionId: null };
        }
        const targetPage = pages.find((page) => page.id === overData.pageId);
        const section = sections.find((candidate) => candidate.id === overData.sectionId);
        return section
            ? {
                label: `Land in Section “${section.title}” near “${targetPage?.title ?? "page"}”`,
                sectionId: section.id,
            }
            : {
                label: `Land as an ungrouped page near “${targetPage?.title ?? "page"}”`,
                sectionId: null,
            };
    };

    const handleDragOver = (event: DragOverEvent): void => {
        const activeData = eventDragData(
            event.active.data?.current,
            String(event.active.id),
            pages,
            allSteps,
        );
        const currentOver = event.over;
        if (!currentOver || activeData?.kind !== "page") {
            setOverId(null);
            setLandingLabel(null);
            setLandingSectionId(null);
            return;
        }
        const overData = eventDragData(
            currentOver.data?.current,
            String(currentOver.id),
            pages,
            allSteps,
        );
        if (!overData) { return; }
        const landing = describeLanding(overData);
        setOverId(String(currentOver.id));
        setLandingLabel(landing.label);
        setLandingSectionId(landing.sectionId);
    };

    const createPendingMove = (
        move: CanvasLayoutMove,
        subject: PendingLayoutMove["subject"],
        explicitSectionNames?: string[],
    ): PendingLayoutMove => ({
        ...move,
        subject,
        sectionNames: explicitSectionNames
            ?? sectionNamesForMove(pages, move.pages, sections),
        emptiedSection: findEmptiedSection(pages, move.pages, sections),
    });

    const handlePageMove = async (
        activePageId: string,
        overData: CanvasDragData,
    ): Promise<void> => {
        let destination: PageDropDestination | null = null;
        if (overData.kind === "page") {
            destination = { kind: "page", pageId: overData.pageId };
        } else if (overData.kind === "landing") {
            destination = {
                kind: "landing",
                insertIndex: overData.insertIndex,
                sectionId: overData.sectionId,
            };
        }
        if (!destination) { return; }
        const move = movePageInCanvasLayout(pages, sections, activePageId, destination);
        if (move) {
            await submitLayout(createPendingMove(move, "page"));
        }
    };

    const handleSectionMove = async (
        activeSectionId: string,
        overData: CanvasDragData,
    ): Promise<void> => {
        if (overData.kind !== "section" && overData.kind !== "page") { return; }
        const move = moveSectionInCanvasLayout(pages, sections, activeSectionId, overData);
        if (!move) { return; }
        const activeSection = sections.find((section) => section.id === activeSectionId);
        await submitLayout(createPendingMove(
            move,
            "Section",
            activeSection ? [activeSection.title] : undefined,
        ));
    };

    const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
        const currentActiveData = eventDragData(
            event.active.data?.current,
            String(event.active.id),
            pages,
            allSteps,
        ) ?? activeDragData;
        const currentOver = event.over;
        clearDragState();
        if (!currentOver || !currentActiveData) { return; }
        const overData = eventDragData(
            currentOver.data?.current,
            String(currentOver.id),
            pages,
            allSteps,
        );
        if (!overData || event.active.id === currentOver.id) { return; }

        if (currentActiveData.kind === "page") {
            await handlePageMove(currentActiveData.pageId, overData);
            return;
        }
        if (currentActiveData.kind === "section") {
            await handleSectionMove(currentActiveData.sectionId, overData);
            return;
        }
        if (currentActiveData.kind === "step") {
            await handleStepReorder(
                currentActiveData.stepId,
                String(currentOver.id),
                currentActiveData,
                overData,
            );
        }
    };

    return {
        activeId,
        activeDragData,
        overId,
        landingLabel,
        landingSectionId,
        pendingEmptySection: pendingMove?.emptiedSection ?? null,
        isSubmitting: reorderPagesMutation.isPending,
        handleDragStart,
        handleDragOver,
        handleDragCancel: () => clearDragState(),
        handleDragEnd,
        cancelPendingMove: () => setPendingMove(null),
        confirmPendingMove: () => {
            if (pendingMove?.emptiedSection) {
                void submitLayout(pendingMove, [pendingMove.emptiedSection.id]);
            }
        },
    };
}
