/**
 * Date / Time Block Card Editor
 *
 * Handles the date/time step family: `date`, `time`, `date_time` (the live,
 * palette-creatable types) plus the legacy `datetime` / `datetime_unified`
 * variants that can exist in older or imported workflows. Replaces the generic
 * fall-through these types previously had in LegacyStepBody (ICW-B1).
 */

import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { StepType } from "@/lib/vault-api";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { DateConfig, TimeConfig, DateTimeConfig } from "@shared/types/stepConfigs";

import { AliasField } from "./common/AliasField";
import { DefaultValueField, type DefaultValueType } from "./common/DefaultValueField";
import { DescriptionField } from "./common/DescriptionField";
import { SectionHeader, SwitchField } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import { VisibilityField } from "./common/VisibilityField";

/** Normalised local mirror of the various date/time config shapes. */
interface DateTimeCardState {
    minDate: string;
    maxDate: string;
    defaultToToday: boolean;
    timeFormat: "12h" | "24h";
    timeStep: number;
}

function hasDatePart(type: StepType): boolean {
    return type === "date" || type === "date_time" || type === "datetime" || type === "datetime_unified";
}

function hasTimePart(type: StepType): boolean {
    return type === "time" || type === "date_time" || type === "datetime" || type === "datetime_unified";
}

/** Read the (possibly type-specific) config into the normalised local state. */
function readConfig(type: StepType, raw: unknown): DateTimeCardState {
    const cfg = (raw ?? {}) as DateConfig & TimeConfig & DateTimeConfig;
    return {
        minDate: cfg.minDate ?? "",
        maxDate: cfg.maxDate ?? "",
        defaultToToday: (cfg as DateConfig).defaultToToday ?? false,
        // `time` uses `format`/`step`; the combined types use `timeFormat`/`timeStep`.
        timeFormat: (cfg.timeFormat ?? (cfg as TimeConfig).format ?? "12h"),
        timeStep: cfg.timeStep ?? (cfg as TimeConfig).step ?? 15,
    };
}

/** Map the normalised state back to the config shape expected for `type`. */
function buildConfig(type: StepType, state: DateTimeCardState): Record<string, unknown> {
    if (type === "time") {
        const out: TimeConfig = { format: state.timeFormat, step: state.timeStep };
        return out as Record<string, unknown>;
    }
    if (type === "date") {
        const out: DateConfig = { defaultToToday: state.defaultToToday };
        if (state.minDate) { out.minDate = state.minDate; }
        if (state.maxDate) { out.maxDate = state.maxDate; }
        return out as Record<string, unknown>;
    }
    // date_time / datetime / datetime_unified
    const out: DateTimeConfig = { timeFormat: state.timeFormat, timeStep: state.timeStep };
    if (state.minDate) { out.minDate = state.minDate; }
    if (state.maxDate) { out.maxDate = state.maxDate; }
    return out as Record<string, unknown>;
}

export function DateTimeCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode ?? "easy";

    const showDate = hasDatePart(step.type);
    const showTime = hasTimePart(step.type);

    const [localConfig, setLocalConfig] = useState<DateTimeCardState>(() => readConfig(step.type, step.config));

    useEffect(() => {
        setLocalConfig(readConfig(step.type, step.config));
    }, [step.config, step.type]);

    const handleUpdate = (updates: Partial<DateTimeCardState>) => {
        const next = { ...localConfig, ...updates };
        setLocalConfig(next);
        updateStepMutation.mutate({ id: stepId, sectionId, config: buildConfig(step.type, next) });
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

            {/* Date/Time Configuration */}
            <div className="space-y-4">
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

                {step.type === "date" && (
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
