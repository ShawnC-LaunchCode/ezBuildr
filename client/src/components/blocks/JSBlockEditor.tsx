import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Code, Play, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { VariablePalette } from "@/components/builder/pages/VariablePalette";
import { cn } from "@/lib/utils";

interface JSBlockEditorProps {
  block: any;
  onChange: (updated: any) => void;
  workflowId?: string;
}

export const JSBlockEditor: React.FC<JSBlockEditorProps> = ({ block, onChange, workflowId }) => {
  const [code, setCode] = useState(block.config?.code || "");
  const [error, setError] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    onChange({ ...block, config: { ...block.config, code } });
  }, [code]);

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
          <div className="space-y-3">
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
