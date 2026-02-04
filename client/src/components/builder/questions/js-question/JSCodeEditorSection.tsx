
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, useRef } from "react";

import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { JSQuestionConfig } from "./types";

interface JSCodeEditorSectionProps {
    config: JSQuestionConfig;
    onChange: (updates: Partial<JSQuestionConfig>) => void;
    elementId: string;
    workflowId?: string;
}

export function JSCodeEditorSection({ config, onChange, elementId, workflowId }: JSCodeEditorSectionProps) {
    const [showVariables, setShowVariables] = useState(false);
    const codeTextareaRef = useRef<HTMLTextAreaElement>(null);

    const handleInputKeysChange = (value: string) => {
        const keys = value.split(',').map(k => k.trim()).filter(k => k.length > 0);
        onChange({ inputKeys: keys });
    };

    // Insert variable path into code editor at cursor position
    const handleInsertVariable = (path: string) => {
        if (!codeTextareaRef.current) { return; }

        const textarea = codeTextareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentCode = config.code;

        // Insert the variable path with "input." prefix
        const insertText = `input.${path}`;
        const newCode = currentCode.substring(0, start) + insertText + currentCode.substring(end);

        onChange({ code: newCode });

        // Set cursor position after inserted text
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + insertText.length;
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    return (
        <div className="space-y-4">
            {/* Output Key */}
            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-output-${elementId}`} className="text-xs text-muted-foreground">
                    Output Variable
                </Label>
                <Input
                    id={`frame-js-output-${elementId}`}
                    value={config.outputKey}
                    onChange={(e) => onChange({ outputKey: e.target.value })}
                    placeholder="e.g., computed_value, full_name"
                    className="h-9 text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground pl-1">
                    Where to store the computed result
                </p>
            </div>

            {/* Input Keys */}
            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-inputs-${elementId}`} className="text-xs text-muted-foreground">
                    Input Variables (comma-separated)
                </Label>
                <Input
                    id={`frame-js-inputs-${elementId}`}
                    value={config.inputKeys.join(', ')}
                    onChange={(e) => handleInputKeysChange(e.target.value)}
                    placeholder="e.g., first_name, last_name, age"
                    className="h-9 text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground pl-1">
                    Variables from other questions to use as inputs
                </p>
            </div>

            {/* Code Editor */}
            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-code-${elementId}`} className="text-xs text-muted-foreground">
                    JavaScript Code
                </Label>
                <Textarea
                    ref={codeTextareaRef}
                    id={`frame-js-code-${elementId}`}
                    value={config.code}
                    onChange={(e) => onChange({ code: e.target.value })}
                    placeholder="return input.first_name + ' ' + input.last_name;"
                    rows={6}
                    className="text-sm font-mono resize-none"
                />
                <p className="text-xs text-muted-foreground pl-1">
                    Function body. Use <code className="font-mono">input</code> to access input variables. Return the result.
                </p>
            </div>

            {/* Variable Picker (if workflowId provided) */}
            {workflowId && (
                <Collapsible open={showVariables} onOpenChange={setShowVariables}>
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-between text-xs"
                        >
                            <span>Available Variables</span>
                            {showVariables ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                        <div className="border rounded-md max-h-64 overflow-hidden">
                            <EnhancedVariablePicker
                                workflowId={workflowId}
                                onInsert={handleInsertVariable}
                                showListProperties={true}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 pl-1">
                            Click any variable to insert it into your code at the cursor position.
                        </p>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}
