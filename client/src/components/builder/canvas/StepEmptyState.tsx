
import { Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StepType } from "@/lib/vault-api";
import { useSteps, useCreateStep } from "@/lib/vault-hooks";

export function StepEmptyState({ sectionId }: { sectionId: string }) {
    const { data: steps } = useSteps(sectionId);
    const createStepMutation = useCreateStep();

    // Only show if no steps
    if (!steps || steps.length > 0) { return null; }

    const handleQuickAdd = async (type: StepType, title: string) => {
        await createStepMutation.mutateAsync({
            sectionId,
            type,
            title,
            description: null,
            required: false,
            alias: null,
            order: 0,
            config: {},
        });
    };

    return (
        <Card className="border-dashed bg-muted/30">
            <CardContent className="py-12 flex flex-col items-center text-center">
                <div className="p-3 bg-background rounded-full mb-4 shadow-sm">
                    <Workflow className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-1">Add your first question</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-sm">
                    This page is empty. Choose a question type to get started.
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="outline" onClick={() => { void handleQuickAdd("short_text", "Client Name"); }}>
                        Short Text
                    </Button>
                    <Button variant="outline" onClick={() => { void handleQuickAdd("yes_no", "Confirmation"); }}>
                        Yes / No
                    </Button>
                    <Button variant="outline" onClick={() => { void handleQuickAdd("multiple_choice", "Select Option"); }}>
                        Choice
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
