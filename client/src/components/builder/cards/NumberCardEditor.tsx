import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { NumberConfig, CurrencyConfig, NumberAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { NumberSettingsSection, type NumberEditorConfig } from "./NumberCardEditor.components";

export function NumberCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();

  const numberConfig = step.config as NumberEditorConfig | null;
  const isAdvancedMode = step.type === "number" && numberConfig?.mode !== undefined;
  const isCurrency = step.type === "currency";
  const isEasyMode = !isAdvancedMode && !isCurrency;

  const handleConfigChange = (config: NumberConfig | CurrencyConfig | NumberAdvancedConfig) => {
    updateStepMutation.mutate({ id: stepId, sectionId, config });
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

      {/* Number/Currency settings — extracted into NumberSettingsSection
          (LIST2-7) so ListFieldSettings can render the identical panel for a
          `number` list field, always in fixed easy-mode ("number"). */}
      <NumberSettingsSection stepType={step.type} config={numberConfig} onChange={handleConfigChange} />

      {workflowId && (
        <>
          <DefaultValueField
            stepId={stepId}
            sectionId={sectionId}
            defaultValue={step.defaultValue as DefaultValueType}
            type={step.type}
            mode={isEasyMode ? 'easy' : 'advanced'}
          />
          <VisibilityField
            stepId={stepId}
            sectionId={sectionId}
            workflowId={workflowId}
            visibleIf={step.visibleIf as ConditionExpression}
          />
        </>
      )}
    </div>
  );
}
