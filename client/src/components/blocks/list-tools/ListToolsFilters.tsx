
import { ChevronDown, ChevronRight, Filter } from "lucide-react";

import { FilterBuilderUI } from "@/components/builder/transforms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsFiltersProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
    availableVariables: string[];
}

export function ListToolsFilters({
    config,
    onChange,
    expanded,
    onToggle,
    availableVariables
}: ListToolsFiltersProps) {
    const filterCount = config.filters?.rules?.length ?? 0;

    return (
        <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Filter className="w-4 h-4 text-blue-600" />
                        Filters {filterCount > 0 && <Badge variant="secondary" className="ml-1 text-xs">{filterCount}</Badge>}
                    </CardTitle>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0">
                    <FilterBuilderUI
                        filters={config.filters}
                        onChange={(filters) => onChange({ filters })}
                        availableVariables={availableVariables}
                    />
                </CardContent>
            )}
        </Card>
    );
}
