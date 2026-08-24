/**
 * Step Card Component
 * Expandable card for editing step properties inline
 * Shows label, type, required (in header), and uses StepEditorRouter for the body
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    GripVertical,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { useState } from "react";

import { useCollaboration, useBlockCollaborators } from "@/components/collab/CollaborationContext";
import { LogicIndicator } from "@/components/logic";
import { DeleteImpactDialog } from "@/components/shared/DeleteImpactDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { stepAPI, type ApiStep, type ApiDeleteImpact } from "@/lib/vault-api";
import {
    useUpdateStep,
    useDeleteStep,
    useDuplicateStep,
    useWorkflowMode
} from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { StepEditorRouter } from "../StepEditorRouter";

import { StepBadges } from "./common/StepBadges";
import { StepLockOverlay } from "./common/StepLockOverlay";
import { getQuestionTypeIcon } from "./common/StepIcons";
import { StepTitleRow } from "./common/StepTitleRow";

interface StepCardProps {
    step: ApiStep;
    pageId: string;
    workflowId: string;
    isExpanded?: boolean;
    autoFocus?: boolean;
    onToggleExpand?: () => void;
    onEnterNext?: () => void;
}

// Get icon for each question type



export function StepCard({
    step,
    pageId,
    workflowId,
    isExpanded = false,
    autoFocus = false,
    onToggleExpand,
    onEnterNext,
}: StepCardProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const deleteStepMutation = useDeleteStep();
    const duplicateStepMutation = useDuplicateStep();
    const { toast } = useToast();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? 'easy';

    // Collaboration Hooks
    const { updateActiveBlock, user: currentUser } = useCollaboration();
    const { lockedBy, isLocked } = useBlockCollaborators(step.id);
    const isLockedByOther = isLocked && lockedBy?.userId !== currentUser?.id;

    const handleFocus = () => {
        if (!isLockedByOther) {
            updateActiveBlock(step.id);
        }
    };

    const handleBlur = (e: React.FocusEvent) => {
        // Check if new focus is still within this card
        if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest(`[data-step-id="${step.id}"]`)) {
            return;
        }
        // Only clear if we were the one locking it
        if (!isLockedByOther) {
            updateActiveBlock(null);
        }
    };


    const [isGuidanceDismissed, setIsGuidanceDismissed] = useState(false);

    // Delete-impact warning (ICW2-13): only shown when the step has stored answers.
    const [isDeleteImpactOpen, setIsDeleteImpactOpen] = useState(false);
    const [pendingDeleteImpact, setPendingDeleteImpact] = useState<ApiDeleteImpact | null>(null);



    // Make sortable
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: step.id,
        data: { kind: "step", stepId: step.id, pageId },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Immediate update handlers with optimistic rendering
    const handleTitleChange = (value: string) => {
        updateStepMutation.mutate({ id: step.id, pageId, title: value });
    };

    const performDelete = async () => {
        try {
            await deleteStepMutation.mutateAsync({ id: step.id, pageId });
            toast({
                title: "Question deleted",
                description: "Question removed from page",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete question",
                variant: "destructive",
            });
        }
    };

    const handleDelete = async () => {
        try {
            const impact = await stepAPI.getDeleteImpact(step.id);
            if (impact.answerCount > 0) {
                setPendingDeleteImpact(impact);
                setIsDeleteImpactOpen(true);
                return;
            }
        } catch {
            // Impact check failed (e.g. network hiccup) — fall back to the
            // existing plain confirmation rather than silently skipping it.
        }
        // eslint-disable-next-line no-alert
        if (!confirm(`Delete question "${step.title}"?`)) { return; }
        await performDelete();
    };

    const handleConfirmDestructiveDelete = () => {
        setIsDeleteImpactOpen(false);
        void performDelete();
    };

    const handleDuplicate = async () => {
        try {
            await duplicateStepMutation.mutateAsync({ id: step.id, pageId });
            toast({
                title: "Question duplicated",
                description: "A copy was added to this page",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to duplicate question",
                variant: "destructive",
            });
        }
    };

    return (
        <div ref={setNodeRef} style={style} data-step-id={step.id} onFocus={() => { void handleFocus(); }} onBlur={(e) => { void handleBlur(e); }}>
            <Card className={cn("shadow-sm transition-all duration-300", isDragging && "opacity-50", isLockedByOther && "ring-2 ring-indigo-400/50 border-indigo-200")}>
                <CardContent className="p-3 relative">
                    {/* Lock Overlay */}
                    <StepLockOverlay isLockedByOther={!!isLockedByOther} lockedBy={lockedBy ?? null} />

                    <div className="flex items-start gap-2">
                        {/* Drag Handle */}
                        <button
                            className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded mt-1"
                            aria-label={`Reorder question ${step.title}`}
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </button>

                        {/* Icon and Collapse Button (stacked vertically) */}
                        <div className="flex flex-col items-center gap-1">
                            <div className="mt-2 relative">
                                {getQuestionTypeIcon(step.type)}
                                {/* Show logic indicator when collapsed */}
                                {!isExpanded && !!step.visibleIf && (
                                    <div className="absolute -top-1 -right-1">
                                        <LogicIndicator
                                            visibleIf={step.visibleIf as ConditionExpression}
                                            variant="icon"
                                            size="sm"
                                            elementType="question"
                                        />
                                    </div>
                                )}
                            </div>
                            {/*
                              * O-5: this toggle is icon-only, so without an
                              * explicit name it is announced as an unlabelled
                              * button and is unreachable by any name-based
                              * query. `aria-expanded` also lets assistive tech
                              * (and tests) read the open state, which the
                              * chevron alone only conveys visually.
                              */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => { onToggleExpand?.(); }}
                                aria-expanded={isExpanded}
                                aria-label={
                                    isExpanded
                                        ? `Collapse settings for ${step.title}`
                                        : `Expand settings for ${step.title}`
                                }
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                            {/* Badges (Required, Conditional) */}
                            <StepBadges
                                step={step}
                                isExpanded={isExpanded}
                            />

                            {/* Title and Delete Row */}
                            <StepTitleRow
                                step={step}
                                mode={mode}
                                isGuidanceDismissed={isGuidanceDismissed}
                                onDismissGuidance={() => setIsGuidanceDismissed(true)}
                                onTitleChange={(val) => { void handleTitleChange(val); }}
                                onDuplicate={() => { void handleDuplicate(); }}
                                onDelete={() => { void handleDelete(); }}
                                onEnterNext={onEnterNext}
                                autoFocus={autoFocus}
                                isExpanded={isExpanded}
                            />

                            {/* Expanded Content - Rendered by Router */}
                            {isExpanded && (
                                <StepEditorRouter step={step} pageId={pageId} workflowId={workflowId} />
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
            <DeleteImpactDialog
                open={isDeleteImpactOpen}
                onOpenChange={setIsDeleteImpactOpen}
                impact={pendingDeleteImpact}
                itemLabel="question"
                onConfirm={handleConfirmDestructiveDelete}
                isPending={deleteStepMutation.isPending}
            />
        </div >
    );
}
