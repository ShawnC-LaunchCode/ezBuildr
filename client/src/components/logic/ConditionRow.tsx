/**
 * ConditionRow - A single condition row in the logic builder
 *
 * Displays: [Variable Dropdown] [Operator Dropdown] [Value Input(s)] [Delete Button]
 */

import { X, ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  Condition,
  ComparisonOperator,
  VariableInfo,
  ConditionSupportedStepType as StepType,
} from "@shared/types/conditions";
import { getOperatorsForStepType, getOperatorConfig } from "@shared/types/conditions";

import { ConditionValueInput } from "./ConditionValueInput";
import { VariableCombobox } from "./VariableCombobox";

interface ConditionRowProps {
  condition: Condition;
  variables: VariableInfo[];
  onChange: (updated: Condition) => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function ConditionRow({
  condition,
  variables,
  onChange,
  onDelete,
  canDelete,
}: ConditionRowProps) {
  // Find the selected variable to get its type
  const selectedVariable = variables.find(
    (v) => v.id === condition.variable || v.alias === condition.variable
  );
  const stepType: StepType = selectedVariable?.type ?? "short_text";
  const operators = getOperatorsForStepType(stepType);
  const currentOperator = getOperatorConfig(stepType, condition.operator);

  // Helpers
  const getStringValue = (val: unknown): string => {
    if (val === null || val === undefined) { return ""; }
    return String(val);
  };

  // Handlers
  const handleVariableChange = (value: string) => {
    const newVariable = variables.find((v) => v.id === value || v.alias === value);
    const newStepType: StepType = newVariable?.type ?? "short_text";
    const newOperators = getOperatorsForStepType(newStepType);

    // Check if current operator is valid for new type, otherwise reset
    const isOperatorValid = newOperators.some((op) => op.value === condition.operator);
    const newOperator = isOperatorValid ? condition.operator : newOperators[0]?.value || "equals";

    onChange({
      ...condition,
      variable: value,
      operator: newOperator,
      // Reset value if operator changes
      value: isOperatorValid ? condition.value : "",
    });
  };

  const handleOperatorChange = (value: string) => {
    const newOperator = value as ComparisonOperator;
    const operatorConfig = getOperatorConfig(stepType, newOperator);

    onChange({
      ...condition,
      operator: newOperator,
      // Set implied value for boolean operators, or maintain/reset value
      value: operatorConfig?.impliedValue ?? (operatorConfig?.needsValue ? condition.value : undefined),
      value2: operatorConfig?.needsTwoValues ? condition.value2 : undefined,
    });
  };

  const handleToggleValueType = () => {
    onChange({
      ...condition,
      valueType: condition.valueType === "constant" ? "variable" : "constant",
      value: "", // Reset value when toggling
    });
  };

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded-md">
      {/* Variable Selector */}
      <VariableCombobox
        variables={variables}
        value={getStringValue(condition.variable)}
        onChange={handleVariableChange}
        placeholder="Select variable..."
        emptyText="No matching fields."
        ariaLabel="Select variable"
      />

      {/* Operator Selector */}
      <Select value={condition.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-[160px] text-sm bg-background">
          <SelectValue>
            {currentOperator?.label ?? condition.operator}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value Input */}
      {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */}
      {currentOperator?.needsValue && currentOperator && (
        <ConditionValueInput
          condition={condition}
          operatorConfig={currentOperator}
          selectedVariable={selectedVariable}
          allVariables={variables}
          onChange={(updates) => onChange({ ...condition, ...updates })}
        />
      )}

      {/* Toggle Value Type (constant/variable) */}
      {currentOperator?.needsValue && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 hover:bg-background"
                onClick={handleToggleValueType}
                aria-label={condition.valueType === "constant" ? "Switch to variable comparison" : "Switch to constant comparison"}
              >
                <ArrowRightLeft className={`h-3.5 w-3.5 ${condition.valueType === "variable" ? "text-primary" : "text-muted-foreground"}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{condition.valueType === "constant" ? "Compare to variable" : "Compare to constant"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-50"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete condition"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
