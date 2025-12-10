/**
 * ConditionGroup - A group of conditions with AND/OR toggle
 *
 * Displays a bordered group containing:
 * - Multiple condition rows
 * - AND/OR toggle between conditions
 * - Nested groups (recursive)
 * - Add condition/group buttons
 */

import { Plus, Trash2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConditionRow } from "./ConditionRow";
import type {
  Condition,
  ConditionGroup as ConditionGroupType,
  LogicalOperator,
  VariableInfo,
} from "@shared/types/conditions";
import { createEmptyCondition, createEmptyGroup } from "@shared/types/conditions";

interface ConditionGroupProps {
  group: ConditionGroupType;
  variables: VariableInfo[];
  onChange: (updated: ConditionGroupType) => void;
  onDelete?: () => void;
  depth?: number;
  isRoot?: boolean;
}

export function ConditionGroup({
  group,
  variables,
  onChange,
  onDelete,
  depth = 0,
  isRoot = false,
}: ConditionGroupProps) {
  // Toggle the group's logical operator
  const handleToggleOperator = () => {
    onChange({
      ...group,
      operator: group.operator === "AND" ? "OR" : "AND",
    });
  };

  // Update a condition at a specific index
  const handleConditionChange = (index: number, updated: Condition | ConditionGroupType) => {
    const newConditions = [...group.conditions];
    newConditions[index] = updated;
    onChange({
      ...group,
      conditions: newConditions,
    });
  };

  // Delete a condition at a specific index
  const handleConditionDelete = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    onChange({
      ...group,
      conditions: newConditions.length > 0 ? newConditions : [createEmptyCondition()],
    });
  };

  // Add a new condition
  const handleAddCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createEmptyCondition()],
    });
  };

  // Add a nested group
  const handleAddGroup = () => {
    const nestedOperator: LogicalOperator = group.operator === "AND" ? "OR" : "AND";
    onChange({
      ...group,
      conditions: [...group.conditions, createEmptyGroup(nestedOperator)],
    });
  };

  // Render a single item (condition or nested group)
  const renderItem = (item: Condition | ConditionGroupType, index: number) => {
    if (item.type === "condition") {
      return (
        <ConditionRow
          key={item.id}
          condition={item}
          variables={variables}
          onChange={(updated: any) => handleConditionChange(index, updated)}
          onDelete={() => handleConditionDelete(index)}
          canDelete={group.conditions.length > 1}
        />
      );
    } else {
      return (
        <ConditionGroup
          key={item.id}
          group={item}
          variables={variables}
          onChange={(updated: any) => handleConditionChange(index, updated)}
          onDelete={() => handleConditionDelete(index)}
          depth={depth + 1}
        />
      );
    }
  };

  // Style based on depth
  const borderColor = depth % 2 === 0 ? "border-border" : "border-primary/30";
  const bgColor = depth % 2 === 0 ? "bg-background" : "bg-muted/20";

  return (
    <div
      className={`
        relative rounded-lg border-2 ${borderColor} ${bgColor}
        ${isRoot ? "p-4" : "p-3 ml-4"}
        ${depth > 0 ? "mt-2" : ""}
      `}
    >
      {/* Group Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Operator Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs font-semibold"
            onClick={handleToggleOperator}
          >
            Match{" "}
            <Badge
              variant={group.operator === "AND" ? "default" : "secondary"}
              className="ml-1.5 px-1.5"
            >
              {group.operator === "AND" ? "ALL" : "ANY"}
            </Badge>
          </Button>

          <span className="text-xs text-muted-foreground">
            of these conditions
          </span>
        </div>

        {/* Delete Group (only for nested groups) */}
        {!isRoot && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Remove Group
          </Button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-1">
        {group.conditions.map((item, index) => (
          <div key={item.id}>
            {/* Render the condition or nested group */}
            {renderItem(item as any, index)}

            {/* Operator divider between conditions */}
            {index < group.conditions.length - 1 && (
              <div className="flex items-center justify-center py-1">
                <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                <span
                  className={`
                    px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider
                    ${group.operator === "AND" ? "text-primary" : "text-secondary-foreground"}
                  `}
                >
                  {group.operator}
                </span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAddCondition}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Condition
        </Button>

        {depth < 2 && ( // Limit nesting depth to 3 levels
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddGroup}
          >
            <FolderPlus className="h-3 w-3 mr-1" />
            Add Group
          </Button>
        )}
      </div>
    </div>
  );
}
