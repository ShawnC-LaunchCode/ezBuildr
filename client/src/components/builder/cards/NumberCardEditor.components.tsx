
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SectionHeader, NumberField } from "./common/EditorField";

export interface NumberCardState {
    mode: "number" | "currency_whole" | "currency_decimal";
    min?: number;
    max?: number;
    step: number;
    allowDecimal: boolean;
    formatOnInput: boolean;
}

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
