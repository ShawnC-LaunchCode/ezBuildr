import { useMemo } from "react";

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

import type { Condition, ComparisonOperator, OperatorConfig, VariableInfo } from "@shared/types/conditions";

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

    // Group variables for dropdown if needed
    const variablesBySection = useMemo(() => {
        if (condition.valueType !== "variable") {
            return {};
        }

        return allVariables.reduce((acc, variable) => {
            const sectionId = variable.sectionId;
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!acc[sectionId]) {
                acc[sectionId] = {
                    title: variable.sectionTitle,
                    variables: [],
                };
            }
            acc[sectionId].variables.push(variable);
            return acc;
        }, {} as Record<string, { title: string; variables: VariableInfo[] }>);
    }, [allVariables, condition.valueType]);

    // 1. Variable Reference Mode
    if (condition.valueType === "variable") {
        return (
            <Select value={getStringValue(condition.value)} onValueChange={handleValueChange}>
                <SelectTrigger className="w-[180px] text-sm bg-background">
                    <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent>
                    {Object.entries(variablesBySection).map(([sectionId, { title, variables: sectionVars }]) => (
                        <SelectGroup key={sectionId}>
                            <SelectLabel className="text-xs font-semibold text-muted-foreground">{title}</SelectLabel>
                            {sectionVars
                                .filter((v) => v.id !== condition.variable) // Don't allow comparing to self
                                .map((v) => (
                                    <SelectItem key={v.id} value={v.alias ?? v.id}>
                                        {v.alias ?? v.title}
                                    </SelectItem>
                                ))}
                        </SelectGroup>
                    ))}
                </SelectContent>
            </Select>
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
