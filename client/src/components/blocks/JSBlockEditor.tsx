
import { Code, ChevronLeft, ChevronRight, CheckCircle2, Play } from "lucide-react";

import { HelperLibraryDocs } from "@/components/builder/HelperLibraryDocs";
import { VariablePalette } from "@/components/builder/pages/VariablePalette";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { InputVariablesPanel } from "./js-editor/InputVariablesPanel";
import { JSBlockSettings } from "./js-editor/JSBlockSettings";
import { JSCodeEditor } from "./js-editor/JSCodeEditor";
import { TestConfigPanel } from "./js-editor/TestConfigPanel";
import { JSBlock } from "./js-editor/types";
import { useJSBlockEditor } from "./js-editor/useJSBlockEditor";

export type { JSBlock, JSBlockConfig } from "./js-editor/types";

interface JSBlockEditorProps {
  block: JSBlock;
  onChange: (updated: JSBlock) => void;
  workflowId?: string;
}

export const JSBlockEditor = ({ block, onChange, workflowId }: JSBlockEditorProps) => {
  const {
    state: {
      blockName, setBlockName,
      code, setCode,
      displayMode, setDisplayMode,
      inputKeys,
      outputKey, setOutputKey,
      timeoutMs, setTimeoutMs,
      error,
      showPalette, setShowPalette,
      testData, setTestData,
      variables
    },
    actions: {
      updateBlockConfig,
      handleEditorReady,
      handleInsertVariable,
      handleAddInputKey,
      handleRemoveInputKey,
      validateCode,
      runTest
    }
  } = useJSBlockEditor({ block, onChange, workflowId });

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
                onClick={() => { setShowPalette(!showPalette); }}
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
            {/* JS Block Settings (Title, Display, Output, Timeout) */}
            <JSBlockSettings
              name={blockName}
              display={displayMode}
              outputKey={outputKey}
              timeoutMs={timeoutMs}
              onUpdate={(updates) => {
                if (updates.name !== undefined) { setBlockName(updates.name); }
                if (updates.display !== undefined) { setDisplayMode(updates.display); }
                if (updates.outputKey !== undefined) { setOutputKey(updates.outputKey); }
                if (updates.timeoutMs !== undefined) { setTimeoutMs(updates.timeoutMs); }
                updateBlockConfig(updates);
              }}
            />

            {/* Input Keys Panel */}
            <InputVariablesPanel
              inputKeys={inputKeys}
              variables={variables}
              onAddKey={handleAddInputKey}
              onRemoveKey={handleRemoveInputKey}
            />

            {/* Test Data Configuration Panel */}
            <TestConfigPanel
              inputKeys={inputKeys}
              testData={testData}
              variables={variables}
              onTestDataChange={(newData) => {
                setTestData(newData);
                updateBlockConfig({ testData: newData });
              }}
            />

            {/* JS Code Editor */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground">JavaScript Code</Label>
              <JSCodeEditor
                code={code}
                className="h-64"
                ariaLabel="JavaScript transform code"
                onReady={handleEditorReady}
                onChange={(newCode) => {
                  setCode(newCode);
                  updateBlockConfig({ code: newCode });
                }}
              />

              {error !== null && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 font-mono text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={validateCode}>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Validate Syntax
                </Button>
                <Button size="sm" variant="secondary" onClick={runTest}>
                  <Play className="mr-1 h-3 w-3" />
                  Run Test
                </Button>
              </div>

              <HelperLibraryDocs />
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
