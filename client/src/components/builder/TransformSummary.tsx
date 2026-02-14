/**
 * TransformSummary - Read-only display of transform configuration
 * Shows what filters, sorts, limits, etc. are applied to a list
 */

import { Filter, ArrowUpDown, Scissors, Columns, Hash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ListToolsConfig } from "@shared/types/blocks";

interface TransformSummaryProps {
  config: Partial<ListToolsConfig> | undefined;
  className?: string;
}

// eslint-disable-next-line complexity
export function TransformSummary({ config, className }: TransformSummaryProps) {
  if (!config) {
    return null;
  }

  const filters = config.filters?.rules ?? [];
  const sorts = config.sort ?? [];
  const selects = config.select ?? [];
  const dedupe = config.dedupe;

  const hasFilters = filters.length > 0;
  const hasSorts = sorts.length > 0;
  const hasRange = config.offset !== undefined || config.limit !== undefined;
  const hasSelect = selects.length > 0;
  const hasDedupe = !!dedupe;

  const hasAnyTransforms = hasFilters || hasSorts || hasRange || hasSelect || hasDedupe;

  if (!hasAnyTransforms) {
    return (
      <div className={className}>
        <p className="text-[10px] text-muted-foreground italic">No transforms applied</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-medium text-muted-foreground">Applied Transforms:</p>
      <div className="flex flex-wrap gap-1">
        {/* Filters */}
        {hasFilters && (
          <Badge variant="outline" className="text-[10px] bg-blue-50/50 border-blue-200 text-blue-700 gap-1">
            <Filter className="h-3 w-3" />
            {filters.length} filter{filters.length > 1 ? "s" : ""}
          </Badge>
        )}

        {/* Sort */}
        {hasSorts && (
          <Badge variant="outline" className="text-[10px] bg-purple-50/50 border-purple-200 text-purple-700 gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Sort by {sorts.length} key{sorts.length > 1 ? "s" : ""}
          </Badge>
        )}

        {/* Range (Offset/Limit) */}
        {hasRange && (
          <Badge variant="outline" className="text-[10px] bg-orange-50/50 border-orange-200 text-orange-700 gap-1">
            <Scissors className="h-3 w-3" />
            {config.offset ? `Skip ${config.offset}` : ""}
            {config.offset && config.limit ? ", " : ""}
            {config.limit ? `Take ${config.limit}` : ""}
          </Badge>
        )}

        {/* Select */}
        {hasSelect && (
          <Badge variant="outline" className="text-[10px] bg-indigo-50/50 border-indigo-200 text-indigo-700 gap-1">
            <Columns className="h-3 w-3" />
            {selects.length} column{selects.length > 1 ? "s" : ""}
          </Badge>
        )}

        {/* Dedupe */}
        {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
        {hasDedupe && dedupe && (
          <Badge variant="outline" className="text-[10px] bg-pink-50/50 border-pink-200 text-pink-700 gap-1">
            <Hash className="h-3 w-3" />
            Dedupe by {dedupe.fieldPath}
          </Badge>
        )}
      </div>
    </div>
  );
}
