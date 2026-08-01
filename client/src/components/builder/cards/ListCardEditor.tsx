/**
 * List Card Editor (LIST-6)
 * Author-time editor for the `list` step type: a nestable, repeating
 * question. Field authoring is delegated to the recursive ListLevelEditor;
 * this component owns the step-level concerns (alias, required, visibility)
 * and the top-level ListConfig (depth 1).
 */
import { useEffect, useState } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { ListConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { createQuestionField } from "./list/listEditorHelpers";
import { ListLevelEditor } from "./list/ListLevelEditor";

function defaultListConfig(): ListConfig {
  return { fields: [createQuestionField([])] };
}

/** Guards against a malformed/absent `step.config` (e.g. a hand-crafted API call) — never throws. */
function readListConfig(config: unknown): ListConfig {
  const candidate = config as { fields?: unknown } | null | undefined;
  if (candidate && Array.isArray(candidate.fields)) {
    return config as ListConfig;
  }
  return defaultListConfig();
}

export function ListCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const [localConfig, setLocalConfig] = useState<ListConfig>(() => readListConfig(step.config));

  useEffect(() => {
    setLocalConfig(readListConfig(step.config));
  }, [step.config]);

  const handleConfigChange = (config: ListConfig) => {
    setLocalConfig(config);
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
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      <ListLevelEditor config={localConfig} onChange={handleConfigChange} depth={1} />

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
