/**
 * Website Block Card Editor
 * Editor for website/URL blocks
 */

import React, { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { LabelField } from "./common/LabelField";
import { RequiredToggle } from "./common/RequiredToggle";


import type { WebsiteConfig } from "@/../../shared/types/stepConfigs";

interface WebsiteCardEditorProps {
  stepId: string;
  sectionId: string;
  step: {
    id: string;
    type: string;
    title: string;
    alias: string | null;
    required: boolean;
    config: any;
  };
}

export function WebsiteCardEditor({ stepId, sectionId, step }: WebsiteCardEditorProps) {
  const updateStepMutation = useUpdateStep();

  const config = step.config as WebsiteConfig | undefined;

  const [localConfig, setLocalConfig] = useState({
    requireProtocol: config?.requireProtocol || false,
    validate: true, // Always validate in easy mode
  });

  useEffect(() => {
    setLocalConfig({
      requireProtocol: config?.requireProtocol || false,
      validate: true,
    });
  }, [step.config, config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: WebsiteConfig = {
      requireProtocol: newConfig.requireProtocol,
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
      {/* Label */}
      <LabelField value={step.title} onChange={handleLabelChange} />

      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Website Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="URL Validation"
          description="URL format validation is always enabled"
        />

        {/* Validation Info */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <strong>URL Format:</strong> Valid web address
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            Input will be validated for proper URL format
          </p>
        </div>

        {/* Require Protocol Toggle */}
        <SwitchField
          label="Require Protocol"
          checked={localConfig.requireProtocol}
          onChange={(val) => handleUpdate({ requireProtocol: val })}
          description="Require http:// or https:// at the beginning"
        />
      </div>

      {/* Format Preview */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {localConfig.requireProtocol ? (
          <div className="space-y-1">
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ https://example.com
            </p>
            <p className="text-sm font-mono text-red-600 dark:text-red-400">
              ✗ example.com
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ https://example.com
            </p>
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ example.com
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
