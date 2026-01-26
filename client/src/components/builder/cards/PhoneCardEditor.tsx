/**
 * Phone Block Card Editor
 * Editor for phone number blocks
 */

import React, { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";

import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";


import type { PhoneConfig } from "@/../../shared/types/stepConfigs";
import { StepEditorCommonProps } from "../StepEditorRouter";

export function PhoneCardEditor({ stepId, sectionId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();

  const config = step.config as PhoneConfig | undefined;

  const [localConfig, setLocalConfig] = useState({
    format: (config?.format || "US"),
    validateFormat: true, // Always validate in easy mode
    showFormattingMask: true, // Show formatting by default
  });

  useEffect(() => {
    setLocalConfig({
      format: (config?.format || "US"),
      validateFormat: true,
      showFormattingMask: true,
    });
  }, [step.config, config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: PhoneConfig = {
      format: newConfig.format,
    };

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };

  const handleLabelChange = (title: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, title });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, sectionId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, sectionId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Phone Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="Phone Validation"
          description="US phone number validation is always enabled"
        />

        {/* Validation Info */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <strong>US Phone Format:</strong> (XXX) XXX-XXXX or XXX-XXX-XXXX
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            Input will be validated and formatted automatically
          </p>
        </div>

        {/* Show Formatting Mask Toggle */}
        <SwitchField
          label="Show Formatting Mask"
          checked={localConfig.showFormattingMask}
          onChange={(val) => handleUpdate({ showFormattingMask: val })}
          description="Display (___) ___-____ placeholder while typing"
        />
      </div>

      {/* Format Preview */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        <p className="text-sm font-mono">(555) 123-4567</p>
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
