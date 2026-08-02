
import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import type { NumberConfig, CurrencyConfig, NumberAdvancedConfig } from "@shared/types/stepConfigs";

import { SectionHeader, NumberField, SwitchField } from "./common/EditorField";

export interface NumberCardState {
    mode: "number" | "currency_whole" | "currency_decimal";
    min?: number;
    max?: number;
    step: number;
    allowDecimal: boolean;
    formatOnInput: boolean;
}

/** Union of every shape `step.config`/`field.config` may hold for a number-family step type. */
export type NumberEditorConfig = Partial<NumberConfig & CurrencyConfig & NumberAdvancedConfig>;

export const NumberModeSection = ({
    mode,
    isAdvancedMode,
    isCurrency,
    onModeChange
}: {
    mode: string;
    isAdvancedMode: boolean;
    isCurrency: boolean;
    onModeChange: (val: "number" | "currency_whole" | "currency_decimal") => void;
}) => (
    <div className="space-y-3">
        <SectionHeader
            title="Number Type"
            description={isAdvancedMode ? "Choose number format" : isCurrency ? "Fixed as currency" : "Fixed as number"}
        />

        <div className="space-y-2">
            <Label className="text-sm font-medium">Display Mode</Label>
            <Select
                value={mode}
                onValueChange={(val) => onModeChange(val as "number" | "currency_whole" | "currency_decimal")}
                disabled={!isAdvancedMode}
            >
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="currency_whole">Currency (no decimals)</SelectItem>
                    <SelectItem value="currency_decimal">Currency (with decimals)</SelectItem>
                </SelectContent>
            </Select>
        </div>

        {!isAdvancedMode && (
            <p className="text-xs text-muted-foreground">
                Mode is fixed in {isCurrency ? "currency" : "easy"} mode
            </p>
        )}
    </div>
);

export const NumberValidationSection = ({
    localConfig,
    onUpdate,
    minMaxError
}: {
    localConfig: NumberCardState;
    onUpdate: (updates: Partial<NumberCardState>) => void;
    minMaxError: string | null;
}) => (
    <div className="space-y-4">
        <SectionHeader
            title="Validation Rules"
            description="Set numeric constraints"
        />

        {/* Min */}
        <NumberField
            label="Minimum Value"
            value={localConfig.min}
            onChange={(val) => onUpdate({ min: val })}
            placeholder="No minimum"
            description="Smallest allowed value"
            error={minMaxError ?? undefined}
            step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
        />

        {/* Max */}
        <NumberField
            label="Maximum Value"
            value={localConfig.max}
            onChange={(val) => onUpdate({ max: val })}
            placeholder="No maximum"
            description="Largest allowed value"
            error={minMaxError ?? undefined}
            step={localConfig.mode === "currency_decimal" ? 0.01 : 1}
        />

        {/* Step - only for non-currency modes */}
        {localConfig.mode === "number" && (
            <NumberField
                label="Step"
                value={localConfig.step}
                onChange={(val) => onUpdate({ step: val ?? 1 })}
                placeholder="1"
                description="Increment/decrement step size"
                min={0.01}
            />
        )}
    </div>
);

export const NumberPreviewSection = ({ mode }: { mode: string }) => (
    <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {mode === "number" ? (
            <p className="text-sm font-mono">12345</p>
        ) : mode === "currency_whole" ? (
            <p className="text-sm font-mono">$12,345</p>
        ) : (
            <p className="text-sm font-mono">$12,345.67</p>
        )}
    </div>
);

function validateMinMax(min: number | undefined, max: number | undefined): string | null {
    if (min !== undefined && max !== undefined && min > max) {
        return "Min cannot be greater than max";
    }
    return null;
}

function getInitialMode(
    stepType: string,
    config: NumberEditorConfig | null | undefined
): "number" | "currency_whole" | "currency_decimal" {
    const isAdvancedMode = stepType === "number" && config?.mode !== undefined;
    const isCurrency = stepType === "currency";

    if (isAdvancedMode) {
        return config?.mode ?? "number";
    }
    if (isCurrency) {
        return config?.allowDecimal === false ? "currency_whole" : "currency_decimal";
    }
    return "number";
}

function toNumberCardState(stepType: string, config: NumberEditorConfig | null | undefined): NumberCardState {
    return {
        mode: getInitialMode(stepType, config),
        min: config?.min,
        max: config?.max,
        step: config?.step ?? 1,
        allowDecimal: config?.allowDecimal ?? false,
        formatOnInput: config?.formatOnInput ?? false,
    };
}

/**
 * Presentational, save-free Number/Currency settings panel (LIST2-7). Handles
 * all three number-family step shapes (easy `number`, easy `currency`,
 * advanced `number` with a `mode`) exactly as the standalone `NumberCardEditor`
 * did, but calls `onChange` with a complete config instead of mutating a step
 * — `stepType` is required (not derivable from `config` alone) because it is
 * what distinguishes the persisted `number` vs `currency` step type. A List
 * field can only be of type `number` (LIST2-7 scope), so `ListFieldSettings`
 * always passes `stepType="number"`, which fixes the mode to plain "Number"
 * exactly like the easy-mode standalone case.
 */
export function NumberSettingsSection({
    stepType,
    config,
    onChange,
}: {
    stepType: string;
    config: NumberEditorConfig | null | undefined;
    onChange: (config: NumberConfig | CurrencyConfig | NumberAdvancedConfig) => void;
}): JSX.Element {
    const { toast } = useToast();
    const isAdvancedMode = stepType === "number" && config?.mode !== undefined;
    const isCurrency = stepType === "currency";

    const [localConfig, setLocalConfig] = useState<NumberCardState>(() => toNumberCardState(stepType, config));

    useEffect(() => {
        setLocalConfig(toNumberCardState(stepType, config));
    }, [stepType, config]);

    const handleUpdate = (updates: Partial<NumberCardState>) => {
        const newConfig = { ...localConfig, ...updates };

        const validationError = validateMinMax(newConfig.min, newConfig.max);
        if (validationError && (updates.min !== undefined || updates.max !== undefined)) {
            toast({
                title: "Validation Error",
                description: validationError,
                variant: "destructive",
            });
            return;
        }

        setLocalConfig(newConfig);

        if (isAdvancedMode) {
            const configToSave: NumberAdvancedConfig = {
                mode: newConfig.mode,
                formatOnInput: newConfig.formatOnInput,
                validation: {},
            };

            if (newConfig.min !== undefined) { configToSave.validation!.min = newConfig.min; }
            if (newConfig.max !== undefined) { configToSave.validation!.max = newConfig.max; }
            if (newConfig.step !== undefined) { configToSave.validation!.step = newConfig.step; }

            if (newConfig.mode.startsWith("currency")) {
                configToSave.currency = "USD";
            }

            onChange(configToSave);
        } else if (isCurrency) {
            const configToSave: CurrencyConfig = {
                currency: "USD",
                allowDecimal: newConfig.mode === "currency_decimal",
            };

            if (newConfig.min !== undefined) { configToSave.min = newConfig.min; }
            if (newConfig.max !== undefined) { configToSave.max = newConfig.max; }

            onChange(configToSave);
        } else {
            const configToSave: NumberConfig = {
                step: newConfig.step,
                allowDecimal: newConfig.allowDecimal,
            };

            if (newConfig.min !== undefined) { configToSave.min = newConfig.min; }
            if (newConfig.max !== undefined) { configToSave.max = newConfig.max; }

            onChange(configToSave);
        }
    };

    return (
        <div className="space-y-4">
            <NumberModeSection
                mode={localConfig.mode}
                isAdvancedMode={isAdvancedMode}
                isCurrency={isCurrency}
                onModeChange={(m) => handleUpdate({ mode: m })}
            />

            <Separator />

            <NumberValidationSection
                localConfig={localConfig}
                onUpdate={handleUpdate}
                minMaxError={validateMinMax(localConfig.min, localConfig.max)}
            />

            {isAdvancedMode && (
                <>
                    <Separator />
                    <div className="space-y-4">
                        <SectionHeader
                            title="Advanced Options"
                            description="Additional formatting options"
                        />

                        <SwitchField
                            label="Format While Typing"
                            checked={localConfig.formatOnInput}
                            onChange={(val) => handleUpdate({ formatOnInput: val })}
                            description="Apply number/currency formatting as user types"
                        />
                    </div>
                </>
            )}

            <NumberPreviewSection mode={localConfig.mode} />
        </div>
    );
}
