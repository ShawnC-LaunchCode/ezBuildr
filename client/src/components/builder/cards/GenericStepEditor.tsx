/**
 * Generic Step Card Editor
 *
 * Intentional fallback editor for step types that have no dedicated card editor.
 * The palette (blockRegistry) can only create types that have a specific editor;
 * this catch-all exists purely so that legacy / imported / AI-generated steps
 * whose enum value predates the card-editor migration (e.g. `computed`,
 * `repeater`, `file_upload`, `*_advanced` variants) remain editable rather than
 * crashing the builder.
 *
 * It renders only the controls common to every step (alias, required,
 * description, default value, visibility) — no type-specific configuration.
 * This is the clean replacement for the former LegacyStepBody catch-all, minus
 * its dead radio/multiple_choice options branch and js_question branch, both of
 * which now route to dedicated editors (ICW-B1).
 */

import { useWorkflowMode, useUpdateStep } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, type DefaultValueType } from "./common/DefaultValueField";
import { DescriptionField } from "./common/DescriptionField";
import { RequiredToggle } from "./common/RequiredToggle";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { VisibilityField } from "./common/VisibilityField";

export function GenericStepEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";

    const isDisplay = step.type === "display" || step.type === "display_advanced";

    const handleAliasChange = (alias: string | null) => {
        updateStepMutation.mutate({ id: stepId, sectionId, alias });
    };

    const handleRequiredChange = (required: boolean) => {
        updateStepMutation.mutate({ id: stepId, sectionId, required });
    };

    return (
        <div className="space-y-4 p-4 border-t bg-muted/30">
            {/* Alias (not applicable to pure display steps) */}
            {!isDisplay && (
                <AliasField
                    value={step.alias}
                    onChange={handleAliasChange}
                    workflowId={workflowId}
                    currentStepId={stepId}
                />
            )}

            {/* Required Toggle */}
            {!isDisplay && <RequiredToggle checked={step.required} onChange={handleRequiredChange} />}

            {/* Description / Help Text (or Content for display steps) */}
            <DescriptionField
                stepId={stepId}
                sectionId={sectionId}
                description={step.description}
                isDisplayStep={isDisplay}
            />

            {/* Default Value */}
            {!isDisplay && (
                <DefaultValueField
                    stepId={stepId}
                    sectionId={sectionId}
                    workflowId={workflowId}
                    defaultValue={step.defaultValue as DefaultValueType}
                    type={step.type}
                    mode={mode}
                />
            )}

            {/* Visibility (advanced mode only) */}
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
