/**
 * TransformSummary - Read-only display of transform configuration
 * Shows what filters, sorts, limits, etc. are applied to a list
 */

import { Filter, ArrowUpDown, Scissors, Columns, Hash } from "lucide-react";
import React from "react";

import { Badge } from "@/components/ui/badge";

import type { ListToolsConfig } from "@shared/types/blocks";

interface TransformSummaryProps {
  config: Partial<ListToolsConfig> | undefined;
  className?: string;
}

export function TransformSummary({ config, className }: TransformSummaryProps) {
  if (!config) {return null;}

  const hasFilters = (config.filters?.rules?.length || 0) > 0;
  const hasSorts = (config.sort?.length || 0) > 0;
  const hasRange = config.offset !== undefined || config.limit !== undefined;
  const hasSelect = (config.select?.length || 0) > 0;
  const hasDedupe = !!config.dedupe;

  const hasAnyTransforms = hasFilters || hasSorts || hasRange || hasSelect || hasDedupe;

  if (!hasAnyTransforms) {
    return (
      <div className={className}>
        <p className="text-[10px] text-muted-foreground italic">No transforms applied</p>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <p className="text-[10px] font-medium text-muted-foreground">Applied Transforms:</p>
      <div className="flex flex-wrap gap-1">
        {/* Filters */}
        {hasFilters && (
          <Badge variant="outline" className="text-[10px] bg-blue-50/50 border-blue-200 text-blue-700 gap-1">
            <Filter className="h-3 w-3" />
            {config.filters!.rules!.length} filter{config.filters!.rules!.length > 1 ? 's' : ''}
          </Badge>
        )}

        {/* Sort */}
        {hasSorts && (
          <Badge variant="outline" className="text-[10px] bg-purple-50/50 border-purple-200 text-purple-700 gap-1">
            <ArrowUpDown className="h-3 w-3" />
            Sort by {config.sort!.length} key{config.sort!.length > 1 ? 's' : ''}
          </Badge>
        )}

        {/* Range (Offset/Limit) */}
        {hasRange && (
          <Badge variant="outline" className="text-[10px] bg-orange-50/50 border-orange-200 text-orange-700 gap-1">
            <Scissors className="h-3 w-3" />
            {config.offset ? `Skip ${config.offset}` : ''}
            {config.offset && config.limit ? ', ' : ''}
            {config.limit ? `Take ${config.limit}` : ''}
          </Badge>
        )}

        {/* Select */}
        {hasSelect && (
          <Badge variant="outline" className="text-[10px] bg-indigo-50/50 border-indigo-200 text-indigo-700 gap-1">
            <Columns className="h-3 w-3" />
            {config.select!.length} column{config.select!.length > 1 ? 's' : ''}
          </Badge>
        )}

        {/* Dedupe */}
        {hasDedupe && (
          <Badge variant="outline" className="text-[10px] bg-pink-50/50 border-pink-200 text-pink-700 gap-1">
            <Hash className="h-3 w-3" />
            Dedupe by {config.dedupe!.fieldPath}
          </Badge>
        )}
      </div>
    </div>
  );
}
