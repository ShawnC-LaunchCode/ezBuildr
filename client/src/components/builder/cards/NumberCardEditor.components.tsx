
import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import {
    resolveNumberConfig,
    type NumberConfig,
    type CurrencyConfig,
    type NumberAdvancedConfig,
    type NumberCanonicalConfig,
    type NumberValidation,
} from "@shared/types/stepConfigs";

import { formatCurrencyForDisplay, getCurrencyFractionDigits } from "../../runner/blocks/numberFormat";

import { SectionHeader, NumberField, SwitchField, TextField } from "./common/EditorField";

export interface NumberCardState {
    mode: "number" | "currency_whole" | "currency_decimal";
    min?: number;
    max?: number;
    step: number;
    allowDecimal: boolean;
    /** Group thousands in the displayed value (display only, STB-9). */
    thousandsSeparator: boolean;
    /** Group while typing too, rather than only once the field blurs. */
    formatOnInput: boolean;
    prefix: string;
    suffix: string;
    currency: string;
}

/** Union of every shape `step.config`/`field.config` may hold for a number-family step type. */
export type NumberEditorConfig = Partial<NumberConfig & CurrencyConfig & NumberAdvancedConfig>;

export const NumberModeSection = ({
    mode,
    modeEditable,
    onModeChange
}: {
    mode: string;
    modeEditable: boolean;
    onModeChange: (val: "number" | "currency_whole" | "currency_decimal") => void;
}) => (
    <div className="space-y-3">
        <SectionHeader
            title="Number Type"
            description={modeEditable ? "Choose number format" : mode === "number" ? "Fixed as number" : "Fixed as currency"}
        />

        <div className="space-y-2">
            <Label className="text-sm font-medium">Display Mode</Label>
            <Select
                value={mode}
                onValueChange={(val) => onModeChange(val as "number" | "currency_whole" | "currency_decimal")}
                disabled={!modeEditable}
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

        {!modeEditable && (
            <p className="text-xs text-muted-foreground">
                Mode is fixed in Easy mode
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
            step={localConfig.mode === "currency_decimal"
                ? 10 ** -getCurrencyFractionDigits({ mode: localConfig.mode, currency: localConfig.currency })
                : 1}
        />

        {/* Max */}
        <NumberField
            label="Maximum Value"
            value={localConfig.max}
            onChange={(val) => onUpdate({ max: val })}
            placeholder="No maximum"
            description="Largest allowed value"
            error={minMaxError ?? undefined}
            step={localConfig.mode === "currency_decimal"
                ? 10 ** -getCurrencyFractionDigits({ mode: localConfig.mode, currency: localConfig.currency })
                : 1}
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

/**
 * One stored shape for the whole number family (STB-9). Easy and Advanced
 * differ only in which of these the author can see, never in what is written.
 *
 * Extracted from the component so the save path stays a single expression --
 * inlining it pushed `NumberSettingsSection` past the cognitive-complexity
 * limit.
 */
export function buildCanonicalNumberConfig(state: NumberCardState): NumberCanonicalConfig {
    const validation: NumberValidation = {};
    if (state.min !== undefined) { validation.min = state.min; }
    if (state.max !== undefined) { validation.max = state.max; }
    if (state.mode === "number" && state.step !== undefined) { validation.step = state.step; }
    if (state.mode === "number" && !state.allowDecimal) { validation.precision = 0; }

    const config: NumberCanonicalConfig = { mode: state.mode };
    if (Object.keys(validation).length > 0) { config.validation = validation; }
    if (state.mode !== "number") {
        config.currency = state.currency;
        config.thousandsSeparator = true;
        return config;
    }
    if (state.thousandsSeparator) { config.thousandsSeparator = true; }
    // Live grouping is meaningless without grouping, and the schema rejects the
    // pair -- never save one without the other.
    if (state.thousandsSeparator && state.formatOnInput) { config.formatOnInput = true; }
    if (state.prefix.trim() !== "") { config.prefix = state.prefix; }
    if (state.suffix.trim() !== "") { config.suffix = state.suffix; }
    return config;
}

/**
 * Advanced-only display settings for the canonical `number` type (STB-9).
 *
 * Every control here changes presentation only; the stored answer stays
 * `number | null`. Prefix/suffix are plain-number decorations -- currency
 * symbols and fraction rules belong to ISO formatting in STB-10, not here.
 */
export const NumberDisplaySection = ({
    config,
    onChange,
}: {
    config: NumberCanonicalConfig;
    onChange: (updates: Partial<NumberCanonicalConfig>) => void;
}) => (
    <div className="space-y-4">
        <SectionHeader
            title="Display"
            description="Changes how the answer looks, never what is stored"
        />
        <SwitchField
            label="Group thousands"
            description="Show 1,234,567 instead of 1234567"
            checked={config.thousandsSeparator ?? false}
            onChange={(checked) => onChange({ thousandsSeparator: checked })}
        />
        {config.thousandsSeparator === true && (
            <SwitchField
                label="Group while typing"
                description="Otherwise grouping is applied when the field loses focus"
                checked={config.formatOnInput ?? false}
                onChange={(checked) => onChange({ formatOnInput: checked })}
            />
        )}
        <TextField
            label="Prefix"
            value={config.prefix ?? ""}
            onChange={(value) => onChange({ prefix: value })}
            placeholder="#"
            description="Shown before the number, e.g. #"
        />
        <TextField
            label="Suffix"
            value={config.suffix ?? ""}
            onChange={(value) => onChange({ suffix: value })}
            placeholder="kg"
            description="Shown after the number, e.g. kg or %"
        />
    </div>
);

export const NumberPreviewSection = ({ mode, currency }: { mode: NumberCardState["mode"]; currency: string }) => (
    <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {mode === "number" ? (
            <p className="text-sm font-mono">12345</p>
        ) : (
            <p className="text-sm font-mono">
                {formatCurrencyForDisplay(12345.67, { mode, currency })}
            </p>
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
    // Every stored number dialect -- canonical, the retired root shape, and
    // `number_advanced` -- is read through the one resolver (STB-9), so the
    // editor loads the same values the runner and the server will use.
    const canonical = resolveNumberConfig(stepType, config);
    return {
        mode: getInitialMode(stepType, config),
        min: canonical.validation?.min,
        max: canonical.validation?.max,
        step: canonical.validation?.step ?? 1,
        allowDecimal: canonical.validation?.precision !== 0,
        thousandsSeparator: canonical.thousandsSeparator ?? false,
        formatOnInput: canonical.formatOnInput ?? false,
        prefix: canonical.prefix ?? "",
        suffix: canonical.suffix ?? "",
        currency: canonical.currency ?? "USD",
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
    modeEditable = false,
    onChange,
}: {
    stepType: string;
    config: NumberEditorConfig | null | undefined;
    modeEditable?: boolean;
    onChange: (config: NumberConfig | CurrencyConfig | NumberAdvancedConfig) => void;
}): JSX.Element {
    const { toast } = useToast();
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

        onChange(buildCanonicalNumberConfig(newConfig));
    };

    return (
        <div className="space-y-4">
            <NumberModeSection
                mode={localConfig.mode}
                modeEditable={modeEditable}
                onModeChange={(m) => handleUpdate({ mode: m })}
            />

            <Separator />

            <NumberValidationSection
                localConfig={localConfig}
                onUpdate={handleUpdate}
                minMaxError={validateMinMax(localConfig.min, localConfig.max)}
            />

            {modeEditable && localConfig.mode !== "number" && (
                <>
                    <Separator />
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Currency</Label>
                        <Select
                            value={localConfig.currency}
                            onValueChange={(currency) => handleUpdate({ currency })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD — US Dollar</SelectItem>
                                <SelectItem value="EUR">EUR — Euro</SelectItem>
                                <SelectItem value="GBP">GBP — British Pound</SelectItem>
                                <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                                <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                                <SelectItem value="JPY">JPY — Japanese Yen</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}

            {modeEditable && localConfig.mode === "number" && (
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

            <NumberPreviewSection mode={localConfig.mode} currency={localConfig.currency} />
        </div>
    );
}
