import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { Condition, ComparisonOperator, OperatorConfig, VariableInfo } from "@shared/types/conditions";

import { VariableCombobox } from "./VariableCombobox";

// Unit label for the numeric side of the date-diff operators (diff_days/weeks/months/years)
const DATE_DIFF_UNIT_LABELS: Partial<Record<ComparisonOperator, string>> = {
    diff_days: "Days",
    diff_weeks: "Weeks",
    diff_months: "Months",
    diff_years: "Years",
};

interface ConditionValueInputProps {
    condition: Condition;
    operatorConfig: OperatorConfig;
    selectedVariable: VariableInfo | undefined;
    allVariables: VariableInfo[];
    onChange: (updates: Partial<Condition>) => void;
}

export function ConditionValueInput({
    condition,
    operatorConfig,
    selectedVariable,
    allVariables,
    onChange,
}: ConditionValueInputProps) {

    // Helpers to safely get string values from potentially mixed types
    const getStringValue = (val: unknown): string => {
        if (val === null || val === undefined) {
            return "";
        }
        return String(val);
    };

    const handleValueChange = (val: string) => {
        onChange({ value: val });
    };

    const handleValue2Change = (val: string) => {
        onChange({ value2: val });
    };

    // Candidate operands for variable-reference mode: every variable except
    // the one already selected as the condition's own operand (don't allow
    // comparing a variable to itself).
    const referenceVariables = useMemo(() => {
        if (condition.valueType !== "variable") {
            return [];
        }
        return allVariables.filter((v) => v.id !== condition.variable);
    }, [allVariables, condition.valueType, condition.variable]);

    // 1. Variable Reference Mode
    if (condition.valueType === "variable") {
        return (
            <VariableCombobox
                variables={referenceVariables}
                value={getStringValue(condition.value)}
                onChange={handleValueChange}
                placeholder="Select variable..."
                emptyText="No matching fields."
                ariaLabel="Select comparison variable"
                triggerClassName="w-[180px]"
            />
        );
    }

    // 2. Constant Value Mode
    const { valueType, needsTwoValues, value2Type = operatorConfig.valueType } = operatorConfig;

    // Choices (Dropdown)
    if (valueType === "choices" && selectedVariable?.choices) {
        return (
            <Select value={getStringValue(condition.value)} onValueChange={handleValueChange}>
                <SelectTrigger className="w-[180px] text-sm bg-background">
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

    // Number Input
    if (valueType === "number") {
        return (
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    value={getStringValue(condition.value)}
                    onChange={(e) => handleValueChange(e.target.value)}
                    className="w-[100px] text-sm bg-background"
                    placeholder="Value"
                    aria-label="Numeric value"
                />
                {needsTwoValues && (
                    <>
                        <span className="text-muted-foreground text-sm">and</span>
                        <Input
                            type="number"
                            value={getStringValue(condition.value2)}
                            onChange={(e) => handleValue2Change(e.target.value)}
                            className="w-[100px] text-sm bg-background"
                            placeholder="Value"
                            aria-label="Second numeric value"
                        />
                    </>
                )}
            </div>
        );
    }

    // Date Input
    if (valueType === "date") {
        // Date-diff operators (diff_days/weeks/months/years) compare a date in
        // `value` against a day/week/month/year count in `value2`, so the
        // second field renders as a number input in that case instead of a
        // second date picker (e.g. plain `between`).
        const isValue2Number = value2Type === "number";
        const unitLabel = DATE_DIFF_UNIT_LABELS[condition.operator] ?? "Number";
        return (
            <div className="flex items-center gap-2">
                <Input
                    type="date"
                    value={getStringValue(condition.value)}
                    onChange={(e) => handleValueChange(e.target.value)}
                    className="w-[140px] text-sm bg-background"
                    aria-label="Date value"
                />
                {needsTwoValues && (
                    <>
                        <span className="text-muted-foreground text-sm">and</span>
                        <Input
                            type={isValue2Number ? "number" : "date"}
                            value={getStringValue(condition.value2)}
                            onChange={(e) => handleValue2Change(e.target.value)}
                            className={isValue2Number ? "w-[100px] text-sm bg-background" : "w-[140px] text-sm bg-background"}
                            placeholder={isValue2Number ? unitLabel : undefined}
                            aria-label={isValue2Number ? `Number of ${unitLabel.toLowerCase()}` : "Second date value"}
                        />
                    </>
                )}
            </div>
        );
    }

    // Default Text Input
    return (
        <Input
            type="text"
            value={getStringValue(condition.value)}
            onChange={(e) => handleValueChange(e.target.value)}
            className="w-[180px] text-sm bg-background"
            placeholder="Value"
            aria-label="Text value"
        />
    );
}
