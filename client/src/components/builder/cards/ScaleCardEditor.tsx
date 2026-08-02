import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { ScaleAdvancedConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { ScaleSettingsSection } from "./ScaleCardEditor.components";


export function ScaleCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();

  const config = step.config as ScaleAdvancedConfig | undefined;

  const handleConfigChange = (nextConfig: ScaleAdvancedConfig) => {
    updateStepMutation.mutate({ id: stepId, sectionId, config: nextConfig });
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

      {/* Scale settings — extracted into ScaleSettingsSection (LIST2-7) so the
          List field host (ListFieldSettings) can render the identical panel
          for a `scale` list field without a step to PATCH. */}
      <ScaleSettingsSection config={config} onChange={handleConfigChange} />

      {/* Preview Info */}
      {workflowId && (
        <VisibilityField
          stepId={stepId}
          sectionId={sectionId}
          workflowId={workflowId}
          visibleIf={step.visibleIf as ConditionExpression}
        />
      )}
    </div>
  );
}
