
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

import type { ScaleConfig } from "@shared/types/stepConfigs";

import { TextField, NumberField, SectionHeader, SwitchField } from "./common/EditorField";

export interface ScaleCardState {
    min: number;
    max: number;
    step: number;
    display: "slider" | "stars";
    stars?: number;
    showValue: boolean;
    minLabel: string;
    maxLabel: string;
}

export const DisplayModeSection = ({
    display,
    onDisplayChange
}: {
    display: "slider" | "stars";
    onDisplayChange: (v: "slider" | "stars") => void;
}) => (
    <div className="space-y-3">
        <SectionHeader
            title="Display Mode"
            description="How the scale is displayed"
        />
        <RadioGroup
            value={display}
            onValueChange={(v) => onDisplayChange(v as "slider" | "stars")}
        >
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="slider" id="display-slider" />
                <Label htmlFor="display-slider" className="cursor-pointer">
                    Slider
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="stars" id="display-stars" />
                <Label htmlFor="display-stars" className="cursor-pointer">
                    Stars
                </Label>
            </div>
        </RadioGroup>
    </div>
);

export const RangeSection = ({
    config,
    onUpdate
}: {
    config: ScaleCardState;
    onUpdate: (updates: Partial<ScaleCardState>) => void;
}) => (
    <div className="space-y-4">
        <SectionHeader
            title="Range"
            description="Configure the scale range"
        />

        {/* Stars Count (only in stars mode) */}
        {config.display === "stars" && (
            <NumberField
                label="Number of Stars"
                value={config.stars}
                onChange={(val) => {
                    onUpdate({
                        stars: val,
                        max: val // Auto-sync max with stars count
                    });
                }}
                placeholder="5"
                description="How many stars to display"
                min={1}
                max={12}
                step={1}
                required
            />
        )}

        {/* Min/Max (only in slider mode, or show as read-only in stars mode) */}
        {config.display === "slider" && (
            <>
                <NumberField
                    label="Minimum Value"
                    value={config.min}
                    onChange={(val) => onUpdate({ min: val ?? 0 })}
                    placeholder="1"
                    description="The minimum value"
                    required
                />

                <NumberField
                    label="Maximum Value"
                    value={config.max}
                    onChange={(val) => onUpdate({ max: val ?? 10 })}
                    placeholder="10"
                    description="The maximum value"
                    required
                />

                <NumberField
                    label="Step"
                    value={config.step}
                    onChange={(val) => onUpdate({ step: val ?? 1 })}
                    placeholder="1"
                    description="The increment step"
                    min={0.01}
                    step={0.1}
                    required
                />
            </>
        )}

        {/* Labels */}
        <TextField
            label="Minimum Label"
            value={config.minLabel}
            onChange={(val) => onUpdate({ minLabel: val })}
            placeholder="e.g., 'Not likely'"
            description="Optional label for minimum value"
        />

        <TextField
            label="Maximum Label"
            value={config.maxLabel}
            onChange={(val) => onUpdate({ maxLabel: val })}
            placeholder="e.g., 'Very likely'"
            description="Optional label for maximum value"
        />
    </div>
);

function validateScaleCardState(config: ScaleCardState): string[] {
    const errs: string[] = [];

    if (config.min >= config.max) {
        errs.push("Minimum value must be less than maximum value");
    }

    if (config.step <= 0) {
        errs.push("Step must be greater than 0");
    }

    if (config.display === "stars") {
        if (config.stars === null || config.stars === undefined || config.stars < 1) {
            errs.push("Number of stars must be at least 1");
        }
        if (config.stars !== null && config.stars !== undefined && config.stars > 12) {
            errs.push("Number of stars should not exceed 12");
        }
    }

    return errs;
}

function toScaleCardState(config: ScaleConfig | undefined): ScaleCardState {
    return {
        min: config?.min ?? 1,
        max: config?.max ?? 10,
        step: config?.step ?? 1,
        display: config?.display ?? "slider",
        showValue: config?.showValue ?? true,
        minLabel: config?.minLabel ?? "",
        maxLabel: config?.maxLabel ?? "",
    };
}

/**
 * Presentational, save-free Scale settings panel (LIST2-7). Composes
 * `DisplayModeSection` + `RangeSection` + the "Show Current Value" toggle +
 * validation errors, and calls `onChange` with a complete `ScaleAdvancedConfig`
 * validation errors, and calls `onChange` with a complete `ScaleConfig`
 * on every valid edit — no `useUpdateStep` call, so it works identically as a
 * standalone step's settings body or embedded in a List field's drilled
 * settings (`ListFieldSettings`).
 */
export function ScaleSettingsSection({
    config,
    onChange,
}: {
    config: ScaleConfig | undefined;
    onChange: (config: ScaleConfig) => void;
}): JSX.Element {
    const [localConfig, setLocalConfig] = useState<ScaleCardState>(() => toScaleCardState(config));
    const [errors, setErrors] = useState<string[]>([]);

    useEffect(() => {
        setLocalConfig(toScaleCardState(config));
    }, [config]);

    const handleUpdate = (updates: Partial<ScaleCardState>) => {
        const newConfig = { ...localConfig, ...updates };
        setLocalConfig(newConfig);

        const validationErrors = validateScaleCardState(newConfig);
        setErrors(validationErrors);

        if (validationErrors.length > 0) {
            return; // Don't save if invalid
        }

        const configToSave: ScaleConfig = {
            min: newConfig.min,
            max: newConfig.max,
            step: newConfig.step,
            display: newConfig.display,
            showValue: newConfig.showValue,
        };

        if (newConfig.minLabel?.trim()) {
            configToSave.minLabel = newConfig.minLabel;
        }
        if (newConfig.maxLabel?.trim()) {
            configToSave.maxLabel = newConfig.maxLabel;
        }

        onChange(configToSave);
    };

    const handleDisplayChange = (display: "slider" | "stars") => {
        const updates: Partial<ScaleCardState> = { display };

        // When switching to stars mode, set default values
        if (display === "stars") {
            updates.stars = localConfig.stars ?? 5;
            updates.min = 1;
            updates.step = 1;
            if (!localConfig.max || localConfig.max > 12) {
                updates.max = updates.stars;
            }
        }

        handleUpdate(updates);
    };

    return (
        <div className="space-y-4">
            <DisplayModeSection display={localConfig.display} onDisplayChange={handleDisplayChange} />

            <Separator />

            <RangeSection config={localConfig} onUpdate={handleUpdate} />

            <Separator />

            <div className="space-y-3">
                <SectionHeader
                    title="Display Options"
                    description="Configure how the scale is shown"
                />

                <SwitchField
                    label="Show Current Value"
                    description="Display the selected value as a number"
                    checked={localConfig.showValue}
                    onChange={(checked) => handleUpdate({ showValue: checked })}
                />
            </div>

            {errors.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium">Validation Errors</p>
                        <ul className="list-disc list-inside">
                            {errors.map((error, idx) => (
                                <li key={idx}>{error}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
