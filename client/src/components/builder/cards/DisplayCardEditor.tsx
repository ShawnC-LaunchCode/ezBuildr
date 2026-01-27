/**
 * Display Block Card Editor
 * Editor for display blocks (markdown content)
 *
 * Config shape:
 * {
 *   markdown: string,
 *   allowHtml?: boolean
 * }
 *
 * Note: Display blocks do NOT have aliases (they don't output variables)
 * Note: Display blocks should NOT have "required" toggle (nothing to require)
 */

import React, { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import { StepEditorCommonProps } from "../StepEditorRouter";

import { TextAreaField, SwitchField, SectionHeader } from "./common/EditorField";
import { VisibilityField } from "./common/VisibilityField";

import type { DisplayConfig, DisplayAdvancedConfig } from "@/../../shared/types/stepConfigs";


export function DisplayCardEditor({ stepId, sectionId, step, workflowId }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config (works for both easy and advanced mode)
  const config = step.config as (DisplayConfig | DisplayAdvancedConfig) | undefined;
  const [localConfig, setLocalConfig] = useState({
    markdown: config?.markdown || "",
    allowHtml: config?.allowHtml || false,
  });

  useEffect(() => {
    const config = step.config as (DisplayConfig | DisplayAdvancedConfig) | undefined;
    setLocalConfig({
      markdown: config?.markdown || "",
      allowHtml: config?.allowHtml || false,
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: DisplayConfig = {
      markdown: newConfig.markdown,
      allowHtml: newConfig.allowHtml,
    };

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };



  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Label (optional for display blocks - used for builder clarity only) */}
      {/* Display Card Title is managed by StepCard now */}

      {/* No Alias field - display blocks don't output variables */}
      {/* No Required toggle - display blocks can't be required */}

      <Separator />

      {/* Markdown Content */}
      <div className="space-y-3">
        <SectionHeader
          title="Content"
          description="Enter markdown content to display"
        />

        <TextAreaField
          label="Markdown"
          value={localConfig.markdown}
          onChange={(val) => handleUpdate({ markdown: val })}
          placeholder="# Welcome\n\nThis is a **display block** that shows formatted content."
          description="Supports markdown formatting"
          rows={12}
          required
        />
      </div>

      <Separator />

      {/* Advanced Options */}
      <div className="space-y-3">
        <SectionHeader
          title="Advanced Options"
          description="Configure advanced display settings"
        />

        <SwitchField
          label="Allow HTML"
          description="Allow raw HTML in markdown (use with caution)"
          checked={localConfig.allowHtml}
          onChange={(checked) => handleUpdate({ allowHtml: checked })}
        />
      </div>

      {/* Markdown Help */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        <p className="font-medium mb-2">Markdown Syntax:</p>
        <div className="space-y-1 font-mono">
          <div><span className="text-foreground"># Heading 1</span></div>
          <div><span className="text-foreground">## Heading 2</span></div>
          <div><span className="text-foreground">**bold text**</span></div>
          <div><span className="text-foreground">*italic text*</span></div>
          <div><span className="text-foreground">- List item</span></div>
          <div><span className="text-foreground">[link](https://example.com)</span></div>
          <div className="mt-2 font-sans">
            Variable interpolation: <code className="font-mono">{`{{variableName}}`}</code>
          </div>
        </div>
      </div>

      {/* Preview Info */}
      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="font-medium mb-1">ℹ️ Display Block Behavior:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>No user input required</li>
          <li>Does not create a variable</li>
          <li>Use for instructions, headers, or informational content</li>
          <li>Can reference other variables using <code className="font-mono">{`{{alias}}`}</code></li>
        </ul>
      </div>

      {workflowId && (
        <VisibilityField
          stepId={stepId}
          sectionId={sectionId}
          workflowId={workflowId}
          visibleIf={step.visibleIf}
          mode="advanced"
        />
      )}
    </div>
  );
}
