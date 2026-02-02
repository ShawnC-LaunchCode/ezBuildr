/**
 * Step Card Component
 * Expandable card for editing step properties inline
 * Shows label, type, required (in header), and uses StepEditorRouter for the body
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    GripVertical,
    FileText,
    ChevronDown,
    ChevronRight,
    Trash2,
    Type,
    AlignLeft,
    Circle,
    CheckSquare,
    ToggleLeft,
    Calendar,
    Upload,
    Zap,
    X,
    Database,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

import { useCollaboration, useBlockCollaborators } from "@/components/collab/CollaborationContext";
import { LogicIndicator } from "@/components/logic";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ApiStep, StepType } from "@/lib/vault-api";
import {
    useUpdateStep,
    useDeleteStep,
    useWorkflow,
    useWorkflowMode
} from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { useIntake } from "../IntakeContext";
import { StepEditorRouter } from "../StepEditorRouter";

import { StepGuidance } from "./common/StepGuidance";
import { getQuestionTypeIcon } from "./common/StepIcons";
import { StepTitleRow } from "./common/StepTitleRow";

interface StepCardProps {
    step: ApiStep;
    sectionId: string;
    workflowId: string;
    isExpanded?: boolean;
    autoFocus?: boolean;
    onToggleExpand?: () => void;
    onEnterNext?: () => void;
}

interface StepDefaultValue {
    source?: string;
    variable?: string;
    value?: unknown;
}

// Get icon for each question type


// eslint-disable-next-line max-lines-per-function
export function StepCard({
    step,
    sectionId,
    workflowId,
    isExpanded = false,
    autoFocus = false,
    onToggleExpand,
    onEnterNext,
}: StepCardProps) {
    const updateStepMutation = useUpdateStep();
    const deleteStepMutation = useDeleteStep();
    const { toast } = useToast();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode || 'easy';
    const { data: workflow } = useWorkflow(workflowId);
    const { upstreamWorkflow, upstreamVariables } = useIntake();

    // Intake Derived Values
    const defVal = step.defaultValue as StepDefaultValue | undefined;
    const isLinkedToIntake = defVal?.source === 'intake';
    const linkedVariable = isLinkedToIntake ? upstreamVariables.find(v => v.alias === defVal?.variable) : null;

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



    // Make sortable
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: step.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Immediate update handlers with optimistic rendering
    const handleTitleChange = (value: string) => {
        updateStepMutation.mutate({ id: step.id, sectionId, title: value });
    };

    const handleDelete = async () => {
        // eslint-disable-next-line no-alert
        if (!confirm(`Delete question "${step.title}"?`)) { return; }

        try {
            await deleteStepMutation.mutateAsync({ id: step.id, sectionId });
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

    return (
        <div ref={setNodeRef} style={style} data-step-id={step.id} onFocus={() => { void handleFocus(); }} onBlur={(e) => { void handleBlur(e); }}>
            <Card className={cn("shadow-sm transition-all duration-300", isDragging && "opacity-50", isLockedByOther && "ring-2 ring-indigo-400/50 border-indigo-200")}>
                <CardContent className="p-3 relative">
                    {/* Lock Overlay */}
                    {isLockedByOther && (
                        <>
                            <div className="absolute top-2 right-12 z-20 flex items-center gap-2 bg-background/95 backdrop-blur px-2 py-1 rounded-full shadow-sm border border-indigo-100 animate-in fade-in zoom-in-95 duration-200">
                                <span className="text-[10px] font-medium text-indigo-700">Edited by {lockedBy?.displayName}</span>
                                <Avatar className="w-5 h-5 ring-1 ring-white">
                                    <AvatarFallback style={{ backgroundColor: lockedBy?.color }} className="text-[9px] text-white">
                                        {lockedBy?.displayName.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                            {/* Interaction Blocker */}
                            <div className="absolute inset-0 z-10 bg-white/20" />
                        </>
                    )}

                    <div className="flex items-start gap-2">
                        {/* Drag Handle */}
                        <button
                            className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded mt-1"
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
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => { onToggleExpand?.(); }}
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                            </Button>
                        </div>

                        {/* Visual Pills (collapsed view) */}
                        {!isExpanded && step.visibleIf !== null && step.visibleIf !== undefined && (
                            <div className="mt-2">
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                                    Conditional
                                </Badge>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                            {/* Header Row - Badges (required/conditional) above question */}
                            {(step.required || (step.visibleIf !== null && step.visibleIf !== undefined)) && (
                                <div className="flex items-center gap-1.5">
                                    {step.required && (
                                        <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-medium">
                                            Required
                                        </Badge>
                                    )}
                                    {step.visibleIf !== null && step.visibleIf !== undefined && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                                            Conditional
                                        </Badge>
                                    )}
                                </div>
                            )}

                            {/* Title and Delete Row */}
                            <StepTitleRow
                                step={step}
                                mode={mode}
                                isGuidanceDismissed={isGuidanceDismissed}
                                onDismissGuidance={() => setIsGuidanceDismissed(true)}
                                onTitleChange={(val) => { void handleTitleChange(val); }}
                                onDelete={() => { void handleDelete(); }}
                                onEnterNext={onEnterNext}
                                autoFocus={autoFocus}
                                isExpanded={isExpanded}
                            />

                            {/* Intake Badge (Collapsed View) */}
                            {!isExpanded && isLinkedToIntake && (
                                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit border border-emerald-100">
                                    <Database className="w-3 h-3" />
                                    <span>Linked to <strong>{upstreamWorkflow?.title}</strong> ({linkedVariable?.label ?? linkedVariable?.alias})</span>
                                </div>
                            )}

                            {/* Expanded Content - Rendered by Router */}
                            {isExpanded && (
                                <StepEditorRouter step={step} sectionId={sectionId} workflowId={workflowId} />
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
