import { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";

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
            // Different section
            const draggedStep = sourceSteps[oldIndex];

            // Update the step's section
            await updateStepMutation.mutateAsync({
                id: draggedStep.id,
                sectionId: targetSectionId,
                order: newIndex,
            });

            // Update source section order
            const remainingSourceSteps = sourceSteps.filter(
                (s) => s.id !== draggedStep.id
            );
            const sourceUpdates = remainingSourceSteps.map((step, index) => ({
                id: step.id,
                order: index,
            }));
            if (sourceUpdates.length > 0) {
                reorderStepsMutation.mutate({
                    sectionId: sourceSectionId,
                    steps: sourceUpdates,
                });
            }

            // Update target section order including new step
            const targetUpdatesWithNew = [
                ...targetSteps.slice(0, newIndex),
                draggedStep,
                ...targetSteps.slice(newIndex),
            ].map((step, index) => ({
                id: step.id,
                order: index,
            }));

            reorderStepsMutation.mutate({
                sectionId: targetSectionId,
                steps: targetUpdatesWithNew,
            });
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
