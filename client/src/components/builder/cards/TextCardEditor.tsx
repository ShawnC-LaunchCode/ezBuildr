/**
 * Text Block Card Editor
 * Editor for text blocks (short_text, long_text, text)
 */

import { AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep } from "@/lib/vault-hooks";

import { AliasField } from "./common/AliasField";
import { TextField, NumberField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { DefaultValueField } from "./common/DefaultValueField";
import { VisibilityField } from "./common/VisibilityField";


import type { TextAdvancedConfig } from "@/../../shared/types/stepConfigs";
import { StepEditorCommonProps } from "../StepEditorRouter";

export function TextCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine if this is advanced mode (type === "text") or easy mode (short_text/long_text)
  const isAdvancedMode = step.type === "text";
  const isEasyMode = step.type === "short_text" || step.type === "long_text";

  // Get config with defaults
  const config = step.config as TextAdvancedConfig | undefined;
  const variant = isAdvancedMode
    ? (config?.variant || "short")
    : step.type === "long_text"
      ? "long"
      : "short";

  const [localConfig, setLocalConfig] = useState({
    variant: variant,
    minLength: config?.validation?.minLength,
    maxLength: config?.validation?.maxLength,
    pattern: config?.validation?.pattern || "",
    patternMessage: config?.validation?.patternMessage || "",
  });

  const [patternError, setPatternError] = useState<string | null>(null);

  useEffect(() => {
    const newVariant = isAdvancedMode
      ? (config?.variant || "short")
      : step.type === "long_text"
        ? "long"
        : "short";

    setLocalConfig({
      variant: newVariant,
      minLength: config?.validation?.minLength,
      maxLength: config?.validation?.maxLength,
      pattern: config?.validation?.pattern || "",
      patternMessage: config?.validation?.patternMessage || "",
    });
  }, [step.config, step.type, isAdvancedMode, config]);

  const validatePattern = (pattern: string): string | null => {
    if (!pattern.trim()) { return null; }

    try {
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

    // Validate pattern if it changed
    if (updates.pattern !== undefined) {
      const error = validatePattern(updates.pattern);
      setPatternError(error);
      if (error) { return; } // Don't save if invalid
    }

    // Validate min/max
    const minMaxError = validateMinMax();
    if (minMaxError) {
      toast({
        title: "Validation Error",
        description: minMaxError,
        variant: "destructive",
      });
      return;
    }

    // Build the config object
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
      // In easy mode, we might need to convert the type
      // For now, just update the config
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
      <div className="space-y-3">
        <SectionHeader
          title="Input Type"
          description={isEasyMode ? "Fixed in easy mode" : "Choose input style"}
        />
        <RadioGroup
          value={localConfig.variant}
          onValueChange={(v) => handleVariantChange(v as "short" | "long")}
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

      <Separator />

      {/* Validation Rules */}
      <div className="space-y-4">
        <SectionHeader
          title="Validation Rules"
          description="Optional constraints for user input"
        />

        {/* Min Length */}
        <NumberField
          label="Minimum Length"
          value={localConfig.minLength}
          onChange={(val) => handleUpdate({ minLength: val })}
          placeholder="No minimum"
          description="Minimum number of characters"
          min={0}
          error={validateMinMax() || undefined}
        />

        {/* Max Length */}
        <NumberField
          label="Maximum Length"
          value={localConfig.maxLength}
          onChange={(val) => handleUpdate({ maxLength: val })}
          placeholder="No maximum"
          description="Maximum number of characters"
          min={0}
          error={validateMinMax() || undefined}
        />

        {/* Pattern (Regex) */}
        <TextField
          label="Pattern (Regex)"
          value={localConfig.pattern}
          onChange={(val) => handleUpdate({ pattern: val })}
          placeholder="e.g., ^[A-Z]{3}-\\d{4}$"
          description="Regular expression for advanced validation"
          error={patternError || undefined}
        />

        {/* Pattern Error Message */}
        {localConfig.pattern && localConfig.pattern.trim() !== "" && !patternError && (
          <TextField
            label="Custom Error Message"
            value={localConfig.patternMessage}
            onChange={(val) => handleUpdate({ patternMessage: val })}
            placeholder="e.g., Must match format ABC-1234"
            description="Message shown when pattern doesn't match"
          />
        )}
      </div>

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
