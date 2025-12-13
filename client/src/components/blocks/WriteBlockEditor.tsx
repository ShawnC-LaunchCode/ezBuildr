import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useWorkflowDataSources } from "@/lib/vault-hooks";
import { dataSourceAPI } from "@/lib/vault-api";
import { useQuery } from "@tanstack/react-query";

interface ColumnMapping {
    columnId: string; // or name
    value: string; // variable alias
}

interface WriteConfig {
    dataSourceId?: string;
    tableId?: string;
    mode: "create" | "update";
    primaryKeyColumnId?: string;
    primaryKeyValue?: string;
    columnMappings: ColumnMapping[];
}

interface WriteBlockEditorProps {
    workflowId: string;
    config: WriteConfig;
    onChange: (config: WriteConfig) => void;
}

export function WriteBlockEditor({ workflowId, config, onChange }: WriteBlockEditorProps) {
    const { data: dataSources } = useWorkflowDataSources(workflowId);

    const { data: tables } = useQuery({
        queryKey: ["dataSource", config.dataSourceId, "tables"],
        queryFn: () => config.dataSourceId ? dataSourceAPI.getTables(config.dataSourceId) : Promise.resolve([]),
        enabled: !!config.dataSourceId
    });

    const updateConfig = (updates: Partial<WriteConfig>) => {
        onChange({ ...config, ...updates });
    };

    const addMapping = () => {
        const mappings = config.columnMappings || [];
        updateConfig({ columnMappings: [...mappings, { columnId: "", value: "" }] });
    };

    const updateMapping = (index: number, key: keyof ColumnMapping, value: string) => {
        const mappings = [...(config.columnMappings || [])];
        mappings[index] = { ...mappings[index], [key]: value };
        updateConfig({ columnMappings: mappings });
    };

    const removeMapping = (index: number) => {
        const mappings = [...(config.columnMappings || [])];
        mappings.splice(index, 1);
        updateConfig({ columnMappings: mappings });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Data Source</Label>
                    <Select
                        value={config.dataSourceId}
                        onValueChange={(val) => updateConfig({ dataSourceId: val })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                            {dataSources?.map(ds => (
                                <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select
                        value={config.mode || "create"}
                        onValueChange={(val: any) => updateConfig({ mode: val })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="create">Create New</SelectItem>
                            <SelectItem value="update">Update Existing</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Table / Collection</Label>
                <Select
                    value={config.tableId}
                    onValueChange={(val) => updateConfig({ tableId: val })}
                    disabled={!config.dataSourceId}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select table" />
                    </SelectTrigger>
                    <SelectContent>
                        {tables?.map(t => (
                            <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {config.mode === "update" && (
                <div className="p-3 bg-muted rounded-md space-y-2">
                    <Label>Row to Update (Primary Key)</Label>
                    <Input
                        placeholder="Record ID or Variable (e.g. {{step.id}})"
                        value={config.primaryKeyValue || ""}
                        onChange={(e) => updateConfig({ primaryKeyValue: e.target.value })}
                    />
                </div>
            )}

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Column Mappings</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMapping}>
                        <Plus className="w-3 h-3 mr-1" />
                        Add Field
                    </Button>
                </div>

                <div className="space-y-2">
                    {config.columnMappings?.map((mapping, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <Input
                                placeholder="Column Name"
                                value={mapping.columnId}
                                onChange={(e) => updateMapping(idx, "columnId", e.target.value)}
                                className="flex-1"
                            />
                            <span className="text-muted-foreground">=</span>
                            <Input
                                placeholder="Value / Variable"
                                value={mapping.value}
                                onChange={(e) => updateMapping(idx, "value", e.target.value)}
                                className="flex-1"
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeMapping(idx)}>
                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                    ))}
                    {(!config.columnMappings || config.columnMappings.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No fields mapped yet.</p>
                    )}
                </div>
            </div>

            {(!config.dataSourceId || !config.tableId) && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Please select a data source and table.
                </div>
            )}
            {config.mode === 'update' && !config.primaryKeyValue && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Update mode requires a Row ID to update.
                </div>
            )}
        </div>
    );
}
