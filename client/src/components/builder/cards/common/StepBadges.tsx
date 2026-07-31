import { Badge } from "@/components/ui/badge";
import type { ApiStep } from "@/lib/vault-api";

interface StepBadgesProps {
    step: ApiStep;
    isExpanded: boolean;
}
export function StepBadges({
    step,
    isExpanded
}: StepBadgesProps) {
    return (
        <>
            {/* Expanded Header Badges (Required / Conditional) */}
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

            {/* Collapsed Conditional Badge - if not shown in header or just separate? 
                In original code, there was a separate "Conditional" badge for collapsed view 
                separate from the header row. Let's replicate that logic.
            */}
            {!isExpanded && step.visibleIf !== null && step.visibleIf !== undefined && (
                <div className="mt-1">
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                        Conditional
                    </Badge>
                </div>
            )}
        </>
    );
}
