import { Separator } from "@/components/ui/separator";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import {
  resolveNumberConfig,
  type NumberConfig,
  type CurrencyConfig,
  type NumberAdvancedConfig,
  type NumberCanonicalConfig,
} from "@shared/types/stepConfigs";

import { NumberDisplaySection } from "./NumberCardEditor.components";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { NumberSettingsSection, type NumberEditorConfig } from "./NumberCardEditor.components";

export function NumberCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);

  const numberConfig = step.config as NumberEditorConfig | null;
  // Exposure, not identity (Decision 2): mode decides which settings are
  // visible, never what gets stored. STB-9 keeps detailed numeric formatting
  // in Advanced per Decision 4.
  const mode = workflowMode?.mode ?? "easy";
  const isEasyMode = mode === "easy";
  const showDisplaySettings = !isEasyMode && resolveNumberConfig(step.type, step.config).mode === "number";

  const updateDisplay = (updates: Partial<NumberCanonicalConfig>) => {
    const current = resolveNumberConfig(step.type, step.config);
    const next: NumberCanonicalConfig = { ...current, ...updates };
    // The schema refuses live grouping without grouping; keep them coherent
    // here rather than letting the author save a rejected pair.
    if (next.thousandsSeparator !== true) { delete next.formatOnInput; }
    if (next.prefix === "") { delete next.prefix; }
    if (next.suffix === "") { delete next.suffix; }
    updateStepMutation.mutate({ id: stepId, pageId, config: next });
  };

  const handleConfigChange = (config: NumberConfig | CurrencyConfig | NumberAdvancedConfig) => {
    updateStepMutation.mutate({ id: stepId, pageId, config });
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

      {/* Number/Currency settings — extracted into NumberSettingsSection
          (LIST2-7) so ListFieldSettings can render the identical panel for a
          `number` list field, always in fixed easy-mode ("number"). */}
      <NumberSettingsSection
        stepType={step.type}
        config={numberConfig}
        modeEditable={!isEasyMode && step.type !== "currency"}
        onChange={handleConfigChange}
      />

      {showDisplaySettings && (
        <>
          <Separator />
          <NumberDisplaySection
            config={resolveNumberConfig(step.type, step.config)}
            onChange={updateDisplay}
          />
        </>
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
