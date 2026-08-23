import { AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { TextAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { InputTypeSection, TextValidationSection, TextCardState } from "./TextCardEditor.components";

type TextEditorConfig = Partial<TextAdvancedConfig>;

export function TextCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine if this is advanced mode (type === "text") or easy mode (short_text/long_text)
  const isAdvancedMode = step.type === "text";
  const isEasyMode = step.type === "short_text" || step.type === "long_text";

  // Get config with defaults using generic access for flexibility
  const config = step.config as TextEditorConfig | null;
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
    const currentConfig = step.config as TextEditorConfig | null;
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

    // Validate pattern if it changed or exists in update
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

    setLocalConfig(newConfig);

    // Build the config object for advanced mode
    const configToSave: TextAdvancedConfig = {
      variant: newConfig.variant,
    };

    // Only include validation if there are validation rules
    const hasValidation =
      newConfig.minLength !== undefined ||
      newConfig.maxLength !== undefined ||
      (newConfig.pattern && newConfig.pattern.trim() !== "");

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (hasValidation) {
      configToSave.validation = {};

      if (newConfig.minLength !== undefined) {
        configToSave.validation.minLength = newConfig.minLength;
      }
      if (newConfig.maxLength !== undefined) {
        configToSave.validation.maxLength = newConfig.maxLength;
      }
      if (newConfig.pattern?.trim()) {
        configToSave.validation.pattern = newConfig.pattern;
        if (newConfig.patternMessage?.trim()) {
          configToSave.validation.patternMessage = newConfig.patternMessage;
        }
      }
    }

    // If variant changed in advanced mode, also update the config
    // eslint-disable-next-line sonarjs/no-all-duplicated-branches
    if (isAdvancedMode) {
      updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
    } else {
      updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
    }
  };

  const handleVariantChange = (newVariant: "short" | "long") => {
    if (isEasyMode) {
      // In easy mode, changing variant means changing the step type
      const newType = newVariant === "short" ? "short_text" : "long_text";
      updateStepMutation.mutate({ id: stepId, pageId, type: newType });
    } else {
      // In advanced mode, just update the config
      handleUpdate({ variant: newVariant });
    }
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, pageId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, pageId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

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
            pageId={pageId}
            defaultValue={step.defaultValue as DefaultValueType}
            type={step.type}
            mode={isEasyMode ? 'easy' : 'advanced'}
          />
          <VisibilityField
            stepId={stepId}
            pageId={pageId}
            workflowId={workflowId}
            visibleIf={step.visibleIf as ConditionExpression}
          />
        </>
      )}
    </div>
  );
}
