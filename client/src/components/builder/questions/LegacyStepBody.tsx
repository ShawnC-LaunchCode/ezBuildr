import {
    EyeOff,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";

import { LogicBuilder, LogicStatusText } from "@/components/logic";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ApiStep, StepType } from "@/lib/vault-api";
import {
    useUpdateStep,
    useWorkflow,
    useWorkflowMode
} from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { AliasField } from "../cards/common/AliasField";
import { DefaultValueField, type DefaultValueType } from "../cards/common/DefaultValueField";
import { TextAreaField } from "../cards/common/EditorField";
import { RequiredToggle } from "../cards/common/RequiredToggle";

import { JSQuestionEditor, type JSQuestionConfig } from "./JSQuestionEditor";
import { OptionsEditor, type OptionItemData } from "./OptionsEditor";

// eslint-disable-next-line import/no-cycle
import { StepEditorCommonProps } from "../StepEditorRouter";

// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity
export function LegacyStepBody({ step, sectionId, workflowId }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { toast } = useToast();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? 'easy';
    const { data: _workflow } = useWorkflow(workflowId);

    // Local State
    const [localRequired, setLocalRequired] = useState(step.required ?? false);
    const [localType, setLocalType] = useState<StepType>(step.type);
    const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);

    const [localOptions, setLocalOptions] = useState<OptionItemData[]>(() => {
        if (step.type === "radio" || step.type === "multiple_choice") {
            const optsConfig = step.options as { options?: unknown[] } | null;
            const opts = optsConfig?.options ?? [];
            return opts.map((opt: unknown, idx: number) => {
                if (typeof opt === 'string') {
                    return {
                        id: `opt-${Date.now()}-${idx}`,
                        label: opt,
                        alias: opt.toLowerCase().replace(/\s+/g, '_')
                    };
                }
                return opt as OptionItemData;
            });
        }
        return [];
    });

    const [localJsConfig, setLocalJsConfig] = useState<JSQuestionConfig>(
        step.type === "js_question" && step.options
            ? (step.options as JSQuestionConfig)
            : {
                display: "hidden",
                code: "return input;",
                inputKeys: [],
                outputKey: "computed_value",
                timeoutMs: 1000,
                helpText: "",
            }
    );

    // Sync state when step prop changes
    useEffect(() => {
        setLocalRequired(step.required ?? false);
        setLocalType(step.type);
        if (step.type === "radio" || step.type === "multiple_choice") {
            const optsConfig = step.options as { options?: unknown[] } | null;
            const opts = optsConfig?.options ?? [];
            setLocalOptions(opts.map((opt: unknown, idx: number) => {
                if (typeof opt === 'string') {
                    return {
                        id: `opt-${Date.now()}-${idx}`,
                        label: opt,
                        alias: opt.toLowerCase().replace(/\s+/g, '_')
                    };
                }
                return opt as OptionItemData;
            }));
        }
    }, [step.required, step.type, step.options]);

    // Handlers
    const handleAliasChange = (value: string | null) => {
        updateStepMutation.mutate(
            { id: step.id, sectionId, alias: value },
            {
                onError: (error: unknown) => {
                    const errorMessage = error instanceof Error ? error.message : "Failed to update variable name";
                    toast({
                        title: "Error",
                        description: errorMessage,
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleRequiredChange = (required: boolean) => {
        setLocalRequired(required);
        updateStepMutation.mutate({ id: step.id, sectionId, required });
    };

    const handleDescriptionChange = (value: string) => {
        updateStepMutation.mutate({ id: step.id, sectionId, description: value });
    };

    const handleOptionsChange = (options: OptionItemData[] | import("@shared/types/stepConfigs").DynamicOptionsConfig) => {
        if (Array.isArray(options)) {
            setLocalOptions(options);
            updateStepMutation.mutate({
                id: step.id,
                sectionId,
                options: { options },
            });
        } else {
            // Backward compatibility for legacy component
            if (options.type === 'static') {
                setLocalOptions(options.options);
                updateStepMutation.mutate({
                    id: step.id,
                    sectionId,
                    options: { options: options.options },
                });
            } else {
                console.warn('[LegacyStepBody] Dynamic options not supported for this Legacy component');
            }
        }
    };

    const handleJsConfigChange = (config: JSQuestionConfig) => {
        setLocalJsConfig(config);
        updateStepMutation.mutate({
            id: step.id,
            sectionId,
            options: config,
        });
    };

    const handleVisibilityChange = (expression: ConditionExpression) => {
        updateStepMutation.mutate(
            {
                id: step.id,
                sectionId,
                visibleIf: expression,
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Visibility updated",
                        description: "Question visibility conditions have been saved.",
                    });
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description:
                            error instanceof Error
                                ? error.message
                                : "Failed to save visibility conditions",
                        variant: "destructive",
                    });
                },
            }
        );
    };

    return (
        <div className="space-y-3 pt-1 border-t">
            {/* Alias / Save Answer As */}
            {step.type !== "display" && (
                <div className={cn(
                    "p-2 rounded-md transition-colors",
                    mode === 'easy' && !step.alias && "bg-amber-50/50 border border-amber-200/50"
                )}>
                    <AliasField
                        value={step.alias}
                        onChange={(val: string | null) => { void handleAliasChange(val); }}
                        placeholder={mode === 'easy' ? "e.g. clientName" : "e.g., user_email"}
                    />
                </div>
            )}

            {/* Answer Settings */}
            <div className="space-y-1.5 pt-2">

                {/* Required Toggle */}
                {step.type !== "display" && (
                    <RequiredToggle
                        checked={localRequired}
                        onChange={handleRequiredChange}
                    />
                )}

                {/* Description / Help Text */}
                <TextAreaField
                    label={step.type === "display" ? "Content (Markdown)" : "Description / Help Text"}
                    description="Optional instructions for the user"
                    value={step.description ?? ""}
                    onChange={(val: string) => { void handleDescriptionChange(val); }}
                    placeholder={step.type === "display" ? "Enter markdown content..." : "Add instructions..."}
                    rows={step.type === "display" ? 6 : 2}
                />

                {/* Options Editor (for radio/multiple_choice) */}
                {(localType === "radio" || localType === "multiple_choice") && (
                    <OptionsEditor
                        options={localOptions}
                        onChange={(opts) => { void handleOptionsChange(opts); }}
                        elementId={step.id}
                    />
                )}

                {/* Default Value Section */}
                <DefaultValueField
                    stepId={step.id}
                    sectionId={sectionId}
                    workflowId={workflowId}
                    defaultValue={step.defaultValue as DefaultValueType}
                    type={step.type}
                    mode={mode}
                />

                {/* JS Question Editor (for js_question) */}
                {localType === "js_question" && (
                    <JSQuestionEditor
                        config={localJsConfig}
                        onChange={(config) => { void handleJsConfigChange(config); }}
                        elementId={step.id}
                        workflowId={workflowId}
                    />
                )}

                {/* Visibility Logic Section - Advanced Mode Only */}
                {mode === 'advanced' && (
                    <Collapsible
                        open={isVisibilityOpen}
                        onOpenChange={setIsVisibilityOpen}
                        className="border rounded-md mt-4"
                    >
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-full justify-between px-3 py-2 h-auto"
                            >
                                <div className="flex items-center gap-2">
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Visibility</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <LogicStatusText visibleIf={step.visibleIf as ConditionExpression} />
                                    {isVisibilityOpen ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </div>
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3">
                            <LogicBuilder
                                workflowId={workflowId}
                                elementId={step.id}
                                elementType="step"
                                value={(step.visibleIf as ConditionExpression) ?? null}
                                onChange={(expression) => { void handleVisibilityChange(expression); }}
                                isSaving={updateStepMutation.isPending}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </div>
        </div>
    );
}
