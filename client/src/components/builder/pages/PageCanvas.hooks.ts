import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { queryKeys } from "@/hooks/api/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { ApiReorderSkipRuleWarning, ApiPage, ApiStep } from "@/lib/vault-api";
import {
    useReorderPages,
    useReorderSteps,
    useUpdateStep,
} from "@/lib/vault-hooks";

interface DragData {
    type: "page" | "step";
    id: string;
    pageId?: string; // For steps, which page they belong to
}

interface UsePageDragAndDropReturn {
    activeId: string | null;
    activeDragData: DragData | null;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function usePageDragAndDrop(
    workflowId: string,
    pages: ApiPage[],
    allSteps: Record<string, ApiStep[]>
): UsePageDragAndDropReturn {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<DragData | null>(null);

    const queryClient = useQueryClient();
    const { toast } = useToast();
    const reorderPagesMutation = useReorderPages();
    const reorderStepsMutation = useReorderSteps();
    const updateStepMutation = useUpdateStep();

    const handleDragStart = (event: DragStartEvent): void => {
        const { active } = event;
        setActiveId(active.id as string);

        // Determine what type of item is being dragged
        const isPage = pages.some((p) => p.id === active.id);
        if (isPage) {
            setActiveDragData({ type: "page", id: active.id as string });
        } else {
            // Find which page this step belongs to
            const pageId = Object.keys(allSteps).find((sId) =>
                allSteps[sId].some((step) => step.id === active.id)
            );
            if (pageId) {
                setActiveDragData({ type: "step", id: active.id as string, pageId });
            }
        }
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

    const handlePageReorder = (activeIdString: string, overIdString: string): void => {
        const oldIndex = pages.findIndex((p) => p.id === activeIdString);
        const newIndex = pages.findIndex((p) => p.id === overIdString);

        if (oldIndex !== -1 && newIndex !== -1) {
            const reordered = arrayMove(pages, oldIndex, newIndex);
            const updates = reordered.map((page, index) => ({
                id: page.id,
                order: index,
            }));
            reorderPagesMutation.mutate(
                { workflowId, pages: updates },
                {
                    // The reorder itself always succeeds — this only warns
                    // about a side effect it just had (MAP-B4, D-5): a
                    // forward "skip to" rule that the new order turned
                    // backward, so it can no longer fire. Publish still
                    // blocks on this separately; this is a heads-up at drag
                    // time instead of a surprise at publish time.
                    onSuccess: (result) => warnAboutBrokenSkipRules(result.affectedSkipRules),
                }
            );
        }
    };

    const handleStepReorder = async (
        activeIdString: string,
        overIdString: string,
        dragData: DragData
    ): Promise<void> => {
        const sourcePageId = dragData.pageId;
        if (!sourcePageId) { return; }

        // Determine target page
        let targetPageId: string | null = null;
        let targetStepId: string | null = null;

        if (pages.some((p) => p.id === overIdString)) {
            targetPageId = overIdString;
        } else {
            targetStepId = overIdString;
            targetPageId =
                Object.keys(allSteps).find((sId) =>
                    allSteps[sId].some((step) => step.id === targetStepId)
                ) ?? null;
        }

        if (!targetPageId) {
            return;
        }

        const sourceSteps = [...(allSteps[sourcePageId] ?? [])];
        const oldIndex = sourceSteps.findIndex((s) => s.id === activeIdString);

        if (oldIndex === -1) {
            return;
        }

        const targetSteps = [...(allSteps[targetPageId] ?? [])];
        const newIndex = targetStepId
            ? targetSteps.findIndex((s) => s.id === targetStepId)
            : targetSteps.length;

        if (sourcePageId === targetPageId) {
            // Same page
            if (newIndex === -1) {
                return;
            }
            const reordered = arrayMove(targetSteps, oldIndex, newIndex);
            const updates = reordered.map((step, index) => ({
                id: step.id,
                order: index,
            }));
            reorderStepsMutation.mutate({ pageId: targetPageId, steps: updates });
        } else {
            // Different page: this is three writes (move the step, then
            // renumber the source and target pages). If any leg fails the
            // individual mutation hooks already roll back their own optimistic
            // cache and surface a toast — but we must (a) not let the awaited
            // rejection escape as an unhandled promise rejection, and (b) force
            // both affected pages back in sync so a partially-applied move
            // can never linger in the UI.
            const draggedStep = sourceSteps[oldIndex];

            const remainingSourceSteps = sourceSteps.filter(
                (s) => s.id !== draggedStep.id
            );
            const sourceUpdates = remainingSourceSteps.map((step, index) => ({
                id: step.id,
                order: index,
            }));

            const targetUpdatesWithNew = [
                ...targetSteps.slice(0, newIndex),
                draggedStep,
                ...targetSteps.slice(newIndex),
            ].map((step, index) => ({
                id: step.id,
                order: index,
            }));

            try {
                // The page change must land first — the renumbering below
                // assumes the step now lives in the target page.
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
                        steps: targetUpdatesWithNew,
                    }),
                ]);
            } catch {
                // Toast already shown by the global mutation error handler.
                // Re-fetch both pages so the canvas reflects server truth
                // rather than a half-completed move.
                await Promise.allSettled([
                    queryClient.invalidateQueries({ queryKey: queryKeys.steps(sourcePageId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.steps(targetPageId) }),
                ]);
            }
        }
    };

    const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
        const { active, over } = event;
        setActiveId(null);
        setActiveDragData(null);

        if (!over || active.id === over.id) {
            return;
        }

        const activeIdString = active.id as string;
        const overIdString = over.id as string;

        if (activeDragData?.type === "page") {
            handlePageReorder(activeIdString, overIdString);
            return;
        }

        if (activeDragData?.type === "step") {
            await handleStepReorder(activeIdString, overIdString, activeDragData);
        }
    };

    return {
        activeId,
        activeDragData,
        handleDragStart,
        handleDragEnd,
    };
}
