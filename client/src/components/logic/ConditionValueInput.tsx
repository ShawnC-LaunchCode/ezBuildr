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

import type { Condition, OperatorConfig, VariableInfo } from "@shared/types/conditions";

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
        if (val === null || val === undefined) {return "";}
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
        if (condition.valueType !== "variable") {return {};}

        return allVariables.reduce((acc, variable) => {
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

    // 2. Constant Value Mode
    const { valueType, needsTwoValues } = operatorConfig;

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
                        />
                    </>
                )}
            </div>
        );
    }

    // Date Input
    if (valueType === "date") {
        return (
            <div className="flex items-center gap-2">
                <Input
                    type="date"
                    value={getStringValue(condition.value)}
                    onChange={(e) => handleValueChange(e.target.value)}
                    className="w-[140px] text-sm bg-background"
                />
                {needsTwoValues && (
                    <>
                        <span className="text-muted-foreground text-sm">and</span>
                        <Input
                            type="date"
                            value={getStringValue(condition.value2)}
                            onChange={(e) => handleValue2Change(e.target.value)}
                            className="w-[140px] text-sm bg-background"
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
        />
    );
}
