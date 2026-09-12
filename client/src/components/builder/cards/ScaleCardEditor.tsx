import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";


import type { ConditionExpression } from "@shared/types/conditions";
import type { ScaleConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { ScaleSettingsSection } from "./ScaleCardEditor.components";


export function ScaleCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();

  const config = step.config as ScaleConfig | undefined;

  const handleConfigChange = (nextConfig: ScaleConfig) => {
    updateStepMutation.mutate({ id: stepId, pageId, config: nextConfig });
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

      {/* Scale settings — extracted into ScaleSettingsSection (LIST2-7) so the
          List field host (ListFieldSettings) can render the identical panel
          for a `scale` list field without a step to PATCH. */}
      <ScaleSettingsSection config={config} onChange={handleConfigChange} />

      {/* Preview Info */}
      {workflowId && (
        <VisibilityField
          stepId={stepId}
          pageId={pageId}
          workflowId={workflowId}
          visibleIf={step.visibleIf as ConditionExpression}
        />
      )}
    </div>
  );
}
