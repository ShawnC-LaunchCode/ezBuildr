
import { History } from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VersionBadgeProps {
    versionLabel: string; // "Draft", "v1.2", etc.
    isDraft: boolean;
    onClick: () => void;
}

export function VersionBadge({ versionLabel, isDraft, onClick }: VersionBadgeProps) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 px-2 h-8"
            onClick={onClick}
        >
            <Badge variant={isDraft ? "secondary" : "outline"} className="cursor-pointer">
                {versionLabel}
            </Badge>
            <History className="h-4 w-4 text-muted-foreground" />
        </Button>
    );
}
