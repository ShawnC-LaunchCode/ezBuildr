import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { queryKeys } from "@/hooks/api/queryKeys";
import { ApiSection, ApiStep } from "@/lib/vault-api";
import {
    useReorderSections,
    useReorderSteps,
    useUpdateStep,
} from "@/lib/vault-hooks";

interface DragData {
    type: "section" | "step";
    id: string;
    sectionId?: string; // For steps, which section they belong to
}

interface UsePageDragAndDropReturn {
    activeId: string | null;
    activeDragData: DragData | null;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function usePageDragAndDrop(
    workflowId: string,
    pages: ApiSection[],
    allSteps: Record<string, ApiStep[]>
): UsePageDragAndDropReturn {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<DragData | null>(null);

    const queryClient = useQueryClient();
    const reorderSectionsMutation = useReorderSections();
    const reorderStepsMutation = useReorderSteps();
    const updateStepMutation = useUpdateStep();

    const handleDragStart = (event: DragStartEvent): void => {
        const { active } = event;
        setActiveId(active.id as string);

        // Determine what type of item is being dragged
        const isSection = pages.some((p) => p.id === active.id);
        if (isSection) {
            setActiveDragData({ type: "section", id: active.id as string });
        } else {
            // Find which section this step belongs to
            const sectionId = Object.keys(allSteps).find((sId) =>
                allSteps[sId].some((step) => step.id === active.id)
            );
            if (sectionId) {
                setActiveDragData({ type: "step", id: active.id as string, sectionId });
            }
        }
    };

    const handleSectionReorder = (activeIdString: string, overIdString: string): void => {
        const oldIndex = pages.findIndex((p) => p.id === activeIdString);
        const newIndex = pages.findIndex((p) => p.id === overIdString);

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
    };

    const handleStepReorder = async (
        activeIdString: string,
        overIdString: string,
        dragData: DragData
    ): Promise<void> => {
        const sourceSectionId = dragData.sectionId;
        if (!sourceSectionId) { return; }

        // Determine target section
        let targetSectionId: string | null = null;
        let targetStepId: string | null = null;

        if (pages.some((p) => p.id === overIdString)) {
            targetSectionId = overIdString;
        } else {
            targetStepId = overIdString;
            targetSectionId =
                Object.keys(allSteps).find((sId) =>
                    allSteps[sId].some((step) => step.id === targetStepId)
                ) ?? null;
        }

        if (!targetSectionId) {
            return;
        }

        const sourceSteps = [...(allSteps[sourceSectionId] ?? [])];
        const oldIndex = sourceSteps.findIndex((s) => s.id === activeIdString);

        if (oldIndex === -1) {
            return;
        }

        const targetSteps = [...(allSteps[targetSectionId] ?? [])];
        const newIndex = targetStepId
            ? targetSteps.findIndex((s) => s.id === targetStepId)
            : targetSteps.length;

        if (sourceSectionId === targetSectionId) {
            // Same section
            if (newIndex === -1) {
                return;
            }
            const reordered = arrayMove(targetSteps, oldIndex, newIndex);
            const updates = reordered.map((step, index) => ({
                id: step.id,
                order: index,
            }));
            reorderStepsMutation.mutate({ sectionId: targetSectionId, steps: updates });
        } else {
            // Different section: this is three writes (move the step, then
            // renumber the source and target sections). If any leg fails the
            // individual mutation hooks already roll back their own optimistic
            // cache and surface a toast — but we must (a) not let the awaited
            // rejection escape as an unhandled promise rejection, and (b) force
            // both affected sections back in sync so a partially-applied move
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
                // The section change must land first — the renumbering below
                // assumes the step now lives in the target section.
                await updateStepMutation.mutateAsync({
                    id: draggedStep.id,
                    sectionId: targetSectionId,
                    order: newIndex,
                });

                await Promise.all([
                    sourceUpdates.length > 0
                        ? reorderStepsMutation.mutateAsync({
                            sectionId: sourceSectionId,
                            steps: sourceUpdates,
                        })
                        : Promise.resolve(),
                    reorderStepsMutation.mutateAsync({
                        sectionId: targetSectionId,
                        steps: targetUpdatesWithNew,
                    }),
                ]);
            } catch {
                // Toast already shown by the global mutation error handler.
                // Re-fetch both sections so the canvas reflects server truth
                // rather than a half-completed move.
                await Promise.allSettled([
                    queryClient.invalidateQueries({ queryKey: queryKeys.steps(sourceSectionId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.steps(targetSectionId) }),
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

        if (activeDragData?.type === "section") {
            handleSectionReorder(activeIdString, overIdString);
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
