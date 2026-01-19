import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import React, {   } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources } from "@/lib/vault-hooks";
interface QueryFilter {
    column: string;
    operator: string;
    value: string;
}
interface QuerySort {
    column: string;
    direction: "asc" | "desc";
}
interface QueryConfig {
    dataSourceId?: string;
    queryId?: string;
    table?: string;
    outputVariableName?: string;
    filters?: QueryFilter[];
    sort?: QuerySort;
}
interface QueryBlockEditorProps {
    workflowId: string;
    config: QueryConfig;
    onChange: (config: QueryConfig) => void;
}
export function QueryBlockEditor({ workflowId, config, onChange }: QueryBlockEditorProps) {
    const { data: dataSources } = useWorkflowDataSources(workflowId);
    // Fetch tables
    const { data: tables } = useQuery({
        queryKey: ["dataSource", config.dataSourceId, "tables"],
        queryFn: () => config.dataSourceId ? dataSourceAPI.getTables(config.dataSourceId) : Promise.resolve([]),
        enabled: !!config.dataSourceId
    });
    const handleChange = (key: keyof QueryConfig, value: any) => {
        onChange({ ...config, [key]: value });
    };
    const addFilter = () => {
        const filters = config.filters || [];
        handleChange("filters", [...filters, { column: "", operator: "equals", value: "" }]);
    };
    const removeFilter = (index: number) => {
        const filters = config.filters || [];
        handleChange("filters", filters.filter((_, i) => i !== index));
    };
    const updateFilter = (index: number, field: keyof QueryFilter, value: string) => {
        const filters = config.filters || [];
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], [field]: value };
        handleChange("filters", newFilters);
    };
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Data Source</Label>
                <Select
                    value={config.dataSourceId}
                    onValueChange={(val) => handleChange("dataSourceId", val)}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select a data source" />
                    </SelectTrigger>
                    <SelectContent>
                        {dataSources?.map(ds => (
                            <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label>Table / Collection</Label>
                <Select
                    value={config.table}
                    onValueChange={(val) => handleChange("table", val)}
                    disabled={!config.dataSourceId}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select a table" />
                    </SelectTrigger>
                    <SelectContent>
                        {tables?.map(t => (
                            <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {/* Output Variable */}
            <div className="space-y-2">
                <Label>Output List Variable</Label>
                <div className="flex items-center gap-2">
                    <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-mono">List&lt;Row&gt;</div>
                    <Input
                        value={config.outputVariableName || ""}
                        onChange={(e) => handleChange("outputVariableName", e.target.value)}
                        placeholder="e.g. usersList"
                        className="font-mono"
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    This variable can be used in Dropdowns or Logic (e.g., <code>usersList.length</code>).
                </p>
            </div>
            {/* Filters */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Filters</Label>
                    <Button variant="ghost" size="sm" onClick={addFilter} type="button">
                        <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                </div>
                {config.filters?.map((filter, idx) => (
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
                {(!config.filters || config.filters.length === 0) && (
                    <p className="text-xs text-muted-foreground italic">No filters applied (select all).</p>
                )}
            </div>
            {/* Sorting */}
            <div className="space-y-2">
                <Label>Sort By</Label>
                <div className="flex gap-2">
                    <Input
                        placeholder="Column Name"
                        value={config.sort?.column || ""}
                        onChange={(e) => handleChange("sort", { ...config.sort, column: e.target.value })}
                    />
                    <Select
                        value={config.sort?.direction || "asc"}
                        onValueChange={(v: "asc" | "desc") => handleChange("sort", { ...config.sort, direction: v })}
                    >
                        <SelectTrigger className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="asc">ASC</SelectItem>
                            <SelectItem value="desc">DESC</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {!config.dataSourceId && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Please select a data source.
                </div>
            )}
        </div>
    );
}