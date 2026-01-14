import { Code, Play, CheckCircle2, ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { VariablePalette } from "@/components/builder/pages/VariablePalette";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DevPanelBus } from "@/lib/devpanelBus";
import { cn } from "@/lib/utils";
import { useWorkflowVariables, useWorkflowMode } from "@/lib/vault-hooks";

interface JSBlockEditorProps {
  block: any;
  onChange: (updated: any) => void;
  workflowId?: string;
}

export const JSBlockEditor: React.FC<JSBlockEditorProps> = ({ block, onChange, workflowId }) => {
  const [blockName, setBlockName] = useState(block.config?.name || "");
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
  const [showTestConfig, setShowTestConfig] = useState(false);
  const [testData, setTestData] = useState<Record<string, string>>(block.config?.testData || {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { data: variables = [] } = useWorkflowVariables(workflowId || "");
  const { data: workflowMode } = useWorkflowMode(workflowId || "");
  const isAdvancedMode = workflowMode?.mode === "advanced";

  useEffect(() => {
    onChange({
      ...block,
      config: {
        ...block.config,
        name: blockName,
        code,
        display: displayMode,
        inputKeys,
        outputKey,
        timeoutMs,
        testData,
      },
    });
  }, [blockName, code, displayMode, inputKeys, outputKey, timeoutMs, testData]);

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
    if (!textarea) {return;}

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

  const getVariableDisplayName = (key: string) => {
    const variable = variables.find((v) => v.key === key);
    return variable?.alias || key;
  };

  const generateMockValue = (type: string): any => {
    switch (type) {
      case 'short_text':
        return 'Sample Text';
      case 'long_text':
        return 'This is a sample long text response with multiple words.';
      case 'yes_no':
        return true;
      case 'radio':
        return 'Option 1';
      case 'multiple_choice':
        return ['Option 1', 'Option 2'];
      case 'date_time':
        return new Date().toISOString();
      case 'file_upload':
        return 'sample-file.pdf';
      case 'loop_group':
        return [{ iteration: 1, value: 'Sample' }];
      default:
        return 'Sample Value';
    }
  };

  const generateMockInput = (): Record<string, any> => {
    const mockInput: Record<string, any> = {};

    for (const key of inputKeys) {
      // Check if user provided custom test data
      if (testData[key] !== undefined && testData[key] !== '') {
        // Try to parse as JSON first, fallback to string
        try {
          mockInput[key] = JSON.parse(testData[key]);
        } catch {
          mockInput[key] = testData[key];
        }
      } else {
        // Generate mock data based on variable type
        const variable = variables.find((v) => v.key === key);
        if (variable) {
          mockInput[key] = generateMockValue(variable.type);
        } else {
          mockInput[key] = 'Sample Value';
        }
      }
    }

    return mockInput;
  };

  const handleGenerateAll = () => {
    const generatedData: Record<string, string> = { ...testData };

    for (const key of inputKeys) {
      // Only generate for empty fields
      if (!testData[key] || testData[key] === '') {
        const variable = variables.find((v) => v.key === key);
        const variableType = variable?.type || 'unknown';
        const mockValue = generateMockValue(variableType);
        // Convert to string (JSON.stringify for objects/arrays, toString for primitives)
        generatedData[key] = typeof mockValue === 'object'
          ? JSON.stringify(mockValue)
          : String(mockValue);
      }
    }

    setTestData(generatedData);
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
      const mockInput = generateMockInput();

      const result = fn(mockInput);

      toast({
        title: "Test Run Complete ✓",
        description: (
          <div className="space-y-2">
            <div>
              <strong>Input:</strong>
              <pre className="text-xs mt-1 p-2 bg-background rounded overflow-auto max-h-32">
                {JSON.stringify(mockInput, null, 2)}
              </pre>
            </div>
            <div>
              <strong>Output:</strong>
              <pre className="text-xs mt-1 p-2 bg-background rounded overflow-auto max-h-32">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        ) as any,
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
            {/* Block Name/Title */}
            <div className="space-y-2">
              <Label htmlFor="blockName" className="text-sm">
                Block Title (optional)
              </Label>
              <Input
                id="blockName"
                value={blockName}
                onChange={(e) => setBlockName(e.target.value)}
                placeholder="e.g., Calculate Total, Format Name, Validate Input"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Give this block a descriptive title to identify its purpose
              </p>
            </div>

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
                    {getVariableDisplayName(key)}
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

            {/* Test Data Configuration */}
            {inputKeys.length > 0 && (
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
                      const displayName = variable?.alias || key;
                      const variableType = variable?.type || 'unknown';

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
                            value={testData[key] || ''}
                            onChange={(e) => setTestData({ ...testData, [key]: e.target.value })}
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
                        onClick={() => setTestData({})}
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
            )}

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
                <li>Tests use realistic mock data based on variable types</li>
                <li>Use <code className="bg-background px-1 py-0.5 rounded">helpers</code> object for 40+ utility functions</li>
              </ul>
            </div>

            {/* Helper Library Documentation */}
            <HelperLibraryDocs />
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
