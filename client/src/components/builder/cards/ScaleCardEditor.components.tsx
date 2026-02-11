
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { TextField, NumberField, SectionHeader } from "./common/EditorField";

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
