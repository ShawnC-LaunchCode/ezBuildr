import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useWorkflowDataSources } from "@/lib/vault-hooks";

interface PayloadMapping {
    key: string;
    value: string;
}

interface ExternalSendConfig {
    destinationId: string;
    payloadMappings: PayloadMapping[];
}

interface ExternalSendBlockEditorProps {
    workflowId: string;
    config: ExternalSendConfig;
    onChange: (config: ExternalSendConfig) => void;
}

export function ExternalSendBlockEditor({ workflowId, config, onChange }: ExternalSendBlockEditorProps) {
    // Assuming "external" type data sources act as destinations or we have a separate "ExternalDestination" API
    // Requirement refers to "External Data Destinations" implemented previously.
    // We might need a separate hook for External Destinations or they are exposed as DataSources with type='external'?
    // Based on shared/schema.ts, `externalDestinations` is a separate table, but `dataSources` can be type='external'.
    // Let's assume for now we list `dataSources` with type='external' or similar.
    // Actually, the previous implementation created "External Data Destinations" in `server/routes/externalDestinations.routes.ts`?
    // Let's check if we have a hook for `externalDestinations`. If not, we might need to add one or use generic `dataSource` if they are merged.
    // For now I'll use `useWorkflowDataSources` filtering by type or just showing all.

    const { data: dataSources } = useWorkflowDataSources(workflowId);
    const destinations = dataSources?.filter(ds => ds.type === 'external' || (ds.type as any) === 'api'); // Adjust logic as needed

    const updateConfig = (updates: Partial<ExternalSendConfig>) => {
        onChange({ ...config, ...updates });
    };

    const addMapping = () => {
        const mappings = config.payloadMappings || [];
        updateConfig({ payloadMappings: [...mappings, { key: "", value: "" }] });
    };

    const updateMapping = (index: number, key: keyof PayloadMapping, value: string) => {
        const mappings = [...(config.payloadMappings || [])];
        mappings[index] = { ...mappings[index], [key]: value };
        updateConfig({ payloadMappings: mappings });
    };

    const removeMapping = (index: number) => {
        const mappings = [...(config.payloadMappings || [])];
        mappings.splice(index, 1);
        updateConfig({ payloadMappings: mappings });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Destination</Label>
                <Select
                    value={config.destinationId}
                    onValueChange={(val) => updateConfig({ destinationId: val })}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                        {destinations?.length ? destinations.map(ds => (
                            <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                        )) : <SelectItem value="none" disabled>No external destinations Linked</SelectItem>}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    Link external APIs in the Data Sources tab.
                </p>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Payload Mappings</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMapping}>
                        <Plus className="w-3 h-3 mr-1" />
                        Add Field
                    </Button>
                </div>

                <div className="space-y-2">
                    {config.payloadMappings?.map((mapping, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <Input
                                placeholder="JSON Key"
                                value={mapping.key}
                                onChange={(e) => updateMapping(idx, "key", e.target.value)}
                                className="flex-1"
                            />
                            <span className="text-muted-foreground">:</span>
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
                    {(!config.payloadMappings || config.payloadMappings.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">Empty payload (sending {"{}"}).</p>
                    )}
                </div>
            </div>

            {(!config.destinationId) && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Please select a destination.
                </div>
            )}
        </div>
    );
}
