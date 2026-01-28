import { AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { ApiStep } from "@/lib/vault-api";
import { useUpdateStep } from "@/lib/vault-hooks";


import { AliasField } from "./common/AliasField";
import { DefaultValueField } from "./common/DefaultValueField";
import { TextField, NumberField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";

import type { TextAdvancedConfig } from "@/../../shared/types/stepConfigs";

// Local Props
interface TextCardEditorProps {
  stepId: string;
  sectionId: string;
  workflowId: string;
  step: ApiStep;
}

interface TextCardState {
  variant: "short" | "long";
  minLength?: number;
  maxLength?: number;
  pattern: string;
  patternMessage: string;
}

const InputTypeSection = ({
  variant,
  isEasyMode,
  onVariantChange
}: {
  variant: "short" | "long";
  isEasyMode: boolean;
  onVariantChange: (v: "short" | "long") => void;
}) => (
  <div className="space-y-3">
    <SectionHeader
      title="Input Type"
      description={isEasyMode ? "Fixed in easy mode" : "Choose input style"}
    />
    <RadioGroup
      value={variant}
      onValueChange={(v) => onVariantChange(v as "short" | "long")}
      disabled={isEasyMode}
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="short" id="variant-short" disabled={isEasyMode} />
        <Label
          htmlFor="variant-short"
          className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
        >
          Short Text (Single line)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="long" id="variant-long" disabled={isEasyMode} />
        <Label
          htmlFor="variant-long"
          className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
        >
          Long Text (Multi-line)
        </Label>
      </div>
    </RadioGroup>
  </div>
);

const TextValidationSection = ({
  localConfig,
  onUpdate,
  minMaxError,
  patternError
}: {
  localConfig: TextCardState;
  onUpdate: (updates: Partial<TextCardState>) => void;
  minMaxError: string | null;
  patternError: string | null;
}) => (
  <div className="space-y-4">
    <SectionHeader
      title="Validation Rules"
      description="Optional constraints for user input"
    />

    {/* Min Length */}
    <NumberField
      label="Minimum Length"
      value={localConfig.minLength}
      onChange={(val) => onUpdate({ minLength: val })}
      placeholder="No minimum"
      description="Minimum number of characters"
      min={0}
      error={minMaxError ?? undefined}
    />

    {/* Max Length */}
    <NumberField
      label="Maximum Length"
      value={localConfig.maxLength}
      onChange={(val) => onUpdate({ maxLength: val })}
      placeholder="No maximum"
      description="Maximum number of characters"
      min={0}
      error={minMaxError ?? undefined}
    />

    {/* Pattern (Regex) */}
    <TextField
      label="Pattern (Regex)"
      value={localConfig.pattern}
      onChange={(val) => onUpdate({ pattern: val })}
      placeholder="e.g., ^[A-Z]{3}-\\d{4}$"
      description="Regular expression for advanced validation"
      error={patternError ?? undefined}
    />

    {/* Pattern Error Message */}
    {localConfig.pattern && localConfig.pattern.trim() !== "" && !patternError && (
      <TextField
        label="Custom Error Message"
        value={localConfig.patternMessage}
        onChange={(val) => onUpdate({ patternMessage: val })}
        placeholder="e.g., Must match format ABC-1234"
        description="Message shown when pattern doesn't match"
      />
    )}
  </div>
);

export function TextCardEditor({ stepId, sectionId, workflowId, step }: TextCardEditorProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine if this is advanced mode (type === "text") or easy mode (short_text/long_text)
  const isAdvancedMode = step.type === "text";
  const isEasyMode = step.type === "short_text" || step.type === "long_text";

  // Get config with defaults using generic access for flexibility
  const config = step.config;
  const variant = isAdvancedMode
    ? (config?.variant ?? "short")
    : step.type === "long_text"
      ? "long"
      : "short";

  const [localConfig, setLocalConfig] = useState<TextCardState>({
    variant: variant,
    minLength: config?.validation?.minLength,
    maxLength: config?.validation?.maxLength,
    pattern: config?.validation?.pattern ?? "",
    patternMessage: config?.validation?.patternMessage ?? "",
  });

  const [patternError, setPatternError] = useState<string | null>(null);

  useEffect(() => {
    // Re-sync local config when step props change
    const currentConfig = step.config;
    const currentAdvanced = step.type === "text";

    // Determine variant from current state
    const newVariant = currentAdvanced
      ? (currentConfig?.variant ?? "short")
      : step.type === "long_text"
        ? "long"
        : "short";

    setLocalConfig({
      variant: newVariant,
      minLength: currentConfig?.validation?.minLength,
      maxLength: currentConfig?.validation?.maxLength,
      pattern: currentConfig?.validation?.pattern ?? "",
      patternMessage: currentConfig?.validation?.patternMessage ?? "",
    });
  }, [step.config, step.type]);

  const validatePattern = (pattern: string): string | null => {
    if (!pattern.trim()) { return null; }

    try {
      // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(pattern);
      return null;
    } catch (error) {
      return "Invalid regular expression";
    }
  };

  const validateMinMax = (): string | null => {
    if (
      localConfig.minLength !== undefined &&
      localConfig.maxLength !== undefined &&
      localConfig.minLength > localConfig.maxLength
    ) {
      return "Min length cannot be greater than max length";
    }
    return null;
  };

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    // Validate pattern if it changed or exists in update
    // Note: We validate against `newConfig` pattern if updates contains it, or re-validate if needed
    // Actually, only validate if pattern is being updated
    if (updates.pattern !== undefined) {
      const error = validatePattern(updates.pattern);
      setPatternError(error);
      if (error) { return; } // Don't save if invalid
    }

    // Validate min/max
    const minMaxError = validateMinMax();
    // Logic: if min/max changed and invalid
    if (minMaxError && (updates.minLength !== undefined || updates.maxLength !== undefined)) {
      toast({
        title: "Validation Error",
        description: minMaxError,
        variant: "destructive",
      });
      return;
    }

    // Build the config object for advanced mode
    const configToSave: TextAdvancedConfig = {
      variant: newConfig.variant,
    };

    // Only include validation if there are validation rules
    const hasValidation =
      newConfig.minLength !== undefined ||
      newConfig.maxLength !== undefined ||
      (newConfig.pattern && newConfig.pattern.trim() !== "");

    if (hasValidation) {
      configToSave.validation = {};

      if (newConfig.minLength !== undefined) {
        configToSave.validation.minLength = newConfig.minLength;
      }
      if (newConfig.maxLength !== undefined) {
        configToSave.validation.maxLength = newConfig.maxLength;
      }
      if (newConfig.pattern && newConfig.pattern.trim() !== "") {
        configToSave.validation.pattern = newConfig.pattern;
        if (newConfig.patternMessage && newConfig.patternMessage.trim() !== "") {
          configToSave.validation.patternMessage = newConfig.patternMessage;
        }
      }
    }

    // If variant changed in advanced mode, also update the config
    if (isAdvancedMode) {
      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // In easy mode, type change handled separately, but validation still saves to config?
      // Yes, short_text/long_text steps use validation config too.
      // But updateStepMutation expects config to match type...
      // `short_text` uses `TextConfig`?
      // Assuming backend handles it or config structure is compatible.
      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    }
  };

  const handleVariantChange = (newVariant: "short" | "long") => {
    if (isEasyMode) {
      // In easy mode, changing variant means changing the step type
      const newType = newVariant === "short" ? "short_text" : "long_text";
      updateStepMutation.mutate({ id: stepId, sectionId, type: newType });
    } else {
      // In advanced mode, just update the config
      handleUpdate({ variant: newVariant });
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
      <AliasField value={step.alias} onChange={handleAliasChange} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Variant Selection */}
      <InputTypeSection
        variant={localConfig.variant}
        isEasyMode={isEasyMode}
        onVariantChange={handleVariantChange}
      />

      <Separator />

      {/* Validation Rules */}
      <TextValidationSection
        localConfig={localConfig}
        onUpdate={handleUpdate}
        minMaxError={validateMinMax()}
        patternError={patternError}
      />

      {patternError && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Pattern Error</p>
            <p>{patternError}</p>
          </div>
        </div>
      )}

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
