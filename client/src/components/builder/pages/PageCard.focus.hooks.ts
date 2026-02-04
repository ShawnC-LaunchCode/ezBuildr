import { useEffect, useRef, useState } from "react";

import { PageItem } from "@/lib/dnd";
import { ApiStep } from "@/lib/vault-api";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface UseAutoFocusReturn {
    expandedStepIds: Set<string>;
    setExpandedStepIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    expandedBlockIds: Set<string>;
    setExpandedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    autoFocusStepId: string | null;
    setAutoFocusStepId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useAutoFocus(
    steps: ApiStep[],
    items: PageItem[]
): UseAutoFocusReturn {
    const { selection } = useWorkflowBuilder();
    const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(
        new Set()
    );
    const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(
        new Set()
    );
    const [autoFocusStepId, setAutoFocusStepId] = useState<string | null>(null);

    const prevSelectionRef = useRef<typeof selection>(null);
    const prevItemsLengthRef = useRef<number>(0);
    const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

    useEffect(() => {
        if (selection?.type === "step" && selection.id) {
            const isNewSelection = prevSelectionRef.current?.id !== selection.id;
            if (isNewSelection) {
                setPendingFocusId(selection.id);
            }
        }
        prevSelectionRef.current = selection;
    }, [selection]);

    useEffect(() => {
        if (pendingFocusId) {
            const stepInThisPage = steps.find((s) => s.id === pendingFocusId);

            if (stepInThisPage) {
                setExpandedStepIds((prev) => new Set(prev).add(pendingFocusId));
                setAutoFocusStepId(pendingFocusId);
                setPendingFocusId(null);
                setTimeout(() => setAutoFocusStepId(null), 100);
            }
        }
    }, [pendingFocusId, steps]);

    useEffect(() => {
        if (
            items.length > prevItemsLengthRef.current &&
            prevItemsLengthRef.current > 0
        ) {
            const newItem = items[items.length - 1];
            if (newItem !== undefined) {
                if (newItem.kind === "step") {
                    setExpandedStepIds((prev) => new Set(prev).add(newItem.id));
                    setAutoFocusStepId(newItem.id);
                    setTimeout(() => setAutoFocusStepId(null), 100);
                } else {
                    setExpandedBlockIds((prev) => new Set(prev).add(newItem.id));
                }
            }
        }
        prevItemsLengthRef.current = items.length;
    }, [items]);

    return {
        expandedStepIds,
        setExpandedStepIds,
        expandedBlockIds,
        setExpandedBlockIds,
        autoFocusStepId,
        setAutoFocusStepId,
    };
}
