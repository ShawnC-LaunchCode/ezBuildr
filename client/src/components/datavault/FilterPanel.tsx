/**
 * Filter Panel Component
 * Allows users to add, edit, and remove filters for data grid
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { useDatavaultFilterStore, EMPTY_FILTERS, type FilterCondition, type FilterOperator } from "@/stores/useDatavaultFilterStore";
import type { DatavaultColumn } from "@shared/schema";

interface FilterPanelProps {
  tableId: string;
  columns: DatavaultColumn[];
}

// Operator labels for UI
const operatorLabels: Record<FilterOperator, string> = {
  equals: "Equals",
  not_equals: "Not Equals",
  contains: "Contains",
  not_contains: "Does Not Contain",
  greater_than: "Greater Than",
  less_than: "Less Than",
  greater_than_or_equal: "Greater Than or Equal",
  less_than_or_equal: "Less Than or Equal",
  is_empty: "Is Empty",
  is_not_empty: "Is Not Empty",
  in: "In (comma-separated)",
  not_in: "Not In (comma-separated)",
};

// Get available operators for a column type
const getOperatorsForType = (type: string): FilterOperator[] => {
  switch (type) {
    case "short_text":
    case "long_text":
      return ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"];

    case "number":
      return [
        "equals",
        "not_equals",
        "greater_than",
        "less_than",
        "greater_than_or_equal",
        "less_than_or_equal",
        "is_empty",
        "is_not_empty",
      ];

    case "date":
    case "datetime":
      return [
        "equals",
        "not_equals",
        "greater_than",
        "less_than",
        "greater_than_or_equal",
        "less_than_or_equal",
        "is_empty",
        "is_not_empty",
      ];

    case "boolean":
    case "yes_no":
      return ["equals", "not_equals", "is_empty", "is_not_empty"];

    case "multiple_choice":
    case "radio":
    case "checkbox":
      return ["equals", "not_equals", "contains", "not_contains", "in", "not_in", "is_empty", "is_not_empty"];

    default:
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
  }
};

// Check if operator needs a value input
const operatorNeedsValue = (operator: FilterOperator): boolean => {
  return operator !== "is_empty" && operator !== "is_not_empty";
};

export function FilterPanel({ tableId, columns }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  // Use stable EMPTY_FILTERS reference to avoid infinite re-renders
  const filters = useDatavaultFilterStore((state) => state.filtersByTable[tableId] ?? EMPTY_FILTERS);
  const addFilter = useDatavaultFilterStore((state) => state.addFilter);
  const updateFilter = useDatavaultFilterStore((state) => state.updateFilter);
  const removeFilter = useDatavaultFilterStore((state) => state.removeFilter);
  const clearFilters = useDatavaultFilterStore((state) => state.clearFilters);

  const handleAddFilter = () => {
    if (columns.length === 0) return;

    const firstColumn = columns[0];
    const defaultOperator = getOperatorsForType(firstColumn.type)[0];

    const newFilter: FilterCondition = {
      id: crypto.randomUUID(),
      columnId: firstColumn.id,
      operator: defaultOperator,
      value: "",
    };

    addFilter(tableId, newFilter);
  };

  const handleColumnChange = (filterId: string, columnId: string) => {
    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    const availableOps = getOperatorsForType(column.type);
    const currentFilter = filters.find((f) => f.id === filterId);

    // Reset operator if current one isn't valid for new column type
    const newOperator = currentFilter && availableOps.includes(currentFilter.operator)
      ? currentFilter.operator
      : availableOps[0];

    updateFilter(tableId, filterId, { columnId, operator: newOperator, value: "" });
  };

  const handleOperatorChange = (filterId: string, operator: FilterOperator) => {
    updateFilter(tableId, filterId, { operator });
  };

  const handleValueChange = (filterId: string, value: string) => {
    updateFilter(tableId, filterId, { value });
  };

  const handleRemoveFilter = (filterId: string) => {
    removeFilter(tableId, filterId);
  };

  const handleClearAll = () => {
    clearFilters(tableId);
  };

  return (
    <Card className="mb-4">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Filters {filters.length > 0 && `(${filters.length})`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {filters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 text-xs"
              >
                Clear All
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddFilter}
              disabled={columns.length === 0}
              className="h-7"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Filter
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && filters.length > 0 && (
        <CardContent className="pt-0 pb-4 px-4 space-y-3">
          {filters.map((filter) => {
            const column = columns.find((c) => c.id === filter.columnId);
            if (!column) return null;

            const availableOperators = getOperatorsForType(column.type);
            const needsValue = operatorNeedsValue(filter.operator);

            return (
              <div
                key={filter.id}
                className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30"
              >
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Column Select */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Column</Label>
                      <Select
                        value={filter.columnId}
                        onValueChange={(value) => handleColumnChange(filter.id, value)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Operator Select */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Operator</Label>
                      <Select
                        value={filter.operator}
                        onValueChange={(value) =>
                          handleOperatorChange(filter.id, value as FilterOperator)
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableOperators.map((op) => (
                            <SelectItem key={op} value={op}>
                              {operatorLabels[op]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Value Input (if needed) */}
                  {needsValue && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Value</Label>
                      <Input
                        type={column.type === "number" ? "number" : column.type === "date" ? "date" : column.type === "datetime" ? "datetime-local" : "text"}
                        value={filter.value?.toString() || ""}
                        onChange={(e) => handleValueChange(filter.id, e.target.value)}
                        placeholder={`Enter ${column.name.toLowerCase()}...`}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFilter(filter.id)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive mt-5"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
