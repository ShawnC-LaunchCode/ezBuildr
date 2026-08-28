/**
 * Boolean Block Card Editor
 * Editor for boolean blocks (yes_no, true_false, boolean)
 */

import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { BooleanAdvancedConfig, LegacyYesNoConfig, TrueFalseConfig } from "@shared/types/stepConfigs";

import type { StepEditorCommonProps } from "./common/stepEditorProps";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { TextField, SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";

type BooleanDisplayStyle = NonNullable<BooleanAdvancedConfig["displayStyle"]>;

interface BooleanCardState {
  trueLabel: string;
  falseLabel: string;
  storeAsBoolean: boolean;
  trueAlias: string;
  falseAlias: string;
  displayStyle: BooleanDisplayStyle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(config: Record<string, unknown>, key: string): string | undefined {
  return typeof config[key] === "string" ? config[key] : undefined;
}

function readBooleanCardState(stepType: string, rawConfig: unknown): BooleanCardState {
  const config = isRecord(rawConfig) ? rawConfig : {};
  const legacyYesNo = stepType === "yes_no";
  const trueDefault = stepType === "true_false" ? "True" : "Yes";
  const falseDefault = stepType === "true_false" ? "False" : "No";
  const configuredStyle = readString(config, "displayStyle");
  const displayStyle: BooleanDisplayStyle = configuredStyle === "radio"
    || configuredStyle === "toggle"
    || configuredStyle === "checkbox"
    || configuredStyle === "buttons"
    ? configuredStyle
    : "buttons";

  return {
    trueLabel: (legacyYesNo ? readString(config, "yesLabel") : undefined)
      ?? readString(config, "trueLabel")
      ?? trueDefault,
    falseLabel: (legacyYesNo ? readString(config, "noLabel") : undefined)
      ?? readString(config, "falseLabel")
      ?? falseDefault,
    storeAsBoolean: typeof config.storeAsBoolean === "boolean" ? config.storeAsBoolean : true,
    trueAlias: readString(config, "trueAlias") ?? "",
    falseAlias: readString(config, "falseAlias") ?? "",
    displayStyle,
  };
}

function buildCanonicalBooleanConfig(state: BooleanCardState): BooleanAdvancedConfig {
  const config: BooleanAdvancedConfig = {
    trueLabel: state.trueLabel,
    falseLabel: state.falseLabel,
    storeAsBoolean: state.storeAsBoolean,
    displayStyle: state.displayStyle,
  };
  if (state.trueAlias.trim()) { config.trueAlias = state.trueAlias; }
  if (state.falseAlias.trim()) { config.falseAlias = state.falseAlias; }
  return config;
}

export function BooleanCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const mode = workflowMode?.mode ?? "easy";
  const isEasyMode = mode === "easy";
  const isCanonicalBoolean = step.type === "boolean";
  const defaults = step.type === "true_false"
    ? { trueLabel: "True", falseLabel: "False" }
    : { trueLabel: "Yes", falseLabel: "No" };

  const [localConfig, setLocalConfig] = useState<BooleanCardState>(() => (
    readBooleanCardState(step.type, step.config)
  ));

  useEffect(() => {
    setLocalConfig(readBooleanCardState(step.type, step.config));
  }, [step.config, step.type]);

  const handleUpdate = (updates: Partial<BooleanCardState>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    if (step.type === "yes_no") {
      const configToSave: LegacyYesNoConfig = {
        yesLabel: newConfig.trueLabel,
        noLabel: newConfig.falseLabel,
      };
      updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
    } else if (step.type === "true_false") {
      const configToSave: TrueFalseConfig = {
        trueLabel: newConfig.trueLabel,
        falseLabel: newConfig.falseLabel,
      };
      updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
    } else {
      updateStepMutation.mutate({
        id: stepId,
        pageId,
        config: buildCanonicalBooleanConfig(newConfig),
      });
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

      {isCanonicalBoolean && (
        <>
          <Separator />
          <div className="space-y-3">
            <SectionHeader
              title="Answer Style"
              description="Choose how respondents select between the two values"
            />
            <div className="space-y-2">
              <Label htmlFor={`boolean-style-${stepId}`}>Control</Label>
              <Select
                value={localConfig.displayStyle}
                onValueChange={(value: "buttons" | "radio" | "toggle") => {
                  handleUpdate({ displayStyle: value });
                }}
              >
                <SelectTrigger id={`boolean-style-${stepId}`} aria-label="Answer style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buttons">Buttons</SelectItem>
                  <SelectItem value="radio">Radio choices</SelectItem>
                  <SelectItem value="toggle">Toggle switch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Advanced Mode Only - Storage Options */}
      {!isEasyMode && isCanonicalBoolean && (
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
