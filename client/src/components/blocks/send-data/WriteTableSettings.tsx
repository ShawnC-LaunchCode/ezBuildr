import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { WriteBlockConfig } from "@shared/types/blocks";

interface WriteTableSettingsProps {
    config: WriteBlockConfig;
    phase: string;
    order: number;
    enabled: boolean;
    onChange: (updates: Partial<WriteBlockConfig>) => void;
    onPhaseChange: (phase: string) => void;
    onOrderChange: (order: number) => void;
    onEnabledChange: (enabled: boolean) => void;
}

export function WriteTableSettings({
    config,
    phase,
    order,
    enabled,
    onChange,
    onPhaseChange,
    onOrderChange,
    onEnabledChange
}: WriteTableSettingsProps) {
    return (
        <div className="space-y-4">
            <h3 className="font-semibold mb-4">Write Settings</h3>

            {/* Mode */}
            <div className="space-y-2">
                <Label>Write Mode</Label>
                <Select value={config.mode || "create"} onValueChange={(val: "create" | "update" | "upsert") => onChange({ mode: val })}>
                    <SelectTrigger className="bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="create">Create New Row</SelectItem>
                        <SelectItem value="update">Update Existing Row</SelectItem>
                        <SelectItem value="upsert">Upsert (Update or Create)</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {config.mode === 'create' && "Creates a new row. Requires all mandatory fields."}
                    {config.mode === 'update' && "Updates a row found by the match criteria. Fails if not found."}
                    {config.mode === 'upsert' && "Updates if found, otherwise creates new."}
                </p>
            </div>

            {/* Output Key */}
            <div className="space-y-2">
                <Label>Output Variable (Row ID)</Label>
                <Input
                    value={config.outputKey ?? ""}
                    onChange={(e) => onChange({ outputKey: e.target.value })}
                    placeholder="e.g. created_user_id"
                    className="font-mono bg-white"
                />
                <p className="text-[11px] text-muted-foreground">
                    Optional: Store the ID of the affected row in this variable.
                </p>
            </div>

            <div className="h-px bg-gray-100 my-4" />

            {/* Execution Phase */}
            <div className="space-y-2">
                <Label>When to Run</Label>
                <Select value={phase || "onSectionSubmit"} onValueChange={onPhaseChange}>
                    <SelectTrigger className="bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="onRunStart">On Run Start</SelectItem>
                        <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                        <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                        <SelectItem value="onNext">On Next</SelectItem>
                        <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Order */}
            <div className="space-y-2">
                <Label>Order</Label>
                <Input
                    type="number"
                    value={order}
                    onChange={(e) => onOrderChange(Number(e.target.value))}
                    className="bg-white"
                />
            </div>

            {/* Enabled */}
            <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => onEnabledChange(e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">Enabled</span>
                </label>
            </div>
        </div>
    );
}
