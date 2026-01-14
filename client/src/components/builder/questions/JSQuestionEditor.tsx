/**
 * JS Question Editor Component
 * Editor for JavaScript question configuration
 * Handles code, input/output mapping, display mode, and timeout settings
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface JSQuestionConfig {
  display: "visible" | "hidden";
  code: string;
  inputKeys: string[];
  outputKey: string;
  timeoutMs?: number;
  helpText?: string;
}

interface JSQuestionEditorProps {
  config: JSQuestionConfig;
  onChange: (config: JSQuestionConfig) => void;
  className?: string;
  elementId: string;
  workflowId?: string; // For variable picker
}

export function JSQuestionEditor({ config, onChange, className, elementId, workflowId }: JSQuestionEditorProps) {
  const [localConfig, setLocalConfig] = useState<JSQuestionConfig>(config);
  const [showVariables, setShowVariables] = useState(false);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with external changes
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleChange = (updates: Partial<JSQuestionConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
  };

  const handleBlur = () => {
    onChange(localConfig);
  };

  const handleInputKeysChange = (value: string) => {
    const keys = value.split(',').map(k => k.trim()).filter(k => k.length > 0);
    handleChange({ inputKeys: keys });
  };

  // Insert variable path into code editor at cursor position
  const handleInsertVariable = (path: string) => {
    if (!codeTextareaRef.current) {return;}

    const textarea = codeTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentCode = localConfig.code;

    // Insert the variable path with "input." prefix
    const insertText = `input.${path}`;
    const newCode = currentCode.substring(0, start) + insertText + currentCode.substring(end);

    handleChange({ code: newCode });

    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + insertText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm font-medium text-muted-foreground border-b pb-1">
        JavaScript Configuration
      </div>

      {/* Display Mode */}
      <div className="space-y-1.5">
        <Label htmlFor={`frame-js-display-${elementId}`} className="text-xs text-muted-foreground">
          Display Mode
        </Label>
        <Select
          value={localConfig.display}
          onValueChange={(value) => {
            const newDisplay = value as "visible" | "hidden";
            handleChange({ display: newDisplay });
            handleBlur();
          }}
        >
          <SelectTrigger id={`frame-js-display-${elementId}`} className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hidden">Hidden (compute only)</SelectItem>
            <SelectItem value="visible">Visible (interactive)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground pl-1">
          {localConfig.display === "hidden"
            ? "Runs as background computation, no UI shown"
            : "Shows help text in runner, but still computes automatically"}
        </p>
      </div>

      {/* Output Key */}
      <div className="space-y-1.5">
        <Label htmlFor={`frame-js-output-${elementId}`} className="text-xs text-muted-foreground">
          Output Variable
        </Label>
        <Input
          id={`frame-js-output-${elementId}`}
          value={localConfig.outputKey}
          onChange={(e) => handleChange({ outputKey: e.target.value })}
          onBlur={handleBlur}
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
          value={localConfig.inputKeys.join(', ')}
          onChange={(e) => handleInputKeysChange(e.target.value)}
          onBlur={handleBlur}
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
          value={localConfig.code}
          onChange={(e) => handleChange({ code: e.target.value })}
          onBlur={handleBlur}
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

      {/* Helper Library Documentation */}
      <HelperLibraryDocs />

      {/* Timeout */}
      <div className="space-y-1.5">
        <Label htmlFor={`frame-js-timeout-${elementId}`} className="text-xs text-muted-foreground">
          Timeout (ms)
        </Label>
        <Input
          id={`frame-js-timeout-${elementId}`}
          type="number"
          value={localConfig.timeoutMs || 1000}
          onChange={(e) => handleChange({ timeoutMs: parseInt(e.target.value) || 1000 })}
          onBlur={handleBlur}
          min={100}
          max={3000}
          className="h-9 text-sm"
        />
        <p className="text-xs text-muted-foreground pl-1">
          Execution timeout (100-3000ms)
        </p>
      </div>

      {/* Help Text (shown when display = visible) */}
      {localConfig.display === "visible" && (
        <div className="space-y-1.5">
          <Label htmlFor={`frame-js-help-${elementId}`} className="text-xs text-muted-foreground">
            Help Text (optional)
          </Label>
          <Textarea
            id={`frame-js-help-${elementId}`}
            value={localConfig.helpText || ""}
            onChange={(e) => handleChange({ helpText: e.target.value })}
            onBlur={handleBlur}
            placeholder="Optional text to show in the runner..."
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      )}
    </div>
  );
}
