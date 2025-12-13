import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useWorkflowDataSources } from "@/lib/vault-hooks";
import { dataSourceAPI } from "@/lib/vault-api";
import { useQuery } from "@tanstack/react-query";

interface QueryConfig {
    dataSourceId?: string;
    queryId?: string; // If using saved queries
    // For basic query builder:
    table?: string;
    outputVariableName?: string;
}

interface QueryBlockEditorProps {
    workflowId: string;
    config: QueryConfig;
    onChange: (config: QueryConfig) => void;
}

export function QueryBlockEditor({ workflowId, config, onChange }: QueryBlockEditorProps) {
    const { data: dataSources } = useWorkflowDataSources(workflowId);

    // Fetch tables when dataSourceId is selected
    const { data: tables } = useQuery({
        queryKey: ["dataSource", config.dataSourceId, "tables"],
        queryFn: () => config.dataSourceId ? dataSourceAPI.getTables(config.dataSourceId) : Promise.resolve([]),
        enabled: !!config.dataSourceId
    });

    const handleChange = (key: keyof QueryConfig, value: string) => {
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

            <div className="space-y-2">
                <Label>Output Variable Name</Label>
                <Input
                    value={config.outputVariableName || ""}
                    onChange={(e) => handleChange("outputVariableName", e.target.value)}
                    placeholder="e.g. myData"
                />
                <p className="text-xs text-muted-foreground">
                    This variable will contain the list of records found.
                </p>
            </div>

            {!config.dataSourceId && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Please select a data source.
                </div>
            )}
        </div>
    );
}
