import { RotateCcw, AlignLeft } from "lucide-react";
import { useState, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SampleDataEditorProps {
  value: string;
  onChange: (value: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  onValidChange?: (parsed: unknown | null) => void;
}

export function SampleDataEditor({ value, onChange, onValidChange }: SampleDataEditorProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Validate JSON on every change
  const handleChange = useCallback((newValue: string) => {
    onChange(newValue);

    // Try to parse JSON
    try {
      if (newValue.trim() === "") {
        setJsonError(null);
        onValidChange?.(null);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(newValue);
      setJsonError(null);
      onValidChange?.(parsed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid JSON";
      setJsonError(errorMessage);
      onValidChange?.(null);
    }
  }, [onChange, onValidChange]);

  // Reset to empty object
  const handleReset = () => {
    handleChange("{}");
  };

  // Format/prettify JSON
  const handleFormat = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      handleChange(formatted);
    } catch (error) {
      // If JSON is invalid, can't format
      console.warn("Cannot format invalid JSON");
    }
  };

  const isValidJson = !jsonError && value.trim() !== "";

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="border-b px-4 py-2 flex items-center justify-between bg-muted/50">
        <div className="flex items-center gap-2">
          <label htmlFor="sample-data-editor" className="text-sm font-medium text-muted-foreground cursor-pointer">Sample Data</label>
          {value.trim() && (
            <Badge
              variant={isValidJson ? "default" : "destructive"}
              className={cn(
                "text-xs",
                isValidJson && "bg-green-100 text-green-700 hover:bg-green-100"
              )}
            >
              {isValidJson ? "Valid JSON" : "Invalid JSON"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={!isValidJson}
            title="Format JSON"
          >
            <AlignLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            Format
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title="Reset to empty object"
          >
            <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      {/* JSON Editor (textarea) */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          id="sample-data-editor"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className={cn(
            "w-full h-full font-mono text-sm resize-none bg-transparent",
            "border border-border rounded-md p-3",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            jsonError && "border-destructive focus:ring-destructive"
          )}
          placeholder='{\n  "name": "John Doe",\n  "email": "john@example.com"\n}'
          spellCheck={false}
          aria-label="Sample Data JSON Editor"
        />
      </div>

      {/* Validation Error */}
      {jsonError && (
        <div className="border-t px-4 py-2 bg-destructive/10">
          <p className="text-sm text-destructive font-medium" role="alert">
            JSON Error: {jsonError}
          </p>
        </div>
      )}
    </Card>
  );
}
