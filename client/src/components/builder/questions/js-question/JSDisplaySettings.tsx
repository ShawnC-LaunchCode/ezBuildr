
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { JSQuestionConfig } from "./types";

interface JSDisplaySettingsProps {
    config: JSQuestionConfig;
    onChange: (updates: Partial<JSQuestionConfig>) => void;
    // Use onBlur to sync local state to parent if needed, but here we usually update directly on blur or change
    // In the original, onChange updated local state, onBlur committed.
    // We can pass a "commit" handler or just pass onChange that commits.
    // The original pattern was: local state in parent, synced on blur.
    // Let's accept current value and commit handler.
    elementId: string;
}

export function JSDisplaySettings({ config, onChange, elementId }: JSDisplaySettingsProps) {

    const handleDisplayChange = (value: string) => {
        onChange({ display: value as "visible" | "hidden" });
    };

    const handleTimeoutChange = (value: string) => {
        const val = parseInt(value);
        onChange({ timeoutMs: isNaN(val) ? 1000 : val });
    };

    return (
        <div className="space-y-4">
            {/* Display Mode */}
            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-display-${elementId}`} className="text-xs text-muted-foreground">
                    Display Mode
                </Label>
                <Select
                    value={config.display}
                    onValueChange={handleDisplayChange}
                >
                    <SelectTrigger id={`frame-js-display-${elementId}`} className="h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hidden">Hidden (compute only)</SelectItem>
                        <SelectItem value="visible">Visible (interactive)</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground pl-1">
                    {config.display === "hidden"
                        ? "Runs as background computation, no UI shown"
                        : "Shows help text in runner, but still computes automatically"}
                </p>
            </div>

            {/* Timeout */}
            <div className="space-y-1.5">
                <Label htmlFor={`frame-js-timeout-${elementId}`} className="text-xs text-muted-foreground">
                    Timeout (ms)
                </Label>
                <Input
                    id={`frame-js-timeout-${elementId}`}
                    type="number"
                    value={config.timeoutMs ?? 1000}
                    onChange={(e) => handleTimeoutChange(e.target.value)}
                    min={100}
                    max={3000}
                    className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground pl-1">
                    Execution timeout (100-3000ms)
                </p>
            </div>

            {/* Help Text (shown when display = visible) */}
            {config.display === "visible" && (
                <div className="space-y-1.5">
                    <Label htmlFor={`frame-js-help-${elementId}`} className="text-xs text-muted-foreground">
                        Help Text (optional)
                    </Label>
                    <Textarea
                        id={`frame-js-help-${elementId}`}
                        value={config.helpText ?? ""}
                        onChange={(e) => onChange({ helpText: e.target.value })}
                        placeholder="Optional text to show in the runner..."
                        rows={2}
                        className="text-sm resize-none"
                    />
                </div>
            )}
        </div>
    );
}
