/**
 * Phone Block Card Editor
 * Editor for phone number blocks
 */

import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { PhoneConfig } from "@shared/types/stepConfigs";

import type { StepEditorCommonProps } from "./common/stepEditorProps";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PhoneCardState {
  format: 'national' | 'international' | 'US';
  validateFormat: boolean;
  showFormattingMask: boolean;
  strictValidation: boolean;
}

export function PhoneCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const isEasyMode = workflowMode?.mode === 'easy';

  const config = step.config as PhoneConfig | undefined;

  const [localConfig, setLocalConfig] = useState<PhoneCardState>({
    format: config?.format ?? "US",
    validateFormat: true, // Always validate in easy mode
    showFormattingMask: true, // Show formatting by default
    strictValidation: config?.validation?.strict ?? true,
  });

  useEffect(() => {
    setLocalConfig({
      format: config?.format ?? "US",
      validateFormat: true,
      showFormattingMask: true,
      strictValidation: config?.validation?.strict ?? true,
    });
  }, [config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: PhoneConfig = {
      format: newConfig.format,
    };
    
    if (!isEasyMode) {
      configToSave.validation = { strict: newConfig.strictValidation };
    }

    updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, pageId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, pageId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Phone Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="Phone Validation"
          description={isEasyMode ? "US phone number validation is always enabled" : "Configure phone number format and validation"}
        />

        {!isEasyMode && (
          <div className="space-y-2">
            <Label className="text-xs font-medium">Format</Label>
            <Select
              value={localConfig.format}
              onValueChange={(val: 'national' | 'international' | 'US') => handleUpdate({ format: val })}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">US Format</SelectItem>
                <SelectItem value="national">National</SelectItem>
                <SelectItem value="international">International</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isEasyMode && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              <strong>US Phone Format:</strong> (XXX) XXX-XXXX or XXX-XXX-XXXX
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Input will be validated and formatted automatically
            </p>
          </div>
        )}

        {/* Show Formatting Mask Toggle */}
        <SwitchField
          label="Show Formatting Mask"
          checked={localConfig.showFormattingMask}
          onChange={(val) => handleUpdate({ showFormattingMask: val })}
          description="Display (___) ___-____ placeholder while typing"
        />

        {!isEasyMode && (
          <SwitchField
            label="Strict Validation"
            checked={localConfig.strictValidation}
            onChange={(val) => handleUpdate({ strictValidation: val })}
            description="Enforce strict validation rules"
          />
        )}
      </div>

      {/* Format Preview */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        <p className="text-sm font-mono">(555) 123-4567</p>
      </div>

      {workflowId && (
        <VisibilityField
          stepId={stepId}
          pageId={pageId}
          workflowId={workflowId}
          visibleIf={step.visibleIf as ConditionExpression}
        />
      )}
    </div>
  );
}
