import { Settings } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { EditorVariable } from "./InputVariablesPanel";
import { generateMockValue } from "./utils";

interface TestConfigPanelProps {
    inputKeys: string[];
    testData: Record<string, string>;
    variables: EditorVariable[];
    onTestDataChange: (data: Record<string, string>) => void;
}

export function TestConfigPanel({ inputKeys, testData, variables, onTestDataChange }: TestConfigPanelProps) {
    const [showTestConfig, setShowTestConfig] = useState(false);

    const handleGenerateAll = () => {
        const generatedData: Record<string, string> = { ...testData };

        for (const key of inputKeys) {
            // Only generate for empty fields
            if (!testData[key] || testData[key] === '') {
                const variable = variables.find((v) => v.key === key);
                const variableType = variable?.type ?? 'unknown';
                const mockValue = generateMockValue(variableType);
                // Convert to string (JSON.stringify for objects/arrays, toString for primitives)
                generatedData[key] = typeof mockValue === 'object'
                    ? JSON.stringify(mockValue)
                    : String(mockValue);
            }
        }

        onTestDataChange(generatedData);
    };

    if (inputKeys.length === 0) { return null; }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm">Test Data Configuration</Label>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTestConfig(!showTestConfig)}
                    className="h-6 text-xs"
                >
                    <Settings className="w-3 h-3 mr-1" />
                    {showTestConfig ? 'Hide' : 'Configure'}
                </Button>
            </div>

            {showTestConfig && (
                <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                        Customize test values for each input variable. Leave empty to use auto-generated mock data based on the variable type.
                    </p>
                    {inputKeys.map((key) => {
                        const variable = variables.find((v) => v.key === key);
                        const displayName = variable?.alias ?? key;
                        const variableType = variable?.type ?? 'unknown';

                        return (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`test-${key}`} className="text-xs font-medium">
                                    {displayName}
                                    <span className="text-muted-foreground font-normal ml-1">
                                        ({variableType})
                                    </span>
                                </Label>
                                <Input
                                    id={`test-${key}`}
                                    value={testData[key] ?? ''}
                                    onChange={(e) => onTestDataChange({ ...testData, [key]: e.target.value })}
                                    placeholder={`Auto: ${JSON.stringify(generateMockValue(variableType))}`}
                                    className="font-mono text-xs h-8"
                                />
                            </div>
                        );
                    })}
                    <div className="flex gap-2 pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateAll}
                            className="h-7 text-xs"
                        >
                            Generate All
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onTestDataChange({})}
                            className="h-7 text-xs"
                        >
                            Reset All
                        </Button>
                    </div>
                </div>
            )}

            {!showTestConfig && (
                <p className="text-xs text-muted-foreground">
                    Tests will use auto-generated mock data. Click Configure to customize.
                </p>
            )}
        </div>
    );
}
