
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiWorkflowVariable } from "@/lib/vault-api";

export interface PayloadMapping {
    key: string;
    value: string;
}

interface PayloadMappingEditorProps {
    mappings: PayloadMapping[];
    onChange: (mappings: PayloadMapping[]) => void;
    variables: ApiWorkflowVariable[];
}

export function PayloadMappingEditor({ mappings, onChange, variables }: PayloadMappingEditorProps) {
    const addMapping = (): void => {
        const newMappings = mappings ?? [];
        onChange([...newMappings, { key: "", value: "" }]);
    };

    const updateMapping = (index: number, key: keyof PayloadMapping, value: string): void => {
        const newMappings = [...(mappings ?? [])];
        newMappings[index] = { ...newMappings[index], [key]: value };
        onChange(newMappings);
    };

    const removeMapping = (index: number): void => {
        const newMappings = [...(mappings ?? [])];
        newMappings.splice(index, 1);
        onChange(newMappings);
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label>Payload Mappings</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMapping}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Field
                </Button>
            </div>
            <div className="space-y-2">
                {mappings?.map((mapping, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                        <Input
                            placeholder="Field name"
                            value={mapping.key}
                            onChange={(e) => updateMapping(idx, "key", e.target.value)}
                            className="flex-1"
                        />
                        <span className="text-muted-foreground">=</span>
                        {/* Variable Select for Mapping Value */}
                        <div className="flex-1 min-w-0">
                            <Select
                                value={mapping.value}
                                onValueChange={(val) => updateMapping(idx, "value", val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select value...">
                                        {mapping.value?.startsWith('system:') ? (
                                            <span className="text-xs">
                                                {mapping.value === 'system:current_date' && '📅 Current Date'}
                                                {mapping.value === 'system:current_time' && '🕐 Current Time'}
                                                {mapping.value === 'system:current_datetime' && '📅 Current Date & Time'}
                                            </span>
                                        ) : (
                                            <span className="font-mono text-xs">{mapping.value}</span>
                                        )}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {/* System Values */}
                                    <SelectItem value="system:current_date">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs">📅 Current Date</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="system:current_time">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs">🕐 Current Time</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="system:current_datetime">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs">📅 Current Date & Time</span>
                                        </div>
                                    </SelectItem>
                                    {variables.length > 0 && <hr className="my-1" />}
                                    {/* Workflow Variables */}
                                    {variables.map(v => (
                                        <SelectItem key={v.key} value={v.alias ?? v.key}>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs">{v.alias ?? v.key}</span>
                                                {v.label && <span className="text-muted-foreground text-xs font-normal">({v.label})</span>}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeMapping(idx)}>
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                    </div>
                ))}
                {(mappings === null || mappings === undefined || mappings.length === 0) && (
                    <p className="text-sm text-muted-foreground italic">Empty payload (sending {"{}"}).</p>
                )}
            </div>
        </div>
    );
}
