import { AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import { resolveTextConfig, type TextAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import {
  AdvancedTextValidationSection,
  InputTypeSection,
  TextContentSection,
  TextValidationSection,
  TextCardState,
} from "./TextCardEditor.components";

function readTextCardState(stepType: string, rawConfig: unknown): TextCardState {
  const config = resolveTextConfig(stepType, rawConfig);
  return {
    variant: config.variant,
    placeholder: config.placeholder ?? "",
    helpText: config.helpText ?? "",
    autoComplete: config.autoComplete ?? "",
    minLength: config.validation?.minLength,
    maxLength: config.validation?.maxLength,
    pattern: config.validation?.pattern ?? "",
    patternMessage: config.validation?.patternMessage ?? "",
  };
}

function buildTextConfig(state: TextCardState): TextAdvancedConfig {
  const config: TextAdvancedConfig = { variant: state.variant };
  if (state.placeholder.trim()) { config.placeholder = state.placeholder; }
  if (state.helpText.trim()) { config.helpText = state.helpText; }
  if (state.autoComplete.trim()) { config.autoComplete = state.autoComplete; }

  const validation = {
    ...(state.minLength !== undefined ? { minLength: state.minLength } : {}),
    ...(state.maxLength !== undefined ? { maxLength: state.maxLength } : {}),
    ...(state.pattern.trim() ? { pattern: state.pattern } : {}),
    ...(state.pattern.trim() && state.patternMessage.trim()
      ? { patternMessage: state.patternMessage }
      : {}),
  };
  if (Object.keys(validation).length > 0) { config.validation = validation; }
  return config;
}

export function TextCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const { toast } = useToast();
  const mode = workflowMode?.mode ?? "easy";
  const isEasyMode = mode === "easy";

  const [localConfig, setLocalConfig] = useState<TextCardState>(() => (
    readTextCardState(step.type, step.config)
  ));

  const [patternError, setPatternError] = useState<string | null>(null);

  useEffect(() => {
    // Re-sync local config when step props change
    setLocalConfig(readTextCardState(step.type, step.config));
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

  const validateMinMax = (candidate: TextCardState = localConfig): string | null => {
    if (
      candidate.minLength !== undefined &&
      candidate.maxLength !== undefined &&
      candidate.minLength > candidate.maxLength
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
    const minMaxError = validateMinMax(newConfig);
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

    updateStepMutation.mutate({ id: stepId, pageId, config: buildTextConfig(newConfig) });
  };

  const handleVariantChange = (newVariant: "short" | "long") => {
    if (!isEasyMode) { handleUpdate({ variant: newVariant }); }
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

      <TextContentSection localConfig={localConfig} onUpdate={handleUpdate} />

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
      />

      {!isEasyMode && (
        <>
          <Separator />
          <AdvancedTextValidationSection
            localConfig={localConfig}
            onUpdate={handleUpdate}
            patternError={patternError}
          />
        </>
      )}

      {!isEasyMode && patternError && (
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
            mode={mode}
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
