import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dataSourceAPI } from "@/lib/vault-api";
import { useWorkflowDataSources } from "@/lib/vault-hooks";

import { QueryFilter, QueryFilterBuilder } from "./query/QueryFilterBuilder";

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

    const handleChange = <K extends keyof QueryConfig>(key: K, value: QueryConfig[K]) => {
        onChange({ ...config, [key]: value });
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
                        value={config.outputVariableName ?? ""}
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
            <QueryFilterBuilder
                filters={config.filters}
                onChange={(filters) => handleChange("filters", filters)}
            />

            {/* Sorting */}
            <div className="space-y-2">
                <Label>Sort By</Label>
                <div className="flex gap-2">
                    <Input
                        placeholder="Column Name"
                        value={config.sort?.column ?? ""}
                        onChange={(e) => handleChange("sort", {
                            column: e.target.value,
                            direction: config.sort?.direction ?? "asc"
                        } as QuerySort)}
                    />
                    <Select
                        value={config.sort?.direction ?? "asc"}
                        onValueChange={(v) => handleChange("sort", {
                            column: config.sort?.column ?? "",
                            direction: v as "asc" | "desc"
                        } as QuerySort)}
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