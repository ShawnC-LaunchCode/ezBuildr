/**
 * Boolean Block Card Editor
 * Editor for boolean blocks (yes_no, true_false, boolean)
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { LabelField } from "./common/LabelField";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { TextField, SwitchField, SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import type { BooleanAdvancedConfig, TrueFalseConfig } from "@/../../shared/types/stepConfigs";

interface BooleanCardEditorProps {
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

export function BooleanCardEditor({ stepId, sectionId, step }: BooleanCardEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Determine if this is advanced mode (type === "boolean") or easy mode (yes_no/true_false)
  const isAdvancedMode = step.type === "boolean";

  // Get config with defaults
  const config = step.config as BooleanAdvancedConfig | TrueFalseConfig | undefined;

  // Default labels based on type
  const getDefaultLabels = () => {
    if (step.type === "yes_no") {
      return { trueLabel: "Yes", falseLabel: "No" };
    } else if (step.type === "true_false") {
      return { trueLabel: "True", falseLabel: "False" };
    } else {
      return { trueLabel: "Yes", falseLabel: "No" };
    }
  };

  const defaults = getDefaultLabels();

  const [localConfig, setLocalConfig] = useState({
    trueLabel: config?.trueLabel || defaults.trueLabel,
    falseLabel: config?.falseLabel || defaults.falseLabel,
    storeAsBoolean: isAdvancedMode
      ? ((config as BooleanAdvancedConfig)?.storeAsBoolean ?? true)
      : true,
    trueAlias: (config as BooleanAdvancedConfig)?.trueAlias || "",
    falseAlias: (config as BooleanAdvancedConfig)?.falseAlias || "",
  });

  useEffect(() => {
    const defaults = getDefaultLabels();
    setLocalConfig({
      trueLabel: config?.trueLabel || defaults.trueLabel,
      falseLabel: config?.falseLabel || defaults.falseLabel,
      storeAsBoolean: isAdvancedMode
        ? ((config as BooleanAdvancedConfig)?.storeAsBoolean ?? true)
        : true,
      trueAlias: (config as BooleanAdvancedConfig)?.trueAlias || "",
      falseAlias: (config as BooleanAdvancedConfig)?.falseAlias || "",
    });
  }, [step.config, step.type, isAdvancedMode, config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    // Build the config object based on mode
    if (isAdvancedMode) {
      const configToSave: BooleanAdvancedConfig = {
        trueLabel: newConfig.trueLabel,
        falseLabel: newConfig.falseLabel,
        storeAsBoolean: newConfig.storeAsBoolean,
      };

      // Only include aliases if not storing as boolean
      if (!newConfig.storeAsBoolean) {
        if (newConfig.trueAlias && newConfig.trueAlias.trim() !== "") {
          configToSave.trueAlias = newConfig.trueAlias;
        }
        if (newConfig.falseAlias && newConfig.falseAlias.trim() !== "") {
          configToSave.falseAlias = newConfig.falseAlias;
        }
      }

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // Easy mode - just save labels
      const configToSave: TrueFalseConfig = {
        trueLabel: newConfig.trueLabel,
        falseLabel: newConfig.falseLabel,
      };

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    }
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

      {/* Labels Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="Option Labels"
          description="Customize the labels for true and false values"
        />

        {/* True Label */}
        <TextField
          label="True Label"
          value={localConfig.trueLabel}
          onChange={(val) => handleUpdate({ trueLabel: val })}
          placeholder={defaults.trueLabel}
          required
        />

        {/* False Label */}
        <TextField
          label="False Label"
          value={localConfig.falseLabel}
          onChange={(val) => handleUpdate({ falseLabel: val })}
          placeholder={defaults.falseLabel}
          required
        />
      </div>

      {/* Advanced Mode Only - Storage Options */}
      {isAdvancedMode && (
        <>
          <Separator />

          <div className="space-y-4">
            <SectionHeader
              title="Storage Mode"
              description="Choose how to store the boolean value"
            />

            {/* Store as Boolean Toggle */}
            <SwitchField
              label="Store as Boolean"
              checked={localConfig.storeAsBoolean}
              onChange={(val) => handleUpdate({ storeAsBoolean: val })}
              description="Store true/false instead of custom alias values"
            />

            {/* Alias Fields - Only show if not storing as boolean */}
            {!localConfig.storeAsBoolean && (
              <div className="space-y-4 pl-4 border-l-2 border-muted">
                <p className="text-xs text-muted-foreground">
                  When not storing as boolean, you can specify custom string values for true and
                  false
                </p>

                {/* True Alias */}
                <TextField
                  label="True Value (String)"
                  value={localConfig.trueAlias}
                  onChange={(val) => handleUpdate({ trueAlias: val })}
                  placeholder="yes"
                  description="String value to store when true is selected"
                />

                {/* False Alias */}
                <TextField
                  label="False Value (String)"
                  value={localConfig.falseAlias}
                  onChange={(val) => handleUpdate({ falseAlias: val })}
                  placeholder="no"
                  description="String value to store when false is selected"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
