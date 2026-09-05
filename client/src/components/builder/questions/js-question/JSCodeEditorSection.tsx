import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { CodeBlockInput, CodeBlockOutput, JSQuestionConfig } from "./types";

const OUTPUT_TYPES: CodeBlockOutput['type'][] = ['string', 'number', 'boolean', 'date', 'object', 'list'];

interface JSCodeEditorSectionProps {
    config: JSQuestionConfig;
    onChange: (updates: Partial<JSQuestionConfig>) => void;
    elementId: string;
    workflowId?: string;
}

type OutputRowProps = {
    output: CodeBlockOutput;
    rowId: string;
    canRemove: boolean;
    onChange: (output: CodeBlockOutput) => void;
    onRemove: () => void;
};

function OutputRow({ output, rowId, canRemove, onChange, onRemove }: OutputRowProps): JSX.Element {
    return (
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_130px_auto]">
            <Input
                id={`${rowId}-key`}
                aria-label="Output key"
                value={output.key}
                onChange={(event) => onChange({ ...output, key: event.target.value })}
                placeholder="output_key"
                className="h-9 font-mono text-sm"
            />
            <Select value={output.type} onValueChange={(type: CodeBlockOutput['type']) => onChange({ ...output, type })}>
                <SelectTrigger aria-label="Output type" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {OUTPUT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
            </Select>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canRemove}
                onClick={onRemove}
                aria-label={`Remove output ${output.key}`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            <Input
                value={output.description ?? ''}
                onChange={(event) => onChange({ ...output, description: event.target.value || undefined })}
                placeholder="Description (optional)"
                className="h-9 text-sm sm:col-span-3"
            />
        </div>
    );
}

type InputRowProps = {
    input: CodeBlockInput;
    rowId: string;
    onChange: (input: CodeBlockInput) => void;
    onRemove: () => void;
};

function InputRow({ input, rowId, onChange, onRemove }: InputRowProps): JSX.Element {
    return (
        <div className="flex items-center gap-2 rounded-md border p-3">
            <Input
                id={`${rowId}-key`}
                aria-label="Input key"
                value={input.key}
                onChange={(event) => onChange({ ...input, key: event.target.value })}
                placeholder="input_key"
                className="h-9 flex-1 font-mono text-sm"
            />
            <div className="flex items-center gap-2">
                <Checkbox
                    id={`${rowId}-required`}
                    checked={input.required}
                    onCheckedChange={(checked) => onChange({ ...input, required: checked === true })}
                />
                <Label htmlFor={`${rowId}-required`} className="text-xs">Required</Label>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove input ${input.key}`}>
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}

export function JSCodeEditorSection({ config, onChange, elementId, workflowId }: JSCodeEditorSectionProps): JSX.Element {
    const [showVariables, setShowVariables] = useState(false);
    const codeTextareaRef = useRef<HTMLTextAreaElement>(null);

    const updateOutput = (index: number, output: CodeBlockOutput): void => {
        onChange({ outputs: config.outputs.map((item, itemIndex) => itemIndex === index ? output : item) });
    };
    const updateInput = (index: number, input: CodeBlockInput): void => {
        onChange({ inputs: config.inputs.map((item, itemIndex) => itemIndex === index ? input : item) });
    };
    const handleInsertVariable = (path: string): void => {
        const textarea = codeTextareaRef.current;
        if (!textarea) { return; }
        const insertText = `input.${path}`;
        const newCode = config.code.slice(0, textarea.selectionStart) + insertText + config.code.slice(textarea.selectionEnd);
        const newPosition = textarea.selectionStart + insertText.length;
        onChange({ code: newCode });
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Saving adds input and output keys found in your code. Reopen to review them,
                mark inputs optional, or narrow output types. Your declarations are kept.
                For dynamic input access or non-literal emit values, declare the keys manually.
            </p>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Declared Outputs</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => onChange({ outputs: [...config.outputs, { key: '', type: 'object' }] })}>
                        <Plus className="mr-1 h-3 w-3" /> Add output
                    </Button>
                </div>
                {config.outputs.map((output, index) => (
                    <OutputRow
                        key={index}
                        output={output}
                        rowId={`frame-js-output-${elementId}-${index}`}
                        canRemove={config.outputs.length > 1}
                        onChange={(nextOutput) => updateOutput(index, nextOutput)}
                        onRemove={() => onChange({ outputs: config.outputs.filter((_, itemIndex) => itemIndex !== index) })}
                    />
                ))}
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Declared Inputs</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => onChange({ inputs: [...config.inputs, { key: '', required: true }] })}>
                        <Plus className="mr-1 h-3 w-3" /> Add input
                    </Button>
                </div>
                {config.inputs.map((input, index) => (
                    <InputRow
                        key={index}
                        input={input}
                        rowId={`frame-js-input-${elementId}-${index}`}
                        onChange={(nextInput) => updateInput(index, nextInput)}
                        onRemove={() => onChange({ inputs: config.inputs.filter((_, itemIndex) => itemIndex !== index) })}
                    />
                ))}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-timeout-${elementId}`} className="text-xs text-muted-foreground">Timeout (ms)</Label>
                <Input
                    id={`frame-js-timeout-${elementId}`}
                    type="number"
                    value={config.timeoutMs ?? 1000}
                    onChange={(event) => onChange({ timeoutMs: Number(event.target.value) || 1000 })}
                    min={100}
                    max={30000}
                    className="h-9 text-sm"
                />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-code-${elementId}`} className="text-xs text-muted-foreground">JavaScript Code</Label>
                <Textarea
                    ref={codeTextareaRef}
                    id={`frame-js-code-${elementId}`}
                    value={config.code}
                    onChange={(event) => onChange({ code: event.target.value })}
                    placeholder="emit({ output_key: input.some_value });"
                    rows={8}
                    className="resize-none font-mono text-sm"
                />
                <p className="pl-1 text-xs text-muted-foreground">
                    Call <code className="font-mono">emit</code> once with an object containing only declared output keys.
                </p>
            </div>

            {workflowId && (
                <Collapsible open={showVariables} onOpenChange={setShowVariables}>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                            <span>Available Variables</span>
                            {showVariables ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                        <div className="max-h-64 overflow-hidden rounded-md border">
                            <EnhancedVariablePicker workflowId={workflowId} onInsert={handleInsertVariable} showListProperties={true} />
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}
