import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Code, Play, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { VariablePalette } from "@/components/builder/pages/VariablePalette";
import { useWorkflowVariables } from "@/lib/vault-hooks";
import { cn } from "@/lib/utils";
import { DevPanelBus } from "@/lib/devpanelBus";

interface JSBlockEditorProps {
  block: any;
  onChange: (updated: any) => void;
  workflowId?: string;
}

export const JSBlockEditor: React.FC<JSBlockEditorProps> = ({ block, onChange, workflowId }) => {
  const [code, setCode] = useState(block.config?.code || "");
  const [displayMode, setDisplayMode] = useState<"invisible" | "visible">(
    block.config?.display || "invisible"
  );
  const [inputKeys, setInputKeys] = useState<string[]>(block.config?.inputKeys || []);
  const [outputKey, setOutputKey] = useState(block.config?.outputKey || "computed_value");
  const [timeoutMs, setTimeoutMs] = useState(block.config?.timeoutMs || 1000);
  const [error, setError] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showInputKeySelector, setShowInputKeySelector] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { data: variables = [] } = useWorkflowVariables(workflowId || "");

  useEffect(() => {
    onChange({
      ...block,
      config: {
        ...block.config,
        code,
        display: displayMode,
        inputKeys,
        outputKey,
        timeoutMs,
      },
    });
  }, [code, displayMode, inputKeys, outputKey, timeoutMs]);

  // Listen for Insert events from DevPanel
  useEffect(() => {
    const unsubscribe = DevPanelBus.onInsert((key) => {
      const textarea = textareaRef.current;

      // If no textarea or not focused, fallback to clipboard
      if (!textarea || document.activeElement !== textarea) {
        navigator.clipboard.writeText(key).then(() => {
          toast({
            title: "Copied to clipboard",
            description: `"${key}" copied. No active editor found.`,
          });
        });
        return;
      }

      // Insert into active editor
      handleInsertVariable(key);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleInsertVariable = (key: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = code;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const toInsert = `input.${key}`;
    const newCode = before + toInsert + after;
    setCode(newCode);

    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + toInsert.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);

    toast({
      title: "Variable inserted",
      description: `"${key}" inserted at cursor position`,
    });
  };

  const handleAddInputKey = (key: string) => {
    if (!inputKeys.includes(key)) {
      setInputKeys([...inputKeys, key]);
    }
    setShowInputKeySelector(false);
  };

  const handleRemoveInputKey = (key: string) => {
    setInputKeys(inputKeys.filter((k) => k !== key));
  };

  const validateCode = () => {
    try {
      // eslint-disable-next-line no-new-func
      new Function("input", code);
      setError(null);
      toast({
        title: "Syntax Valid",
        description: "JS code parsed successfully.",
      });
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Syntax Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const runTest = () => {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("input", code);
      const mockInput = {
        exampleVar: 42,
        userName: "Ada",
        firstName: "Ada",
        lastName: "Lovelace"
      };
      const result = fn(mockInput);
      toast({
        title: "Test Run Complete",
        description: `Output: ${JSON.stringify(result, null, 2)}`,
      });
    } catch (err: any) {
      toast({
        title: "Execution Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex gap-2 h-full">
      {/* Main Editor */}
      <Card className={cn("flex-1 p-3", showPalette && "flex-[2]")}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              <h3 className="text-lg font-medium">JS Transform Block</h3>
            </div>
            {workflowId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPalette(!showPalette)}
              >
                {showPalette ? (
                  <>
                    <ChevronRight className="w-3 h-3 mr-1" />
                    Hide Variables
                  </>
                ) : (
                  <>
                    <ChevronLeft className="w-3 h-3 mr-1" />
                    Show Variables
                  </>
                )}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Write custom JavaScript logic to transform collected variables or derive computed values.
            Access input variables via the <code className="bg-muted px-1 py-0.5 rounded text-xs">input</code> object.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-4">
            {/* Display Mode */}
            <div className="space-y-2">
              <Label className="text-sm">Display Mode</Label>
              <RadioGroup
                value={displayMode}
                onValueChange={(v: "invisible" | "visible") => setDisplayMode(v)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="invisible" id="display-invisible" />
                  <Label htmlFor="display-invisible" className="font-normal cursor-pointer">
                    Invisible Transform (runs in background)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="visible" id="display-visible" />
                  <Label htmlFor="display-visible" className="font-normal cursor-pointer">
                    Visible Interactive (shows as question-like block)
                  </Label>
                </div>
              </RadioGroup>
              {displayMode === "visible" && (
                <p className="text-xs text-muted-foreground pl-6">
                  Visible mode allows you to create interactive blocks that appear in the runner.
                </p>
              )}
            </div>

            {/* Input Keys */}
            <div className="space-y-2">
              <Label className="text-sm">Input Variables</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md">
                {inputKeys.map((key) => (
                  <Badge key={key} variant="secondary" className="font-mono text-xs">
                    {key}
                    <button
                      onClick={() => handleRemoveInputKey(key)}
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
                            {v.alias || v.key}
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

            {/* Output Key */}
            <div className="space-y-2">
              <Label htmlFor="outputKey" className="text-sm">
                Output Variable Key
              </Label>
              <Input
                id="outputKey"
                value={outputKey}
                onChange={(e) => setOutputKey(e.target.value)}
                placeholder="e.g., computed_value, full_name, total"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The key under which the returned value will be stored
              </p>
            </div>

            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout" className="text-sm">
                Timeout (ms)
              </Label>
              <Input
                id="timeout"
                type="number"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 1000)}
                min={100}
                max={10000}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Maximum execution time in milliseconds (100-10000)
              </p>
            </div>

            {/* JavaScript Code */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                JavaScript Code
              </label>
              <Textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// Example:\n// return { fullName: input.firstName + ' ' + input.lastName };\n\n// Or perform calculations:\n// return { total: input.price * input.quantity };"
                className="font-mono text-sm h-64 resize-none"
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-destructive text-sm font-mono">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={validateCode}>
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Validate Syntax
              </Button>
              <Button size="sm" variant="secondary" onClick={runTest}>
                <Play className="w-3 h-3 mr-1" />
                Run Test
              </Button>
            </div>

            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">
                <strong>Tips:</strong>
              </p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                <li>Access variables via <code className="bg-background px-1 py-0.5 rounded">input.variableName</code></li>
                <li>Return an object with your transformed data</li>
                <li>Test with mock data: <code className="bg-background px-1 py-0.5 rounded">&#123;userName: "Ada", exampleVar: 42&#125;</code></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variable Palette */}
      {showPalette && workflowId && (
        <Card className="w-80 overflow-hidden flex flex-col">
          <CardHeader className="p-4 pb-2 border-b">
            <h3 className="text-sm font-semibold">Available Variables</h3>
          </CardHeader>
          <div className="flex-1 overflow-hidden">
            <VariablePalette
              workflowId={workflowId}
              onInsert={handleInsertVariable}
            />
          </div>
        </Card>
      )}
    </div>
  );
};
