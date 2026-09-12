/**
 * List Card Editor (LIST-6)
 * Author-time editor for the `list` step type: a nestable, repeating
 * question. Field authoring is delegated to the recursive ListLevelEditor;
 * this component owns the step-level concerns (alias, required, visibility)
 * and the top-level ListConfig (depth 1).
 */
import { useMemo } from "react";

import { Separator } from "@/components/ui/separator";
import { useDebouncedFieldMutation } from "@/hooks/useDebouncedFieldMutation";
import { useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { ListConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { createQuestionField } from "./list/listEditorHelpers";
import { ListLevelEditor } from "./list/ListLevelEditor";

const CONFIG_SAVE_DEBOUNCE_MS = 600;

interface PendingConfigSave {
  stepId: string;
  pageId: string;
  config: ListConfig;
}

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

export function ListCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
  const updateStepMutation = useUpdateStep();
  const serverValue = useMemo<PendingConfigSave>(() => ({
    stepId,
    pageId,
    config: readListConfig(step.config),
  }), [pageId, step.config, stepId]);
  const saveIdentity = useMemo(() => ({ stepId, pageId }), [pageId, stepId]);
  const { localValue, onChange: queueConfigSave } = useDebouncedFieldMutation(
    serverValue,
    (pendingSave) => {
      updateStepMutation.mutate({
        id: pendingSave.stepId,
        pageId: pendingSave.pageId,
        config: pendingSave.config,
      });
    },
    CONFIG_SAVE_DEBOUNCE_MS,
    saveIdentity
  );

  const handleConfigChange = (config: ListConfig) => {
    queueConfigSave({ stepId, pageId, config });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, pageId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, pageId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      <ListLevelEditor config={localValue.config} onChange={handleConfigChange} depth={1} />

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
