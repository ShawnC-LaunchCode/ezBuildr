import React, { useState, useEffect } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { ApiStep } from "@/lib/vault-api";
import { useUpdateStep } from "@/lib/vault-hooks";


import { AliasField } from "./common/AliasField";
import { DefaultValueField } from "./common/DefaultValueField";
import { NumberField, SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";

import type { NumberConfig, CurrencyConfig, NumberAdvancedConfig } from "@/../../shared/types/stepConfigs";

interface NumberCardEditorProps {
  stepId: string;
  sectionId: string;
  workflowId: string;
  step: ApiStep;
}

interface NumberCardState {
  mode: "number" | "currency_whole" | "currency_decimal";
  min?: number;
  max?: number;
  step: number;
  allowDecimal: boolean;
  formatOnInput: boolean;
}

const NumberModeSection = ({
  mode,
  isAdvancedMode,
  isCurrency,
  onModeChange
}: {
  mode: string;
  isAdvancedMode: boolean;
  isCurrency: boolean;
  onModeChange: (val: "number" | "currency_whole" | "currency_decimal") => void;
}) => (
  <div className="space-y-3">
    <SectionHeader
      title="Number Type"
      description={isAdvancedMode ? "Choose number format" : isCurrency ? "Fixed as currency" : "Fixed as number"}
    />

    <div className="space-y-2">
      <Label className="text-sm font-medium">Display Mode</Label>
      <Select
        value={mode}
        onValueChange={(val) => onModeChange(val as "number" | "currency_whole" | "currency_decimal")}
        disabled={!isAdvancedMode}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="number">Number</SelectItem>
          <SelectItem value="currency_whole">Currency (no decimals)</SelectItem>
          <SelectItem value="currency_decimal">Currency (with decimals)</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {!isAdvancedMode && (
      <p className="text-xs text-muted-foreground">
        Mode is fixed in {isCurrency ? "currency" : "easy"} mode
      </p>
    )}
  </div>
);

const NumberValidationSection = ({
  localConfig,
  onUpdate,
  minMaxError
}: {
  localConfig: NumberCardState;
  onUpdate: (updates: Partial<NumberCardState>) => void;
  minMaxError: string | null;
}) => (
  <div className="space-y-4">
    <SectionHeader
      title="Validation Rules"
      description="Set numeric constraints"
    />

    {/* Min */}
    <NumberField
      label="Minimum Value"
      value={localConfig.min}
      onChange={(val) => onUpdate({ min: val })}
      placeholder="No minimum"
      description="Smallest allowed value"
      error={minMaxError ?? undefined}
      step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
    />

    {/* Max */}
    <NumberField
      label="Maximum Value"
      value={localConfig.max}
      onChange={(val) => onUpdate({ max: val })}
      placeholder="No maximum"
      description="Largest allowed value"
      error={minMaxError ?? undefined}
      step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
    />

    {/* Step - only for non-currency modes */}
    {localConfig.mode === "number" && (
      <NumberField
        label="Step"
        value={localConfig.step}
        onChange={(val) => onUpdate({ step: val ?? 1 })}
        placeholder="1"
        description="Increment/decrement step size"
        min={0.01}
      />
    )}
  </div>
);

const NumberPreviewSection = ({ mode }: { mode: string }) => (
  <div className="bg-muted border rounded-lg p-3">
    <p className="text-xs font-medium mb-1">Format Preview</p>
    {mode === "number" ? (
      <p className="text-sm font-mono">12345</p>
    ) : mode === "currency_whole" ? (
      <p className="text-sm font-mono">$12,345</p>
    ) : (
      <p className="text-sm font-mono">$12,345.67</p>
    )}
  </div>
);

export function NumberCardEditor({ stepId, sectionId, workflowId, step }: NumberCardEditorProps) {
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
    // Avoid exhaustive deps on 'configAny' derived value
    const currentConfig = step.config;

    // Recalculate based on current step
    const currentAdvanced = step.type === "number" && currentConfig?.mode !== undefined;
    const currentCurrency = step.type === "currency";

    let nextMode: "number" | "currency_whole" | "currency_decimal" = "number";
    if (currentAdvanced) {
      nextMode = currentConfig.mode;
    } else if (currentCurrency) {
      nextMode = currentConfig.allowDecimal === false ? "currency_whole" : "currency_decimal";
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

  const validateMinMax = (): string | null => {
    if (
      localConfig.min !== undefined &&
      localConfig.max !== undefined &&
      localConfig.min > localConfig.max
    ) {
      return "Min cannot be greater than max";
    }
    return null;
  };

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    // Validate min/max
    const minMaxError = validateMinMax(); // Logic correct? Checks updated state? No
    // validateMinMax uses `localConfig`. Need to use `newConfig`.
    // Inline check:
    if (newConfig.min !== undefined && newConfig.max !== undefined && newConfig.min > newConfig.max) {
      if (updates.min !== undefined || updates.max !== undefined) {
        toast({
          title: "Validation Error",
          description: "Min cannot be greater than max",
          variant: "destructive",
        });
        return;
      }
    }

    // Build config based on mode and type
    if (isAdvancedMode) {
      // Advanced mode - use NumberAdvancedConfig
      const configToSave: NumberAdvancedConfig = {
        mode: newConfig.mode,
        formatOnInput: newConfig.formatOnInput,
        validation: {}
      };

      if (newConfig.min !== undefined) {configToSave.validation!.min = newConfig.min;}
      if (newConfig.max !== undefined) {configToSave.validation!.max = newConfig.max;}
      if (newConfig.step !== undefined) {configToSave.validation!.step = newConfig.step;}

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

      if (newConfig.min !== undefined) {configToSave.min = newConfig.min;}
      if (newConfig.max !== undefined) {configToSave.max = newConfig.max;}

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // Number type in easy mode
      const configToSave: NumberConfig = {
        step: newConfig.step,
        allowDecimal: newConfig.allowDecimal,
      };

      if (newConfig.min !== undefined) {configToSave.min = newConfig.min;}
      if (newConfig.max !== undefined) {configToSave.max = newConfig.max;}

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
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} />

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
        minMaxError={validateMinMax()}
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
            defaultValue={step.defaultValue}
            type={step.type}
            mode={isEasyMode ? 'easy' : 'advanced'}
          />
          <VisibilityField
            stepId={stepId}
            sectionId={sectionId}
            workflowId={workflowId}
            visibleIf={step.visibleIf}
            mode={isAdvancedMode ? 'advanced' : 'easy'}
          />
        </>
      )}
    </div>
  );
}
