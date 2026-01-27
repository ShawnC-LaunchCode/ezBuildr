/**
 * Email Block Card Editor
 * Editor for email blocks
 */

import React, { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import { StepEditorCommonProps } from "../StepEditorRouter";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";


import type { EmailConfig } from "@/../../shared/types/stepConfigs";

export function EmailCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();

  const config = step.config as EmailConfig | undefined;

  const [localConfig, setLocalConfig] = useState({
    allowMultiple: config?.allowMultiple || false,
    validate: true, // Always validate in easy mode
  });

  useEffect(() => {
    setLocalConfig({
      allowMultiple: config?.allowMultiple || false,
      validate: true,
    });
  }, [step.config, config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: EmailConfig = {
      allowMultiple: newConfig.allowMultiple,
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

      {/* Email Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="Email Validation"
          description="Email format validation is always enabled"
        />

        {/* Validation Info */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <strong>Email Format:</strong> user@domain.com
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            Input will be validated for proper email format
          </p>
        </div>

        {/* Allow Multiple Toggle */}
        <SwitchField
          label="Allow Multiple Emails"
          checked={localConfig.allowMultiple}
          onChange={(val) => handleUpdate({ allowMultiple: val })}
          description="Allow users to enter multiple comma-separated emails"
        />
      </div>

      {/* Format Preview */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {localConfig.allowMultiple ? (
          <p className="text-sm font-mono">user1@example.com, user2@example.com</p>
        ) : (
          <p className="text-sm font-mono">user@example.com</p>
        )}
      </div>


      {
        workflowId && (
          <VisibilityField
            stepId={stepId}
            sectionId={sectionId}
            workflowId={workflowId}
            visibleIf={step.visibleIf}
            mode="advanced"
          />
        )
      }
    </div>
  );
}
