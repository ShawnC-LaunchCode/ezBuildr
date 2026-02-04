
import { Badge } from "@/components/ui/badge";

import type { ListToolsConfig } from "@shared/types/blocks";

interface ListToolsSummaryProps {
    config: Partial<ListToolsConfig>;
}

export function ListToolsSummary({ config }: ListToolsSummaryProps) {
    const filterCount = config.filters?.rules?.length ?? 0;
    const sortCount = config.sort?.length ?? 0;

    const hasFilters = filterCount > 0;
    const hasSorts = sortCount > 0;
    const hasRange = (config.offset !== undefined && config.offset !== null) || (config.limit !== undefined && config.limit !== null);
    const hasDedupe = !!config.dedupe;
    const hasSelect = (config.select?.length ?? 0) > 0;
    const hasTransforms = hasFilters || hasSorts || hasRange || hasDedupe || hasSelect;

    if (!config.sourceListVar || !config.outputListVar || !hasTransforms) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-md">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                        <p className="text-xs font-medium text-gray-900 mb-1">Transform Pipeline</p>
                        <div className="flex flex-wrap gap-1">
                            <FiltersBadge count={filterCount} hasFilters={hasFilters} />
                            <SortBadge count={sortCount} hasSorts={hasSorts} />
                            <RangeBadge offset={config.offset} limit={config.limit} hasRange={hasRange} />
                            <SelectBadge count={config.select?.length ?? 0} hasSelect={hasSelect} />
                            <DedupeBadge dedupe={config.dedupe} hasDedupe={hasDedupe} />
                        </div>
                    </div>
                    <Badge className="bg-green-600 text-white text-[10px] px-2">Active</Badge>
                </div>
            </div>

            <ExecutionOrder />
        </div>
    );
}

function FiltersBadge({ count, hasFilters }: { count: number; hasFilters: boolean }) {
    if (!hasFilters) {return null;}
    return (
        <Badge variant="outline" className="text-[10px] bg-blue-100 border-blue-300 text-blue-700">
            {count} filter{count > 1 ? 's' : ''}
        </Badge>
    );
}

function SortBadge({ count, hasSorts }: { count: number; hasSorts: boolean }) {
    if (!hasSorts) {return null;}
    return (
        <Badge variant="outline" className="text-[10px] bg-purple-100 border-purple-300 text-purple-700">
            Sort by {count} key{count > 1 ? 's' : ''}
        </Badge>
    );
}

function RangeBadge({ offset, limit, hasRange }: { offset?: number | null; limit?: number | null; hasRange: boolean }) {
    if (!hasRange) {return null;}
    return (
        <Badge variant="outline" className="text-[10px] bg-orange-100 border-orange-300 text-orange-700">
            {(offset !== undefined && offset !== null && offset > 0) ? `Skip ${offset}` : ''}
            {(offset !== undefined && offset !== null) && (limit !== undefined && limit !== null) ? ', ' : ''}
            {(limit !== undefined && limit !== null && limit > 0) ? `Take ${limit}` : ''}
        </Badge>
    );
}

function SelectBadge({ count, hasSelect }: { count: number; hasSelect: boolean }) {
    if (!hasSelect) {return null;}
    return (
        <Badge variant="outline" className="text-[10px] bg-indigo-100 border-indigo-300 text-indigo-700">
            {count} column{count > 1 ? 's' : ''}
        </Badge>
    );
}

function DedupeBadge({ dedupe, hasDedupe }: { dedupe?: { fieldPath: string }; hasDedupe: boolean }) {
    if (!hasDedupe || !dedupe) {return null;}
    return (
        <Badge variant="outline" className="text-[10px] bg-pink-100 border-pink-300 text-pink-700">
            Dedupe by {dedupe.fieldPath}
        </Badge>
    );
}

function ExecutionOrder() {
    return (
        <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground py-2 bg-muted/20 rounded border border-dashed mb-2">
            <span className="font-medium">Execution Order:</span>
            <span>Filter</span>
            <span>→</span>
            <span>Sort</span>
            <span>→</span>
            <span>Range</span>
            <span>→</span>
            <span>Select</span>
            <span>→</span>
            <span>Dedupe</span>
        </div>
    );
}
