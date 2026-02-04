
import { ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";

import { SortBuilderUI } from "@/components/builder/transforms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsSortProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
}

export function ListToolsSort({
    config,
    onChange,
    expanded,
    onToggle
}: ListToolsSortProps) {
    const sortCount = config.sort?.length ?? 0;

    return (
        <Card className="border-purple-200 bg-purple-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <ArrowUpDown className="w-4 h-4 text-purple-600" />
                        Sort {sortCount > 0 && <Badge variant="secondary" className="ml-1 text-xs">{sortCount} keys</Badge>}
                    </CardTitle>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0">
                    <SortBuilderUI
                        sort={config.sort}
                        onChange={(sort) => onChange({ sort })}
                    />
                </CardContent>
            )}
        </Card>
    );
}
