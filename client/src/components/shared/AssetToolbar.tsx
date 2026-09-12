/**
 * Search field + card/list view switch, shared by the project and workflow
 * browsing surfaces.
 */

import { LayoutGrid, List as ListIcon, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AssetViewMode } from "@/hooks/useAssetBrowser";
import { cn } from "@/lib/utils";

interface AssetToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: AssetViewMode;
  onViewModeChange: (mode: AssetViewMode) => void;
  /** Number of items currently shown; rendered next to the search field. */
  resultCount: number;
  /** Total before filtering — the count line only appears once these differ. */
  totalCount: number;
  placeholder?: string;
  /** Noun for the count line, e.g. "workflow". Pluralised with a trailing "s". */
  itemNoun?: string;
  className?: string;
}

export function AssetToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  resultCount,
  totalCount,
  placeholder = "Search by name or description...",
  itemNoun = "item",
  className,
}: AssetToolbarProps) {
  const isFiltering = search.trim() !== "";

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="relative w-full max-w-sm min-w-[200px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          // `type="search"` keeps Escape-to-clear, but WebKit also paints its own
          // cancel button — which sat right next to ours as a second stray "×".
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          data-testid="input-asset-search"
        />
        {isFiltering && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {isFiltering && (
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite" data-testid="text-result-count">
          {resultCount} of {totalCount} {itemNoun}
          {totalCount === 1 ? "" : "s"}
        </p>
      )}

      <div className="flex-1" />

      <TooltipProvider>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            // Radix emits "" when the active item is re-clicked; keep a view selected.
            if (value === "grid" || value === "list") {
              onViewModeChange(value);
            }
          }}
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label="View mode"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="grid" aria-label="Card view" data-testid="button-view-grid">
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Card view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="list" aria-label="List view" data-testid="button-view-list">
                <ListIcon className="h-4 w-4" aria-hidden="true" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </TooltipProvider>
    </div>
  );
}
