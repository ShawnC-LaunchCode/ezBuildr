/**
 * Address Block Card Editor
 * Editor for address blocks (USA)
 *
 * Config shape:
 * {
 *   country: "US",
 *   fields: ["street", "city", "state", "zip"],
 *   requireAll?: boolean
 * }
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { LabelField } from "./common/LabelField";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import type { AddressConfig } from "@/../../shared/types/stepConfigs";

interface AddressCardEditorProps {
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

export function AddressCardEditor({ stepId, sectionId, step }: AddressCardEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config
  const config = step.config as AddressConfig | undefined;
  const [localConfig, setLocalConfig] = useState({
    country: (config?.country || "US"),
    fields: (config?.fields || ["street", "city", "state", "zip"]),
    requireAll: config?.requireAll !== undefined ? config.requireAll : true,
  });

  useEffect(() => {
    const config = step.config as AddressConfig | undefined;
    setLocalConfig({
      country: (config?.country || "US"),
      fields: (config?.fields || ["street", "city", "state", "zip"]),
      requireAll: config?.requireAll !== undefined ? config.requireAll : true,
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: AddressConfig = {
      country: newConfig.country,
      fields: newConfig.fields,
      requireAll: newConfig.requireAll,
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

      {/* Address Fields Preview */}
      <div className="space-y-3">
        <SectionHeader
          title="Address Fields"
          description="USA address format (street, city, state, zip)"
        />

        <div className="p-3 bg-background border rounded-md space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono">street</span>
            <span className="text-xs">→</span>
            <span>Street address</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono">city</span>
            <span className="text-xs">→</span>
            <span>City</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono">state</span>
            <span className="text-xs">→</span>
            <span>State (dropdown)</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono">zip</span>
            <span className="text-xs">→</span>
            <span>ZIP code (5 or 9 digits)</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Configuration Options */}
      <div className="space-y-3">
        <SectionHeader
          title="Validation"
          description="Configure validation rules"
        />

        <SwitchField
          label="Require All Fields"
          description="All address fields must be filled"
          checked={localConfig.requireAll}
          onChange={(checked) => handleUpdate({ requireAll: checked })}
        />
      </div>

      {/* How it works */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Street: Text input</li>
          <li>City: Text input</li>
          <li>State: Dropdown of US states</li>
          <li>ZIP: Validated for 5 or 9 digits</li>
          <li>Stored as: <code className="font-mono">{`{street, city, state, zip}`}</code></li>
        </ul>
      </div>
    </div>
  );
}
