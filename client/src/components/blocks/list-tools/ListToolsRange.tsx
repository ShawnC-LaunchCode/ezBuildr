
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";

import { RangeControlsUI } from "@/components/builder/transforms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsRangeProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
}

export function ListToolsRange({
    config,
    onChange,
    expanded,
    onToggle
}: ListToolsRangeProps) {
    const hasRange = (config.offset !== undefined && config.offset !== null) || (config.limit !== undefined && config.limit !== null);

    return (
        <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Scissors className="w-4 h-4 text-orange-600" />
                        Range
                    </CardTitle>
                    <RangeSummaryBadge offset={config.offset} limit={config.limit} hasRange={hasRange} />
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0">
                    <RangeControlsUI
                        offset={config.offset}
                        limit={config.limit}
                        onChange={(updates) => onChange(updates)}
                    />
                </CardContent>
            )}
        </Card>
    );
}

function RangeSummaryBadge({ offset, limit, hasRange }: { offset?: number | null; limit?: number | null; hasRange: boolean }) {
    if (!hasRange) {return null;}
    return (
        <Badge variant="outline" className="text-xs bg-orange-100 border-orange-300">
            {(offset !== undefined && offset !== null && offset > 0) ? `Skip ${offset}` : ''}
            {(offset !== undefined && offset !== null) && (limit !== undefined && limit !== null) ? ', ' : ''}
            {(limit !== undefined && limit !== null && limit > 0) ? `Take ${limit}` : ''}
        </Badge>
    );
}
