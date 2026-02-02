import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DatavaultColumn } from "@/lib/types/datavault";

import type { ReadTableConfig } from "@shared/types/blocks";

interface ReadTableSettingsProps {
    config: ReadTableConfig;
    columns?: DatavaultColumn[];
    phase: string;
    order: number;
    enabled: boolean;
    onChange: (updates: Partial<ReadTableConfig>) => void;
    onPhaseChange: (phase: string) => void;
    onOrderChange: (order: number) => void;
    onEnabledChange: (enabled: boolean) => void;
}

export function ReadTableSettings({
    config,
    columns,
    phase,
    order,
    enabled,
    onChange,
    onPhaseChange,
    onOrderChange,
    onEnabledChange
}: ReadTableSettingsProps) {
    return (
        <div className="space-y-4">
            <h3 className="font-semibold mb-4">Query Settings</h3>

            {/* Sorting */}
            <div className="space-y-2">
                <Label>Sort By</Label>
                <div className="flex gap-2">
                    <Select
                        value={config.sort?.columnId || "none"}
                        onValueChange={(val) => {
                            if (val === 'none') {
                                onChange({ sort: undefined });
                            } else {
                                onChange({ sort: { columnId: val, direction: config.sort?.direction || 'asc' } });
                            }
                        }}
                    >
                        <SelectTrigger className="bg-white flex-1">
                            <SelectValue placeholder="No sorting" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {columns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    {config.sort && (
                        <Select
                            value={config.sort.direction}
                            onValueChange={(val: 'asc' | 'desc') => {
                                if (config.sort) {
                                    onChange({ sort: { ...config.sort, direction: val } });
                                }
                            }}
                        >
                            <SelectTrigger className="w-[100px] bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="asc">Asc</SelectItem>
                                <SelectItem value="desc">Desc</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Limit */}
            <div className="space-y-2">
                <Label>Row Limit</Label>
                <Input
                    type="number"
                    value={config.limit || 100}
                    onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
                    className="bg-white"
                />
                <p className="text-xs text-muted-foreground">Max rows to fetch (default 100).</p>
            </div>

            <div className="h-px bg-gray-100 my-4" />

            {/* Execution Phase */}
            <div className="space-y-2">
                <Label>When to Run</Label>
                <Select value={phase || "onRunStart"} onValueChange={onPhaseChange}>
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
