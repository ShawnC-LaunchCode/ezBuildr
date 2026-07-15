/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { NumberConfig, CurrencyConfig, NumberAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { NumberCardState, NumberModeSection, NumberValidationSection, NumberPreviewSection } from "./NumberCardEditor.components";

export function NumberCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine mode and type using generic access
  const configAny = step.config;
  const isAdvancedMode = step.type === "number" && configAny?.mode !== undefined;
  const isCurrency = step.type === "currency";
  const isEasyMode = !isAdvancedMode && !isCurrency;

  // Determine initial mode
  const getInitialMode = (): "number" | "currency_whole" | "currency_decimal" => {
    if (isAdvancedMode) {
      return (configAny as NumberAdvancedConfig).mode;
    } else if (isCurrency) {
      const currencyConfig = configAny as CurrencyConfig;
      return currencyConfig?.allowDecimal === false ? "currency_whole" : "currency_decimal";
    } else {
      // Regular number type
      return "number";
    }
  };

  const [localConfig, setLocalConfig] = useState<NumberCardState>({
    mode: getInitialMode(),
    min: configAny?.min,
    max: configAny?.max,
    step: configAny?.step ?? 1,
    allowDecimal: configAny?.allowDecimal ?? false,
    formatOnInput: configAny?.formatOnInput ?? false,
  });

  useEffect(() => {
    // Re-sync local config when step props change
    const currentConfig = step.config;

    // Recalculate based on current step
    const currentAdvanced = step.type === "number" && currentConfig?.mode !== undefined;
    const currentCurrency = step.type === "currency";

    let nextMode: "number" | "currency_whole" | "currency_decimal" = "number";
    if (currentAdvanced) {
      nextMode = currentConfig.mode;
    } else if (currentCurrency) {
      nextMode = currentConfig?.allowDecimal === false ? "currency_whole" : "currency_decimal";
    }

    setLocalConfig({
      mode: nextMode,
      min: currentConfig?.min,
      max: currentConfig?.max,
      step: currentConfig?.step ?? 1,
      allowDecimal: currentConfig?.allowDecimal ?? false,
      formatOnInput: currentConfig?.formatOnInput ?? false,
    });
  }, [step.config, step.type]);

  const validateMinMax = (min: number | undefined, max: number | undefined): string | null => {
    if (
      min !== undefined &&
      max !== undefined &&
      min > max
    ) {
      return "Min cannot be greater than max";
    }
    return null;
  };

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };

    // Validate min/max with proper newConfig check
    const validationError = validateMinMax(newConfig.min, newConfig.max);
    // eslint-disable-next-line sonarjs/no-collapsible-if
    if (validationError) {
      if (updates.min !== undefined || updates.max !== undefined) {
        toast({
          title: "Validation Error",
          description: validationError,
          variant: "destructive",
        });
        return;
      }
    }

    setLocalConfig(newConfig);

    // Build config based on mode and type
    if (isAdvancedMode) {
      // Advanced mode - use NumberAdvancedConfig
      const configToSave: NumberAdvancedConfig = {
        mode: newConfig.mode,
        formatOnInput: newConfig.formatOnInput,
        validation: {}
      };

      if (newConfig.min !== undefined) { configToSave.validation!.min = newConfig.min; }
      if (newConfig.max !== undefined) { configToSave.validation!.max = newConfig.max; }
      if (newConfig.step !== undefined) { configToSave.validation!.step = newConfig.step; }

      // Add currency code if in currency mode
      if (newConfig.mode.startsWith("currency")) {
        configToSave.currency = "USD";
      }

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else if (isCurrency) {
      // Currency type in easy mode
      const configToSave: CurrencyConfig = {
        currency: "USD",
        allowDecimal: newConfig.mode === "currency_decimal",
      };

      if (newConfig.min !== undefined) { configToSave.min = newConfig.min; }
      if (newConfig.max !== undefined) { configToSave.max = newConfig.max; }

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // Number type in easy mode
      const configToSave: NumberConfig = {
        step: newConfig.step,
        allowDecimal: newConfig.allowDecimal,
      };

      if (newConfig.min !== undefined) { configToSave.min = newConfig.min; }
      if (newConfig.max !== undefined) { configToSave.max = newConfig.max; }

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    }
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

      {/* Number Type Selection */}
      <NumberModeSection
        mode={localConfig.mode}
        isAdvancedMode={isAdvancedMode}
        isCurrency={isCurrency}
        onModeChange={(m) => handleUpdate({ mode: m })}
      />

      <Separator />

      {/* Validation Rules */}
      <NumberValidationSection
        localConfig={localConfig}
        onUpdate={handleUpdate}
        minMaxError={validateMinMax(localConfig.min, localConfig.max)}
      />

      {/* Advanced Options */}
      {isAdvancedMode && (
        <>
          <Separator />
          <div className="space-y-4">
            <SectionHeader
              title="Advanced Options"
              description="Additional formatting options"
            />

            {/* Format on Input */}
            <SwitchField
              label="Format While Typing"
              checked={localConfig.formatOnInput}
              onChange={(val) => handleUpdate({ formatOnInput: val })}
              description="Apply number/currency formatting as user types"
            />
          </div>
        </>
      )}

      {/* Format Preview */}
      <NumberPreviewSection mode={localConfig.mode} />

      {workflowId && (
        <>
          <DefaultValueField
            stepId={stepId}
            sectionId={sectionId}
            workflowId={workflowId}
            defaultValue={step.defaultValue as DefaultValueType}
            type={step.type}
            mode={isEasyMode ? 'easy' : 'advanced'}
          />
          <VisibilityField
            stepId={stepId}
            sectionId={sectionId}
            workflowId={workflowId}
            visibleIf={step.visibleIf as ConditionExpression}
            mode={isAdvancedMode ? 'advanced' : 'easy'}
          />
        </>
      )}
    </div>
  );
}
