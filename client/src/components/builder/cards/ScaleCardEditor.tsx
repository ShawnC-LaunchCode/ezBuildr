import { AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import type { ApiStep } from "@/lib/vault-api";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { ScaleAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import { ScaleCardState, DisplayModeSection, RangeSection } from "./ScaleCardEditor.components";


// Define props locally to avoid cycle with StepEditorRouter
interface ScaleCardEditorProps {
  stepId: string;
  sectionId: string;
  workflowId: string;
  step: ApiStep;
}

export function ScaleCardEditor({ stepId, sectionId, workflowId, step }: ScaleCardEditorProps): JSX.Element {
  const updateStepMutation = useUpdateStep();

  // Cast config safely
  const initialConfig = step.config as ScaleAdvancedConfig | undefined;

  const [localConfig, setLocalConfig] = useState<ScaleCardState>({
    min: initialConfig?.min ?? 1,
    max: initialConfig?.max ?? 10,
    step: initialConfig?.step ?? 1,
    display: (initialConfig?.display ?? "slider") as "slider" | "stars",
    stars: initialConfig?.stars,
    showValue: initialConfig?.showValue ?? true,
    minLabel: initialConfig?.minLabel ?? "",
    maxLabel: initialConfig?.maxLabel ?? "",
  });

  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const config = step.config as ScaleAdvancedConfig | undefined;
    setLocalConfig({
      min: config?.min ?? 1,
      max: config?.max ?? 10,
      step: config?.step ?? 1,
      display: (config?.display ?? "slider") as "slider" | "stars",
      stars: config?.stars,
      showValue: config?.showValue ?? true,
      minLabel: config?.minLabel ?? "",
      maxLabel: config?.maxLabel ?? "",
    });
  }, [step.config]);

  const validateConfig = (config: typeof localConfig): string[] => {
    const errs: string[] = [];

    if (config.min >= config.max) {
      errs.push("Minimum value must be less than maximum value");
    }

    if (config.step <= 0) {
      errs.push("Step must be greater than 0");
    }

    if (config.display === "stars") {
      if (config.stars === null || config.stars === undefined || config.stars < 1) {
        errs.push("Number of stars must be at least 1");
      }
      if (config.stars !== null && config.stars !== undefined && config.stars > 12) {
        errs.push("Number of stars should not exceed 12");
      }
    }

    return errs;
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
    const configToSave: ScaleAdvancedConfig = {
      min: newConfig.min,
      max: newConfig.max,
      step: newConfig.step,
      display: newConfig.display,
      showValue: newConfig.showValue,
    };

    // Add optional fields
    if (newConfig.minLabel?.trim()) {
      configToSave.minLabel = newConfig.minLabel;
    }
    if (newConfig.maxLabel?.trim()) {
      configToSave.maxLabel = newConfig.maxLabel;
    }
    if (newConfig.display === "stars" && newConfig.stars) {
      configToSave.stars = newConfig.stars;
    }

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };

  const handleDisplayChange = (display: "slider" | "stars") => {
    const updates: Partial<typeof localConfig> = { display };

    // When switching to stars mode, set default values
    if (display === "stars") {
      updates.stars = localConfig.stars ?? 5;
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
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Display Mode */}
      <DisplayModeSection display={localConfig.display} onDisplayChange={handleDisplayChange} />

      <Separator />

      {/* Range Configuration */}
      <RangeSection config={localConfig} onUpdate={handleUpdate} />

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
          visibleIf={step.visibleIf as ConditionExpression}
          mode="advanced"
        />
      )}
    </div>
  );
}
