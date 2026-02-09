
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TextField, NumberField, SectionHeader } from "./common/EditorField";

export interface TextCardState {
    variant: "short" | "long";
    minLength?: number;
    maxLength?: number;
    pattern: string;
    patternMessage: string;
}

export const InputTypeSection = ({
    variant,
    isEasyMode,
    onVariantChange
}: {
    variant: "short" | "long";
    isEasyMode: boolean;
    onVariantChange: (v: "short" | "long") => void;
}) => (
    <div className="space-y-3">
        <SectionHeader
            title="Input Type"
            description={isEasyMode ? "Fixed in easy mode" : "Choose input style"}
        />
        <RadioGroup
            value={variant}
            onValueChange={(v) => onVariantChange(v as "short" | "long")}
            disabled={isEasyMode}
        >
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="short" id="variant-short" disabled={isEasyMode} />
                <Label
                    htmlFor="variant-short"
                    className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
                >
                    Short Text (Single line)
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="long" id="variant-long" disabled={isEasyMode} />
                <Label
                    htmlFor="variant-long"
                    className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
                >
                    Long Text (Multi-line)
                </Label>
            </div>
        </RadioGroup>
    </div>
);

export const TextValidationSection = ({
    localConfig,
    onUpdate,
    minMaxError,
    patternError
}: {
    localConfig: TextCardState;
    onUpdate: (updates: Partial<TextCardState>) => void;
    minMaxError: string | null;
    patternError: string | null;
}) => (
    <div className="space-y-4">
        <SectionHeader
            title="Validation Rules"
            description="Optional constraints for user input"
        />

        {/* Min Length */}
        <NumberField
            label="Minimum Length"
            value={localConfig.minLength}
            onChange={(val) => onUpdate({ minLength: val })}
            placeholder="No minimum"
            description="Minimum number of characters"
            min={0}
            error={minMaxError ?? undefined}
        />

        {/* Max Length */}
        <NumberField
            label="Maximum Length"
            value={localConfig.maxLength}
            onChange={(val) => onUpdate({ maxLength: val })}
            placeholder="No maximum"
            description="Maximum number of characters"
            min={0}
            error={minMaxError ?? undefined}
        />

        {/* Pattern (Regex) */}
        <TextField
            label="Pattern (Regex)"
            value={localConfig.pattern}
            onChange={(val) => onUpdate({ pattern: val })}
            placeholder="e.g., ^[A-Z]{3}-\\d{4}$"
            description="Regular expression for advanced validation"
            error={patternError ?? undefined}
        />

        {/* Pattern Error Message */}
        {localConfig.pattern && localConfig.pattern.trim() !== "" && !patternError && (
            <TextField
                label="Custom Error Message"
                value={localConfig.patternMessage}
                onChange={(val) => onUpdate({ patternMessage: val })}
                placeholder="e.g., Must match format ABC-1234"
                description="Message shown when pattern doesn't match"
            />
        )}
    </div>
);
