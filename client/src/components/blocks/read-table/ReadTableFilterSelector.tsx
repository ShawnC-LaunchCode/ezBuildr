import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DatavaultColumn } from "@/lib/types/datavault";

import type { ReadTableConfig, ReadTableOperator, ReadTableFilter } from "@shared/types/blocks";

interface ReadTableFilterSelectorProps {
    config: ReadTableConfig;
    columns?: DatavaultColumn[];
    onChange: (updates: Partial<ReadTableConfig>) => void;
}

export function ReadTableFilterSelector({ config, columns, onChange }: ReadTableFilterSelectorProps) {
    const handleUpdateFilter = (index: number, updates: Partial<ReadTableFilter>) => {
        const newFilters = [...(config.filters ?? [])];
        if (newFilters[index]) {
            newFilters[index] = { ...newFilters[index], ...updates };
            onChange({ filters: newFilters });
        }
    };

    const handleRemoveFilter = (index: number) => {
        const newFilters = [...(config.filters ?? [])];
        newFilters.splice(index, 1);
        onChange({ filters: newFilters });
    };

    const handleAddFilter = () => {
        onChange({ filters: [...(config.filters ?? []), { columnId: '', operator: 'equals', value: '' }] });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">Filters</h3>
                <Badge variant="outline">{config.filters?.length || 0}</Badge>
            </div>
            <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
                {(config.filters ?? []).map((filter, index) => (
                    <div key={index} className="flex gap-2 items-start p-2 bg-white rounded border shadow-sm">
                        <div className="grid grid-cols-3 gap-2 flex-1">
                            <Select
                                value={filter.columnId || "_clear"}
                                onValueChange={(val) => {
                                    const newFilters = [...(config.filters ?? [])];
                                    if (val === '_clear') {
                                        // Keep index but reset
                                        newFilters[index] = { columnId: '', operator: 'equals', value: '' };
                                        onChange({ filters: newFilters });
                                    } else {
                                        handleUpdateFilter(index, { columnId: val });
                                    }
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Column" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_clear" className="text-muted-foreground italic">None</SelectItem>
                                    {columns?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>

                            <Select
                                value={filter.operator}
                                onValueChange={(val: ReadTableOperator) => handleUpdateFilter(index, { operator: val })}
                            >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                    <SelectItem value="greater_than">Greater Than</SelectItem>
                                    <SelectItem value="less_than">Less Than</SelectItem>
                                </SelectContent>
                            </Select>

                            <Input
                                value={filter.value}
                                onChange={(e) => handleUpdateFilter(index, { value: e.target.value })}
                                className="h-8 text-xs"
                                placeholder="Value..."
                            />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500" onClick={() => handleRemoveFilter(index)}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
                <Button variant="outline" size="sm" className="w-full border-dashed" onClick={handleAddFilter}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Filter
                </Button>
            </div>
        </div>
    );
}
