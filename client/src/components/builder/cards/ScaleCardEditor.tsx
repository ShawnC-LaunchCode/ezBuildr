/**
 * Scale Block Card Editor
 * Editor for scale/rating blocks (slider, stars)
 *
 * Config shape:
 * {
 *   min: number,
 *   max: number,
 *   step: number,
 *   display: "slider" | "stars",
 *   stars?: number,
 *   showValue?: boolean,
 *   minLabel?: string,
 *   maxLabel?: string
 * }
 */

import { AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep } from "@/lib/vault-hooks";

import { StepEditorCommonProps } from "../StepEditorRouter";

import { AliasField } from "./common/AliasField";
import { TextField, NumberField, SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";


import type { ScaleConfig, ScaleAdvancedConfig } from "@/../../shared/types/stepConfigs";

interface ScaleCardState {
  min: number;
  max: number;
  step: number;
  display: "slider" | "stars";
  stars?: number;
  showValue: boolean;
  minLabel: string;
  maxLabel: string;
}

export function ScaleCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Parse config (works for both easy and advanced mode)
  const config = step.config as (ScaleConfig | ScaleAdvancedConfig) | undefined;
  const [localConfig, setLocalConfig] = useState<ScaleCardState>({
    min: config?.min || 1,
    max: config?.max || 10,
    step: config?.step || 1,
    display: (config?.display || "slider") as "slider" | "stars",
    stars: (config as ScaleAdvancedConfig)?.stars,
    showValue: config?.showValue !== undefined ? config.showValue : true,
    minLabel: config?.minLabel || "",
    maxLabel: config?.maxLabel || "",
  });

  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const config = step.config as (ScaleConfig | ScaleAdvancedConfig) | undefined;
    setLocalConfig({
      min: config?.min || 1,
      max: config?.max || 10,
      step: config?.step || 1,
      display: (config?.display || "slider") as "slider" | "stars",
      stars: (config as ScaleAdvancedConfig)?.stars,
      showValue: config?.showValue !== undefined ? config.showValue : true,
      minLabel: config?.minLabel || "",
      maxLabel: config?.maxLabel || "",
    });
  }, [step.config]);

  const validateConfig = (config: typeof localConfig): string[] => {
    const errors: string[] = [];

    if (config.min >= config.max) {
      errors.push("Minimum value must be less than maximum value");
    }

    if (config.step <= 0) {
      errors.push("Step must be greater than 0");
    }

    if (config.display === "stars") {
      if (!config.stars || config.stars < 1) {
        errors.push("Number of stars must be at least 1");
      }
      if (config.stars && config.stars > 12) {
        errors.push("Number of stars should not exceed 12");
      }
    }

    return errors;
  };

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    // Validate
    const validationErrors = validateConfig(newConfig);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      return; // Don't save if invalid
    }

    // Build config
    const configToSave: ScaleConfig | ScaleAdvancedConfig = {
      min: newConfig.min,
      max: newConfig.max,
      step: newConfig.step,
      display: newConfig.display,
      showValue: newConfig.showValue,
    };

    // Add optional fields
    if (newConfig.minLabel && newConfig.minLabel.trim() !== "") {
      configToSave.minLabel = newConfig.minLabel;
    }
    if (newConfig.maxLabel && newConfig.maxLabel.trim() !== "") {
      configToSave.maxLabel = newConfig.maxLabel;
    }
    if (newConfig.display === "stars" && newConfig.stars) {
      (configToSave as ScaleAdvancedConfig).stars = newConfig.stars;
    }

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };

  const handleDisplayChange = (display: "slider" | "stars") => {
    const updates: Partial<typeof localConfig> = { display };

    // When switching to stars mode, set default values
    if (display === "stars") {
      updates.stars = localConfig.stars || 5;
      updates.min = 1;
      updates.step = 1;
      // Keep max as is or set to stars count
      if (!localConfig.max || localConfig.max > 12) {
        updates.max = updates.stars;
      }
    }

    handleUpdate(updates);
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

      {/* Display Mode */}
      <div className="space-y-3">
        <SectionHeader
          title="Display Mode"
          description="How the scale is displayed"
        />
        <RadioGroup
          value={localConfig.display}
          onValueChange={(v) => handleDisplayChange(v as "slider" | "stars")}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="slider" id="display-slider" />
            <Label htmlFor="display-slider" className="cursor-pointer">
              Slider
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="stars" id="display-stars" />
            <Label htmlFor="display-stars" className="cursor-pointer">
              Stars
            </Label>
          </div>
        </RadioGroup>
      </div>

      <Separator />

      {/* Range Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="Range"
          description="Configure the scale range"
        />

        {/* Stars Count (only in stars mode) */}
        {localConfig.display === "stars" && (
          <NumberField
            label="Number of Stars"
            value={localConfig.stars}
            onChange={(val) => {
              handleUpdate({
                stars: val,
                max: val // Auto-sync max with stars count
              });
            }}
            placeholder="5"
            description="How many stars to display"
            min={1}
            max={12}
            step={1}
            required
          />
        )}

        {/* Min/Max (only in slider mode, or show as read-only in stars mode) */}
        {localConfig.display === "slider" && (
          <>
            <NumberField
              label="Minimum Value"
              value={localConfig.min}
              onChange={(val) => handleUpdate({ min: val || 0 })}
              placeholder="1"
              description="The minimum value"
              required
            />

            <NumberField
              label="Maximum Value"
              value={localConfig.max}
              onChange={(val) => handleUpdate({ max: val || 10 })}
              placeholder="10"
              description="The maximum value"
              required
            />

            <NumberField
              label="Step"
              value={localConfig.step}
              onChange={(val) => handleUpdate({ step: val || 1 })}
              placeholder="1"
              description="The increment step"
              min={0.01}
              step={0.1}
              required
            />
          </>
        )}

        {/* Labels */}
        <TextField
          label="Minimum Label"
          value={localConfig.minLabel}
          onChange={(val) => handleUpdate({ minLabel: val })}
          placeholder="e.g., 'Not likely'"
          description="Optional label for minimum value"
        />

        <TextField
          label="Maximum Label"
          value={localConfig.maxLabel}
          onChange={(val) => handleUpdate({ maxLabel: val })}
          placeholder="e.g., 'Very likely'"
          description="Optional label for maximum value"
        />
      </div>

      <Separator />

      {/* Display Options */}
      <div className="space-y-3">
        <SectionHeader
          title="Display Options"
          description="Configure how the scale is shown"
        />

        <SwitchField
          label="Show Current Value"
          description="Display the selected value as a number"
          checked={localConfig.showValue}
          onChange={(checked) => handleUpdate({ showValue: checked })}
        />
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Validation Errors</p>
            <ul className="list-disc list-inside">
              {errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Preview Info */}
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
