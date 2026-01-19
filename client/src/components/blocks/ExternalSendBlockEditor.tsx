import { Plus, Trash2, Clock } from "lucide-react";
import React, {  } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkflowDataSources, useWorkflowVariables } from "@/lib/vault-hooks";
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
    phase?: string;
    onPhaseChange?: (phase: string) => void;
}
export function ExternalSendBlockEditor({ workflowId, config, onChange, phase, onPhaseChange }: ExternalSendBlockEditorProps) {
    const { data: dataSources } = useWorkflowDataSources(workflowId);
    const { data: variables = [] } = useWorkflowVariables(workflowId);
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
                                            <SelectItem key={v.key} value={v.alias || v.key}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs">{v.alias || v.key}</span>
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
            {/* Execution Timing */}
            {phase && onPhaseChange && (
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm">When to Run</CardTitle>
                        </div>
                        <CardDescription className="text-xs">
                            Choose when this action should execute
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Select value={phase} onValueChange={onPhaseChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="onSectionSubmit">
                                    <div className="flex flex-col">
                                        <span className="font-medium">When page is submitted</span>
                                        <span className="text-xs text-muted-foreground">Runs after user submits this page</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="onRunComplete">
                                    <div className="flex flex-col">
                                        <span className="font-medium">When workflow completes</span>
                                        <span className="text-xs text-muted-foreground">Runs at the end of the workflow</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="onSectionEnter">
                                    <div className="flex flex-col">
                                        <span className="font-medium">When page loads</span>
                                        <span className="text-xs text-muted-foreground">Runs before user sees this page</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}