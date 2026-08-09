import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VersionBadgeProps {
    versionLabel: string; // "v1", "v1+", "v1.2", ...
    isDraft: boolean;
    onClick: () => void;
}

/**
 * Compact version entry point for the builder toolbar. Previously a ghost
 * button wrapping a Badge that read "Draft (v1)" — which put a second,
 * differently-meaning "Draft" ~250px from the status toggle's "Draft". The
 * word now lives only on the status pill; the tooltip disambiguates the two.
 */
export function VersionBadge({ versionLabel, isDraft, onClick }: VersionBadgeProps): JSX.Element {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "h-8 shrink-0 gap-1.5 px-2 font-mono text-xs font-medium",
                        isDraft ? "text-muted-foreground" : "text-foreground",
                    )}
                    onClick={onClick}
                >
                    <History className="size-3.5" aria-hidden="true" />
                    {versionLabel}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                {isDraft
                    ? "Editing an unpublished draft. Open version history."
                    : `Viewing ${versionLabel}. Open version history.`}
            </TooltipContent>
        </Tooltip>
    );
}
