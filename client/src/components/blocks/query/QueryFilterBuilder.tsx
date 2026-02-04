
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface QueryFilter {
    column: string;
    operator: string;
    value: string;
}

interface QueryFilterBuilderProps {
    filters?: QueryFilter[];
    onChange: (filters: QueryFilter[]) => void;
}

export function QueryFilterBuilder({ filters, onChange }: QueryFilterBuilderProps) {
    const addFilter = () => {
        const currentFilters = filters ?? [];
        onChange([...currentFilters, { column: "", operator: "equals", value: "" }]);
    };

    const removeFilter = (index: number) => {
        const currentFilters = filters ?? [];
        onChange(currentFilters.filter((_, i) => i !== index));
    };

    const updateFilter = (index: number, field: keyof QueryFilter, value: string) => {
        const currentFilters = filters ?? [];
        const newFilters = [...currentFilters];
        newFilters[index] = { ...newFilters[index], [field]: value };
        onChange(newFilters);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Filters</Label>
                <Button variant="ghost" size="sm" onClick={addFilter} type="button">
                    <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
            </div>
            {filters?.map((filter, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                    <Input
                        placeholder="Column"
                        className="h-8 text-xs"
                        value={filter.column}
                        onChange={(e) => updateFilter(idx, "column", e.target.value)}
                    />
                    <Select value={filter.operator} onValueChange={(v) => updateFilter(idx, "operator", v)}>
                        <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="equals">=</SelectItem>
                            <SelectItem value="contains">contains</SelectItem>
                            <SelectItem value="gt">&gt;</SelectItem>
                            <SelectItem value="lt">&lt;</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Value"
                        className="h-8 text-xs"
                        value={filter.value}
                        onChange={(e) => updateFilter(idx, "value", e.target.value)}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFilter(idx)}>
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            ))}
            {(!filters || filters.length === 0) && (
                <p className="text-xs text-muted-foreground italic">No filters applied (select all).</p>
            )}
        </div>
    );
}
