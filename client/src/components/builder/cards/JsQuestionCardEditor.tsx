/**
 * JS Question Block Card Editor
 *
 * Card editor for the `js_question` (advanced-mode computed) step type. Wraps
 * the existing JSQuestionEditor with the standard alias / visibility controls,
 * replacing the js_question branch that previously lived in LegacyStepBody
 * (ICW-B1).
 */

import { useMemo } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import { adaptLegacyStep } from "@shared/types/stepConfigs";
import { isJsQuestionConfig } from "@shared/types/steps";

import { JSQuestionEditor, type JSQuestionConfig } from "../questions/JSQuestionEditor";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, type DefaultValueType } from "./common/DefaultValueField";
import { DescriptionField } from "./common/DescriptionField";
import { RequiredToggle } from "./common/RequiredToggle";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { VisibilityField } from "./common/VisibilityField";

const DEFAULT_JS_CONFIG: JSQuestionConfig = {
    code: "emit({ computed_value: null });",
    inputs: [],
    outputs: [{ key: "computed_value", type: "string" }],
    timeoutMs: 1000,
};

function resolveEditorConfig(config: unknown): JSQuestionConfig {
    const adapted = adaptLegacyStep({ type: 'js_question', config }).config;
    return isJsQuestionConfig(adapted) ? adapted : DEFAULT_JS_CONFIG;
}

export function JsQuestionCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";

    // Since CB-8 the Code Block config is saved by the editor modal itself, so
    // the card only ever READS it. Mirroring it into local state here would be
    // a second copy of server state with nothing to keep it honest.
    const config = useMemo(() => resolveEditorConfig(step.config), [step.config]);

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

            {/* Description / Help Text */}
            <DescriptionField stepId={stepId} pageId={pageId} description={step.description} />

            <Separator />

            {/* JS Configuration */}
            <JSQuestionEditor
                config={config}
                elementId={stepId}
                pageId={pageId}
                workflowId={workflowId}
                title={step.title}
            />

            {/* Default Value */}
            <DefaultValueField
                stepId={stepId}
                pageId={pageId}
                defaultValue={step.defaultValue as DefaultValueType}
                type={step.type}
                mode={mode}
            />

            {/* Visibility (advanced mode only) */}
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
