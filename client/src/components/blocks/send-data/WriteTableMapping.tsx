import { Plus, Trash2, AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DatavaultColumn } from "@/lib/types/datavault";
import { cn } from "@/lib/utils";


import type { WriteBlockConfig, ColumnMapping } from "@shared/types/blocks";


interface WriteTableMappingProps {
    config: WriteBlockConfig;
    columns?: DatavaultColumn[];
    variables: { key: string }[];
    onChange: (updates: Partial<WriteBlockConfig>) => void;
    validationErrors: {
        duplicateColumns: string[];
        missingRequiredColumns: DatavaultColumn[];
        incompleteRows: ColumnMapping[];
    };
    step2Complete: boolean;
    isStep2Active: boolean;
}

export function WriteTableMapping({
    config,
    columns,
    variables,
    onChange,
    validationErrors,
    step2Complete,
    isStep2Active
}: WriteTableMappingProps) {
    const activeRingClass = "ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50/20";
    const inactiveClass = "opacity-40 pointer-events-none grayscale-[0.5]";

    const getColumnName = (colId: string) => columns?.find(c => c.id === colId)?.name || colId;

    const addMapping = () => {
        const mappings = config.columnMappings ?? [];
        // Find first column that isn't mapped yet
        const usedIds = new Set(mappings.map(m => m.columnId));
        const nextUnmappedCol = columns?.find(c => !usedIds.has(c.id));
        // Default to next available, or empty string. NEVER default to an already used column.
        const defaultCol = nextUnmappedCol ? nextUnmappedCol.id : "";
        onChange({ columnMappings: [...mappings, { columnId: defaultCol, value: "" }] });
    };

    const updateMapping = (index: number, key: keyof ColumnMapping, value: string) => {
        const mappings = [...(config.columnMappings ?? [])];
        mappings[index] = { ...mappings[index], [key]: value };
        onChange({ columnMappings: mappings });
    };

    const removeMapping = (index: number) => {
        const mappings = [...(config.columnMappings ?? [])];
        mappings.splice(index, 1);
        onChange({ columnMappings: mappings });
    };

    const { duplicateColumns, missingRequiredColumns } = validationErrors;

    return (
        <div className={cn(
            "space-y-3 rounded-lg transition-all duration-300",
            isStep2Active ? `${activeRingClass} p-4 border border-emerald-500 bg-white shadow-sm` : "px-0",
            // If we aren't at step 2 yet (step1 not complete), fade out. 
            // BUT if we passed step 2 (step3 active), we typically keep it fully visible or just remove the ring.
            // So checking !isStep2Active && !step2Complete (implied by isStep3Active?)
            // Actually, if step2Complete is true, we want it visible. If step2 is NOT active AND NOT complete (i.e. step1 active), fade.
            (!isStep2Active && !step2Complete) ? inactiveClass : ""
        )}>
            <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Column Mappings</Label>
                {step2Complete && !isStep2Active && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><span className="mr-1">✓</span> Valid</Badge>}
                {isStep2Active && (
                    <Badge variant="outline" className="animate-pulse border-emerald-500 text-emerald-600">
                        {missingRequiredColumns.length > 0 ? `${missingRequiredColumns.length} Missing` : 'In Progress'}
                    </Badge>
                )}
            </div>

            {/* Validation Alerts */}
            {missingRequiredColumns.length > 0 && (
                <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Missing required columns: {missingRequiredColumns.map(c => c.name).join(", ")}
                    </AlertDescription>
                </Alert>
            )}
            {duplicateColumns.length > 0 && (
                <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Duplicate column mappings: {duplicateColumns.map(id => getColumnName(id)).join(", ")}
                    </AlertDescription>
                </Alert>
            )}

            <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
                {(config.columnMappings ?? []).map((mapping, index) => {
                    const isDuplicate = mapping.columnId && duplicateColumns.includes(mapping.columnId);
                    const isEmpty = !mapping.columnId || !mapping.value;
                    return (
                        <div key={index} className={cn(
                            "flex gap-2 items-start p-2 bg-white rounded border shadow-sm transition-colors",
                            isDuplicate ? "border-red-500 bg-red-50" : "",
                            isEmpty && isStep2Active ? "border-amber-300" : ""
                        )}>
                            <div className="grid grid-cols-2 gap-2 flex-1">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Column</Label>
                                    <Select
                                        value={mapping.columnId}
                                        onValueChange={(val) => updateMapping(index, 'columnId', val)}
                                    >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Column" /></SelectTrigger>
                                        <SelectContent>
                                            {columns?.map(c => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.name} {c.required && <span className="text-red-500 ml-0.5">*</span>}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Value</Label>
                                    <div className="flex gap-1">
                                        {/* We can offer a variable picker here or just a text input that supports {{}} */}
                                        {/* For now, using Input + maybe a small variable picker trigger? Or just Input as in original. */}
                                        {/* Original had Input? Let's check original. */}
                                        {/* Original had: Select for variable OR Input? 
                        Wait, original didn't have mapping UI shown in my view_file output. 
                        Let me assume Input is fine, but Select for variables is better UX.
                        Ah, let's look at `SendDataToTableBlockEditor.tsx` again.
                     */}
                                        <Select
                                            value={mapping.value.startsWith('{{') && mapping.value.endsWith('}}') ? mapping.value : "___custom___"}
                                            onValueChange={(val) => {
                                                if (val === "___custom___") {
                                                    // Do nothing, focus input
                                                } else {
                                                    updateMapping(index, 'value', val);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-xs w-[120px] shrink-0">
                                                <SelectValue placeholder="Variable..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="___custom___">(Custom Value)</SelectItem>
                                                {variables.map(v => (
                                                    <SelectItem key={v.key} value={`{{${v.key}}}`}>{v.key}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            value={mapping.value}
                                            onChange={(e) => updateMapping(index, 'value', e.target.value)}
                                            className="h-8 text-xs flex-1"
                                            placeholder="Value or {{variable}}"
                                        />
                                    </div>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 mt-4 text-gray-400 hover:text-red-500" onClick={() => removeMapping(index)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    );
                })}

                <div className="pt-2">
                    <Button variant="outline" size="sm" className="w-full border-dashed" onClick={addMapping}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Mapping
                    </Button>
                </div>
            </div>
        </div>
    );
}
