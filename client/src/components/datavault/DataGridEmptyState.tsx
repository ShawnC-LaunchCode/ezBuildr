/**
 * DataGrid Empty State Component
 * Empty states for the data grid (no rows, filtered empty, no archived)
 */

import { Database, Filter, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateVariant = "no_rows" | "filtered_empty" | "no_archived";

interface DataGridEmptyStateProps {
  variant: EmptyStateVariant;
  onAddRow?: () => void;
  onClearFilters?: () => void;
  onShowAll?: () => void;
}

const emptyStateConfig = {
  no_rows: {
    icon: Database,
    title: "No rows yet",
    description: "Get started by adding your first row to this table.",
    actionLabel: "Add Row",
  },
  filtered_empty: {
    icon: Filter,
    title: "No matching rows",
    description: "Try adjusting your filters or search criteria.",
    actionLabel: "Clear Filters",
  },
  no_archived: {
    icon: Archive,
    title: "No archived rows",
    description: "Archived rows will appear here when you archive them.",
    actionLabel: "Show All Rows",
  },
};

export function DataGridEmptyState({
  variant,
  onAddRow,
  onClearFilters,
  onShowAll,
}: DataGridEmptyStateProps) {
  const config = emptyStateConfig[variant];
  const Icon = config.icon;

  const handleAction = () => {
    if (variant === "no_rows" && onAddRow) {
      onAddRow();
    } else if (variant === "filtered_empty" && onClearFilters) {
      onClearFilters();
    } else if (variant === "no_archived" && onShowAll) {
      onShowAll();
    }
  };

  const showAction =
    (variant === "no_rows" && onAddRow) ||
    (variant === "filtered_empty" && onClearFilters) ||
    (variant === "no_archived" && onShowAll);

  return (
    <div className="border rounded-lg bg-muted/10 flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{config.title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {config.description}
      </p>
      {showAction && (
        <Button onClick={handleAction} variant="outline">
          {config.actionLabel}
        </Button>
      )}
    </div>
  );
}
