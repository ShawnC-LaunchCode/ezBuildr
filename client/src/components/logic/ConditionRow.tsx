/**
 * ConditionRow - A single condition row in the logic builder
 *
 * Displays: [Variable Dropdown] [Operator Dropdown] [Value Input] [Delete Button]
 * Operators are filtered based on the selected variable's step type.
 */

import { X, ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  OperatorConfig,
  StepType,
} from "@shared/types/conditions";
import { getOperatorsForStepType, getOperatorConfig } from "@shared/types/conditions";

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

  // Handle variable change
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

  // Handle operator change
  const handleOperatorChange = (value: string) => {
    const newOperator = value as ComparisonOperator;
    const operatorConfig = getOperatorConfig(stepType, newOperator);

    onChange({
      ...condition,
      operator: newOperator,
      // Set implied value for boolean operators, or reset if operator needs value
      value: operatorConfig?.impliedValue ?? (operatorConfig?.needsValue ? condition.value : undefined),
      value2: operatorConfig?.needsTwoValues ? condition.value2 : undefined,
    });
  };

  // Handle value change
  const handleValueChange = (value: string) => {
    onChange({
      ...condition,
      value,
    });
  };

  // Handle value2 change (for 'between' operator)
  const handleValue2Change = (value: string) => {
    onChange({
      ...condition,
      value2: value,
    });
  };

  // Toggle between constant and variable reference
  const handleToggleValueType = () => {
    onChange({
      ...condition,
      valueType: condition.valueType === "constant" ? "variable" : "constant",
      value: "", // Reset value when toggling
    });
  };

  // Render value input based on operator and variable type
  const renderValueInput = () => {
    if (!currentOperator?.needsValue) {
      return null;
    }

    // Variable reference mode
    if (condition.valueType === "variable") {
      return (
        <Select value={condition.value || ""} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[180px] text-sm">
            <SelectValue placeholder="Select variable..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(variablesBySection).map(([sectionId, { title, variables: sectionVars }]) => (
              <SelectGroup key={sectionId}>
                <SelectLabel className="text-xs">{title}</SelectLabel>
                {sectionVars
                  .filter((v) => v.id !== condition.variable) // Don't show self
                  .map((v) => (
                    <SelectItem key={v.id} value={v.alias || v.id}>
                      {v.alias || v.title}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Constant value mode
    const valueType = currentOperator.valueType;

    // Choices dropdown for choice-based steps
    if (valueType === "choices" && selectedVariable?.choices) {
      return (
        <Select value={condition.value || ""} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[180px] text-sm">
            <SelectValue placeholder="Select option..." />
          </SelectTrigger>
          <SelectContent>
            {selectedVariable.choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Number input
    if (valueType === "number") {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={condition.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-[100px] text-sm"
            placeholder="Value"
          />
          {currentOperator.needsTwoValues && (
            <>
              <span className="text-muted-foreground text-sm">and</span>
              <Input
                type="number"
                value={condition.value2 ?? ""}
                onChange={(e) => handleValue2Change(e.target.value)}
                className="w-[100px] text-sm"
                placeholder="Value"
              />
            </>
          )}
        </div>
      );
    }

    // Date input
    if (valueType === "date") {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={condition.value ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-[150px] text-sm"
          />
          {currentOperator.needsTwoValues && (
            <>
              <span className="text-muted-foreground text-sm">and</span>
              <Input
                type="date"
                value={condition.value2 ?? ""}
                onChange={(e) => handleValue2Change(e.target.value)}
                className="w-[150px] text-sm"
              />
            </>
          )}
        </div>
      );
    }

    // Default text input
    return (
      <Input
        type="text"
        value={condition.value ?? ""}
        onChange={(e) => handleValueChange(e.target.value)}
        className="w-[180px] text-sm"
        placeholder="Value"
      />
    );
  };

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded-md">
      {/* Variable Selector */}
      <Select value={condition.variable || ""} onValueChange={handleVariableChange}>
        <SelectTrigger className="w-[160px] text-sm">
          <SelectValue placeholder="Select variable...">
            {condition.variable && (() => {
              const v = variables.find((v) => v.id === condition.variable || v.alias === condition.variable);
              return v ? (v.alias || v.title) : condition.variable;
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(variablesBySection).map(([sectionId, { title, variables: sectionVars }]) => (
            <SelectGroup key={sectionId}>
              <SelectLabel className="text-xs">{title}</SelectLabel>
              {sectionVars.map((v) => (
                <SelectItem key={v.id} value={v.alias || v.id}>
                  <div className="flex flex-col">
                    <span>{v.alias || v.title}</span>
                    {v.alias && (
                      <span className="text-xs text-muted-foreground">{v.title}</span>
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
        <SelectTrigger className="w-[160px] text-sm">
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
      {renderValueInput()}

      {/* Toggle Value Type (constant/variable) */}
      {currentOperator?.needsValue && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleToggleValueType}
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
        className="h-8 w-8 shrink-0"
        onClick={onDelete}
        disabled={!canDelete}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
