import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface EditorVariable {
    key: string;
    alias?: string | null;
    type?: string;
}

interface InputVariablesPanelProps {
    inputKeys: string[];
    variables: EditorVariable[];
    onAddKey: (key: string) => void;
    onRemoveKey: (key: string) => void;
}

export function InputVariablesPanel({ inputKeys, variables, onAddKey, onRemoveKey }: InputVariablesPanelProps) {
    const [showInputKeySelector, setShowInputKeySelector] = useState(false);

    const getVariableDisplayName = (key: string) => {
        const variable = variables.find((v) => v.key === key);
        return variable?.alias ?? key;
    };

    const handleAddInputKey = (key: string) => {
        onAddKey(key);
        setShowInputKeySelector(false);
    };

    return (
        <div className="space-y-2">
            <Label className="text-sm">Input Variables</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md">
                {inputKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="font-mono text-xs">
                        {getVariableDisplayName(key)}
                        <button
                            onClick={() => onRemoveKey(key)}
                            className="ml-1.5 hover:text-destructive"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                {showInputKeySelector ? (
                    <div className="relative">
                        <select
                            className="text-xs border rounded px-2 py-1"
                            onChange={(e) => handleAddInputKey(e.target.value)}
                            value=""
                        >
                            <option value="">Select variable...</option>
                            {variables
                                .filter((v) => !inputKeys.includes(v.key))
                                .map((v) => (
                                    <option key={v.key} value={v.key}>
                                        {v.alias ?? v.key}
                                    </option>
                                ))}
                        </select>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setShowInputKeySelector(true)}
                    >
                        + Add Variable
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Select which variables this block can access via the{" "}
                <code className="bg-muted px-1 py-0.5 rounded">input</code> object
            </p>
        </div>
    );
}
