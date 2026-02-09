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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  const stepType: StepType = selectedVariable?.type || "short_text";
  const operators = getOperatorsForStepType(stepType);
  const currentOperator = getOperatorConfig(stepType, condition.operator);

  // Group variables by section for the dropdown
  const variablesBySection = variables.reduce((acc, variable) => {
    const sectionId = variable.sectionId;
    if (!acc[sectionId]) {
      acc[sectionId] = {
        title: variable.sectionTitle,
        variables: [],
      };
    }
    acc[sectionId].variables.push(variable);
    return acc;
  }, {} as Record<string, { title: string; variables: VariableInfo[] }>);

  // Helpers
  const getStringValue = (val: unknown): string => {
    if (val === null || val === undefined) { return ""; }
    return String(val);
  };

  const getVariableLabel = (val: string) => {
    const v = variables.find((v) => v.id === val || v.alias === val);
    return v ? (v.alias || v.title) : val;
  };

  // Handlers
  const handleVariableChange = (value: string) => {
    const newVariable = variables.find((v) => v.id === value || v.alias === value);
    const newStepType: StepType = newVariable?.type || "short_text";
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
      <Select value={getStringValue(condition.variable)} onValueChange={handleVariableChange}>
        <SelectTrigger className="w-[160px] text-sm bg-background">
          <SelectValue placeholder="Select variable...">
            {getVariableLabel(getStringValue(condition.variable))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(variablesBySection).map(([sectionId, { title, variables: sectionVars }]) => (
            <SelectGroup key={sectionId}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground">{title}</SelectLabel>
              {sectionVars.map((v) => (
                <SelectItem key={v.id} value={v.alias || v.id}>
                  <div className="flex flex-col text-left">
                    <span>{v.alias || v.title}</span>
                    {v.alias && (
                      <span className="text-[10px] text-muted-foreground">{v.title}</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Operator Selector */}
      <Select value={condition.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-[160px] text-sm bg-background">
          <SelectValue>
            {currentOperator?.label || condition.operator}
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
