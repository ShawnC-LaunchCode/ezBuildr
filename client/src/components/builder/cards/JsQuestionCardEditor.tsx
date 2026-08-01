/**
 * JS Question Block Card Editor
 *
 * Card editor for the `js_question` (advanced-mode computed) step type. Wraps
 * the existing JSQuestionEditor with the standard alias / visibility controls,
 * replacing the js_question branch that previously lived in LegacyStepBody
 * (ICW-B1).
 */

import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { JSQuestionEditor, type JSQuestionConfig } from "../questions/JSQuestionEditor";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, type DefaultValueType } from "./common/DefaultValueField";
import { DescriptionField } from "./common/DescriptionField";
import { RequiredToggle } from "./common/RequiredToggle";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { VisibilityField } from "./common/VisibilityField";

const DEFAULT_JS_CONFIG: JSQuestionConfig = {
    display: "hidden",
    code: "return input;",
    inputKeys: [],
    outputKey: "computed_value",
    timeoutMs: 1000,
    helpText: "",
};

export function JsQuestionCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";

    const [localConfig, setLocalConfig] = useState<JSQuestionConfig>(
        step.config ? (step.config as JSQuestionConfig) : DEFAULT_JS_CONFIG
    );

    useEffect(() => {
        setLocalConfig(step.config ? (step.config as JSQuestionConfig) : DEFAULT_JS_CONFIG);
    }, [step.config]);

    const handleConfigChange = (config: JSQuestionConfig) => {
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
            {/* Alias */}
            <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

            {/* Required Toggle */}
            <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

            {/* Description / Help Text */}
            <DescriptionField stepId={stepId} sectionId={sectionId} description={step.description} />

            <Separator />

            {/* JS Configuration */}
            <JSQuestionEditor
                config={localConfig}
                onChange={handleConfigChange}
                elementId={stepId}
                workflowId={workflowId}
            />

            {/* Default Value */}
            <DefaultValueField
                stepId={stepId}
                sectionId={sectionId}
                defaultValue={step.defaultValue as DefaultValueType}
                type={step.type}
                mode={mode}
            />

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
