
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface JSBlockSettingsProps {
    name: string;
    display: "invisible" | "visible";
    outputKey: string;
    timeoutMs: number;
    onUpdate: (updates: { name?: string; display?: "invisible" | "visible"; outputKey?: string; timeoutMs?: number }) => void;
}

export function JSBlockSettings({ name, display, outputKey, timeoutMs, onUpdate }: JSBlockSettingsProps) {
    return (
        <div className="space-y-4">
            {/* Block Name/Title */}
            <div className="space-y-2">
                <Label htmlFor="blockName" className="text-sm">
                    Block Title (optional)
                </Label>
                <Input
                    id="blockName"
                    value={name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    placeholder="e.g., Calculate Total, Format Name, Validate Input"
                    className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                    Give this block a descriptive title to identify its purpose
                </p>
            </div>

            {/* Display Mode */}
            <div className="space-y-2">
                <Label className="text-sm">Display Mode</Label>
                <RadioGroup
                    value={display}
                    onValueChange={(v: "invisible" | "visible") => onUpdate({ display: v })}
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="invisible" id="display-invisible" />
                        <Label htmlFor="display-invisible" className="font-normal cursor-pointer">
                            Invisible Transform (runs in background)
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="visible" id="display-visible" />
                        <Label htmlFor="display-visible" className="font-normal cursor-pointer">
                            Visible Interactive (shows as question-like block)
                        </Label>
                    </div>
                </RadioGroup>
                {display === "visible" && (
                    <p className="text-xs text-muted-foreground pl-6">
                        Visible mode allows you to create interactive blocks that appear in the runner.
                    </p>
                )}
            </div>

            {/* Output Key */}
            <div className="space-y-2">
                <Label htmlFor="outputKey" className="text-sm">
                    Output Variable Key
                </Label>
                <Input
                    id="outputKey"
                    value={outputKey}
                    onChange={(e) => onUpdate({ outputKey: e.target.value })}
                    placeholder="e.g., computed_value, full_name, total"
                    className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                    The key under which the returned value will be stored
                </p>
            </div>

            {/* Timeout */}
            <div className="space-y-2">
                <Label htmlFor="timeout" className="text-sm">
                    Timeout (ms)
                </Label>
                <Input
                    id="timeout"
                    type="number"
                    value={timeoutMs}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        const newVal = Number.isNaN(parsed) ? 1000 : parsed;
                        onUpdate({ timeoutMs: newVal });
                    }}
                    min={100}
                    max={10000}
                    className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                    Maximum execution time in milliseconds (100-10000)
                </p>
            </div>
        </div>
    );
}
