/**
 * Display Block Card Editor
 * Editor for display blocks (markdown content)
 *
 * Config shape:
 * {
 *   markdown: string
 * }
 *
 * Note: Display blocks do NOT have aliases (they don't output variables)
 * Note: Display blocks should NOT have "required" toggle (nothing to require)
 */

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { DisplayConfig } from "@shared/types/stepConfigs";

import type { StepEditorCommonProps } from "./common/stepEditorProps";

import { DisplayContentSection } from "./DisplayCardEditor.components";
import { VisibilityField } from "./common/VisibilityField";


export function DisplayCardEditor({ stepId, pageId, step, workflowId }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config (works for both easy and advanced mode)
  const config = step.config as DisplayConfig | undefined;

  const handleConfigChange = (nextConfig: DisplayConfig) => {
    updateStepMutation.mutate({ id: stepId, pageId, config: nextConfig });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Label (optional for display blocks - used for builder clarity only) */}
      {/* Display Card Title is managed by StepCard now */}

      {/* No Alias field - display blocks don't output variables */}
      {/* No Required toggle - display blocks can't be required */}

      <Separator />

      {/* Content — extracted into DisplayContentSection (LIST2-7) so
          ListFieldSettings can render the identical panel for a `display`
          list field. */}
      <DisplayContentSection config={config} onChange={handleConfigChange} />

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
