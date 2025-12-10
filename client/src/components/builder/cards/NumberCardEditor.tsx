/**
 * Number/Currency Block Card Editor
 * Unified editor for number and currency blocks
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabelField } from "./common/LabelField";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { NumberField, SwitchField, SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import type { NumberConfig, CurrencyConfig, NumberAdvancedConfig } from "@/../../shared/types/stepConfigs";

interface NumberCardEditorProps {
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

export function NumberCardEditor({ stepId, sectionId, step }: NumberCardEditorProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine mode and type
  const isAdvancedMode = step.type === "number" && (step.config as NumberAdvancedConfig)?.mode !== undefined;
  const isCurrency = step.type === "currency";

  // Get config
  const config = step.config as NumberConfig | CurrencyConfig | NumberAdvancedConfig | undefined;

  // Determine initial mode
  const getInitialMode = (): "number" | "currency_whole" | "currency_decimal" => {
    if (isAdvancedMode) {
      return (config as NumberAdvancedConfig).mode;
    } else if (isCurrency) {
      const currencyConfig = config as CurrencyConfig;
      return currencyConfig?.allowDecimal === false ? "currency_whole" : "currency_decimal";
    } else {
      // Regular number type
      return "number";
    }
  };

  const [localConfig, setLocalConfig] = useState({
    mode: getInitialMode(),
    min: config?.min,
    max: config?.max,
    step: (config as NumberConfig)?.step || 1,
    allowDecimal: (config as NumberConfig | CurrencyConfig)?.allowDecimal ?? false,
    formatOnInput: (config as NumberAdvancedConfig)?.formatOnInput ?? false,
  });

  useEffect(() => {
    setLocalConfig({
      mode: getInitialMode(),
      min: config?.min,
      max: config?.max,
      step: (config as NumberConfig)?.step || 1,
      allowDecimal: (config as NumberConfig | CurrencyConfig)?.allowDecimal ?? false,
      formatOnInput: (config as NumberAdvancedConfig)?.formatOnInput ?? false,
    });
  }, [step.config, step.type, isAdvancedMode, isCurrency, config]);

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
    const minMaxError = validateMinMax();
    if (minMaxError && (updates.min !== undefined || updates.max !== undefined)) {
      toast({
        title: "Validation Error",
        description: minMaxError,
        variant: "destructive",
      });
      return;
    }

    // Build config based on mode and type
    if (isAdvancedMode) {
      // Advanced mode - use NumberAdvancedConfig
      const configToSave: NumberAdvancedConfig = {
        mode: newConfig.mode,
        formatOnInput: newConfig.formatOnInput,
      };

      if (newConfig.min !== undefined) {
        configToSave.validation = configToSave.validation || {};
        configToSave.validation.min = newConfig.min;
      }
      if (newConfig.max !== undefined) {
        configToSave.validation = configToSave.validation || {};
        configToSave.validation.max = newConfig.max;
      }
      if (newConfig.step !== undefined) {
        configToSave.validation = configToSave.validation || {};
        configToSave.validation.step = newConfig.step;
      }

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

      if (newConfig.min !== undefined) {
        configToSave.min = newConfig.min;
      }
      if (newConfig.max !== undefined) {
        configToSave.max = newConfig.max;
      }

      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // Number type in easy mode
      const configToSave: NumberConfig = {
        step: newConfig.step,
        allowDecimal: newConfig.allowDecimal,
      };

      if (newConfig.min !== undefined) {
        configToSave.min = newConfig.min;
      }
      if (newConfig.max !== undefined) {
        configToSave.max = newConfig.max;
      }

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

      {/* Number Type Selection */}
      <div className="space-y-3">
        <SectionHeader
          title="Number Type"
          description={isAdvancedMode ? "Choose number format" : isCurrency ? "Fixed as currency" : "Fixed as number"}
        />

        <div className="space-y-2">
          <Label className="text-sm font-medium">Display Mode</Label>
          <Select
            value={localConfig.mode}
            onValueChange={(val) => handleUpdate({ mode: val as any })}
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

      <Separator />

      {/* Validation Rules */}
      <div className="space-y-4">
        <SectionHeader
          title="Validation Rules"
          description="Set numeric constraints"
        />

        {/* Min */}
        <NumberField
          label="Minimum Value"
          value={localConfig.min}
          onChange={(val) => handleUpdate({ min: val })}
          placeholder="No minimum"
          description="Smallest allowed value"
          error={validateMinMax() || undefined}
          step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
        />

        {/* Max */}
        <NumberField
          label="Maximum Value"
          value={localConfig.max}
          onChange={(val) => handleUpdate({ max: val })}
          placeholder="No maximum"
          description="Largest allowed value"
          error={validateMinMax() || undefined}
          step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
        />

        {/* Step - only for non-currency modes */}
        {localConfig.mode === "number" && (
          <NumberField
            label="Step"
            value={localConfig.step}
            onChange={(val) => handleUpdate({ step: val || 1 })}
            placeholder="1"
            description="Increment/decrement step size"
            min={0.01}
          />
        )}
      </div>

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
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {localConfig.mode === "number" ? (
          <p className="text-sm font-mono">12345</p>
        ) : localConfig.mode === "currency_whole" ? (
          <p className="text-sm font-mono">$12,345</p>
        ) : (
          <p className="text-sm font-mono">$12,345.67</p>
        )}
      </div>
    </div>
  );
}
