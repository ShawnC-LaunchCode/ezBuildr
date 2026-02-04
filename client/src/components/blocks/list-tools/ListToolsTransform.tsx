
import { ChevronDown, ChevronRight, Columns } from "lucide-react";

import { AdvancedTransformUI } from "@/components/builder/transforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsTransformProps {
    config: Partial<ListToolsConfig>;
    onChange: (updates: Partial<ListToolsConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
}

export function ListToolsTransform({
    config,
    onChange,
    expanded,
    onToggle
}: ListToolsTransformProps) {
    return (
        <Card className="border-indigo-200 bg-indigo-50/30">
            <CardHeader className="pb-3 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Columns className="w-4 h-4 text-indigo-600" />
                        Transform
                    </CardTitle>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0">
                    <AdvancedTransformUI
                        select={config.select}
                        dedupe={config.dedupe}
                        onChange={(updates) => onChange(updates)}
                    />
                </CardContent>
            )}
        </Card>
    );
}
