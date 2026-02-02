import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { DatavaultColumn } from "@/lib/types/datavault";

import type { ReadTableConfig } from "@shared/types/blocks";

interface ReadTableColumnSelectorProps {
    config: ReadTableConfig;
    columns?: DatavaultColumn[];
    onChange: (updates: Partial<ReadTableConfig>) => void;
}

export function ReadTableColumnSelector({ config, columns, onChange }: ReadTableColumnSelectorProps) {
    const isAllSelected = config.columns === undefined || config.columns === null;

    const handleAllColsChange = (checked: boolean) => {
        if (checked) {
            // Explicitly set columns to null to clear it from database
            onChange({ columns: null, totalColumnCount: columns?.length ?? 0 });
        } else {
            // Default to all selected when switching to manual mode
            onChange({ columns: columns?.map(c => c.id) ?? [], totalColumnCount: columns?.length ?? 0 });
        }
    };

    const handleColumnToggle = (colId: string, checked: boolean) => {
        const current = config.columns ?? [];
        let next: string[];
        if (checked) {
            next = [...current, colId];
        } else {
            next = current.filter(id => id !== colId);
        }
        onChange({ columns: next });
    };

    return (
        <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                    <input
                        type="checkbox"
                        id="all-cols"
                        className="rounded border-gray-300"
                        checked={isAllSelected}
                        onChange={(e) => handleAllColsChange(e.target.checked)}
                    />
                    <Label htmlFor="all-cols" className="font-medium cursor-pointer">
                        Read All Columns
                    </Label>
                </div>
                <Badge variant="outline">
                    {isAllSelected ? `All (${columns?.length ?? 0})` : config.columns?.length}
                </Badge>
            </div>

            {/* Individual Columns List */}
            {!isAllSelected && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {columns?.map((col) => {
                        const isSelected = config.columns?.includes(col.id);
                        return (
                            <div key={col.id} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`col-${col.id}`}
                                    className="rounded border-gray-300"
                                    checked={isSelected}
                                    onChange={(e) => handleColumnToggle(col.id, e.target.checked)}
                                />
                                <Label htmlFor={`col-${col.id}`} className="text-sm font-normal cursor-pointer truncate" title={col.name}>
                                    {col.name}
                                </Label>
                            </div>
                        );
                    })}
                </div>
            )}

            {isAllSelected && (
                <div className="py-4 text-center text-xs text-muted-foreground italic">
                    Retrieving all ({columns?.length ?? 0}) fields.
                </div>
            )}
        </div>
    );
}
