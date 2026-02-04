
import { GripVertical, FileText, Trash2 } from "lucide-react";
import { type MouseEvent } from "react";

import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiStep } from "@/lib/vault-api";
import { useDeleteStep } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

interface StepItemProps {
    step: ApiStep;
    sectionId: string;
}

export function StepItem({ step, sectionId }: StepItemProps) {
    const { selection, selectStep } = useWorkflowBuilder();
    const deleteStepMutation = useDeleteStep();
    const isSelected = selection?.type === "step" && selection.id === step.id;

    const handleDelete = () => {
        deleteStepMutation.mutate({ id: step.id, sectionId });
    };

    return (
        <div
            className={cn(
                "flex items-start gap-2 py-1.5 px-1.5 rounded-md hover:bg-sidebar-accent/50 cursor-pointer text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 group",
                isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
            onClick={(e: MouseEvent) => {
                e.preventDefault(); // Prevent bubbling if needed, though original used void selectStep
                selectStep(step.id);
            }}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectStep(step.id);
                }
            }}
        >
            <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            {/* Required pill before question */}
            {step.required && (
                <Badge variant="destructive" className="text-[8px] h-3.5 px-1 font-medium shrink-0 mt-0.5">
                    Req
                </Badge>
            )}
            <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
            {/* Question title and alias stacked */}
            <div className="flex-1 min-w-0">
                <div className="truncate text-xs leading-tight">{step.title || "(Untitled)"}</div>
                {step.alias && (
                    <div className="text-[10px] text-muted-foreground/70 font-mono ml-2 truncate leading-tight mt-0.5">
                        {step.alias}
                    </div>
                )}
            </div>
            {step.visibleIf !== null && step.visibleIf !== undefined && (
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium shrink-0 mt-0.5">
                    Cond
                </Badge>
            )}
            {/* Delete Action (Hover) */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={(e) => e.stopPropagation()}>
                <ConfirmationDialog
                    title="Delete Question?"
                    description="Are you sure you want to delete this question? This action cannot be undone."
                    variant="destructive"
                    onConfirm={handleDelete}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete Question"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    }
                />
            </div>
        </div>
    );
}
