/**
 * Date / Time Block Card Editor
 *
 * Authors the canonical `date_time` family by its `kind` discriminator while
 * retaining read compatibility for aliases awaiting STB-19 backfill.
 */

import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { StepType } from "@/lib/vault-api";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import { resolveDateTimeConfig, type DateTimeConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, type DefaultValueType } from "./common/DefaultValueField";
import { DescriptionField } from "./common/DescriptionField";
import { SectionHeader, SwitchField } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { VisibilityField } from "./common/VisibilityField";

/** Local editable mirror of the canonical date/time config. */
interface DateTimeCardState {
    kind: DateTimeConfig['kind'];
    minDate: string;
    maxDate: string;
    defaultToToday: boolean;
    timeFormat: "12h" | "24h";
    timeStep: number;
}

function hasDatePart(kind: DateTimeConfig['kind']): boolean {
    return kind === "date" || kind === "datetime";
}

function hasTimePart(kind: DateTimeConfig['kind']): boolean {
    return kind === "time" || kind === "datetime";
}

/** Read the possibly-legacy config into canonical local state. */
function readConfig(type: StepType, raw: unknown): DateTimeCardState {
    const config = resolveDateTimeConfig(type, raw);
    return {
        kind: config.kind,
        minDate: config.minDate ?? "",
        maxDate: config.maxDate ?? "",
        defaultToToday: config.defaultToToday ?? false,
        timeFormat: config.timeFormat ?? "12h",
        timeStep: config.timeStep ?? 15,
    };
}

/** Preserve all implemented sibling settings while changing `kind`. */
function buildConfig(state: DateTimeCardState): DateTimeConfig {
    const out: DateTimeConfig = {
        kind: state.kind,
        defaultToToday: state.defaultToToday,
        timeFormat: state.timeFormat,
        timeStep: state.timeStep,
    };
    if (state.minDate) { out.minDate = state.minDate; }
    if (state.maxDate) { out.maxDate = state.maxDate; }
    return out;
}

export function DateTimeCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";

    const [localConfig, setLocalConfig] = useState<DateTimeCardState>(() => readConfig(step.type, step.config));
    const showDate = hasDatePart(localConfig.kind);
    const showTime = hasTimePart(localConfig.kind);

    useEffect(() => {
        setLocalConfig(readConfig(step.type, step.config));
    }, [step.config, step.type]);

    const handleUpdate = (updates: Partial<DateTimeCardState>) => {
        const next = { ...localConfig, ...updates };
        setLocalConfig(next);
        updateStepMutation.mutate({ id: stepId, pageId, config: buildConfig(next) });
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

            {/* Description / Help Text */}
            <DescriptionField stepId={stepId} pageId={pageId} description={step.description} />

            <Separator />

            {/* Date/Time Configuration */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Date/Time type</Label>
                    <RadioGroup
                        value={localConfig.kind}
                        onValueChange={(kind) => handleUpdate({ kind: kind as DateTimeConfig['kind'] })}
                        className="grid grid-cols-3 gap-2"
                    >
                        {([
                            ["date", "Date"],
                            ["time", "Time"],
                            ["datetime", "Date & Time"],
                        ] as const).map(([kind, label]) => (
                            <Label
                                key={kind}
                                htmlFor={`date-time-kind-${stepId}-${kind}`}
                                className="flex items-center gap-2 rounded-md border p-2 font-normal"
                            >
                                <RadioGroupItem
                                    id={`date-time-kind-${stepId}-${kind}`}
                                    value={kind}
                                    disabled={mode === "easy"}
                                />
                                {label}
                            </Label>
                        ))}
                    </RadioGroup>
                </div>

                <SectionHeader
                    title={showDate && showTime ? "Date & Time Options" : showTime ? "Time Options" : "Date Options"}
                    description="Constrain the range and format for this input"
                />

                {showDate && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor={`min-date-${stepId}`} className="text-xs">Earliest date</Label>
                            <Input
                                id={`min-date-${stepId}`}
                                type="date"
                                value={localConfig.minDate}
                                onChange={(e) => handleUpdate({ minDate: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor={`max-date-${stepId}`} className="text-xs">Latest date</Label>
                            <Input
                                id={`max-date-${stepId}`}
                                type="date"
                                value={localConfig.maxDate}
                                onChange={(e) => handleUpdate({ maxDate: e.target.value })}
                            />
                        </div>
                    </div>
                )}

                {localConfig.kind === "date" && (
                    <SwitchField
                        label="Default to today"
                        checked={localConfig.defaultToToday}
                        onChange={(val) => handleUpdate({ defaultToToday: val })}
                        description="Pre-fill the field with the current date"
                    />
                )}

                {showTime && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor={`time-format-${stepId}`} className="text-xs">Time format</Label>
                            <Select
                                value={localConfig.timeFormat}
                                onValueChange={(val) => handleUpdate({ timeFormat: val as "12h" | "24h" })}
                            >
                                <SelectTrigger id={`time-format-${stepId}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                                    <SelectItem value="24h">24-hour</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor={`time-step-${stepId}`} className="text-xs">Minute step</Label>
                            <Input
                                id={`time-step-${stepId}`}
                                type="number"
                                min={1}
                                max={60}
                                value={localConfig.timeStep}
                                onChange={(e) => handleUpdate({ timeStep: Number(e.target.value) || 1 })}
                            />
                        </div>
                    </div>
                )}
            </div>

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
