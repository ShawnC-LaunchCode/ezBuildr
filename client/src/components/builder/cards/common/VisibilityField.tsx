import { EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { LogicBuilder, LogicStatusText } from "@/components/logic";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

interface VisibilityFieldProps {
    stepId: string;
    pageId: string;
    workflowId: string;
    visibleIf?: ConditionExpression | null;
}

export function VisibilityField({ stepId, pageId, workflowId, visibleIf }: VisibilityFieldProps) {
    const updateStepMutation = useUpdateStep();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);

    const handleVisibilityChange = (expression: ConditionExpression) => {
        updateStepMutation.mutate(
            {
                id: stepId,
                pageId,
                visibleIf: expression,
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Visibility updated",
                        description: "Question visibility conditions have been saved.",
                    });
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description:
                            error instanceof Error
                                ? error.message
                                : "Failed to save visibility conditions",
                        variant: "destructive",
                    });
                },
            }
        );
    };

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="border rounded-md bg-background"
        >
            <CollapsibleTrigger asChild>
                <Button
                    variant="ghost"
                    className="w-full justify-between px-3 py-2 h-auto"
                >
                    <div className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Visibility</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <LogicStatusText visibleIf={visibleIf} />
                        {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </div>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 border-t">
                <div className="pt-2">
                    <LogicBuilder
                        workflowId={workflowId}
                        elementId={stepId}
                        elementType="step"
                        value={visibleIf ?? null}
                        onChange={(expression) => { void handleVisibilityChange(expression); }}
                        isSaving={updateStepMutation.isPending}
                    />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
