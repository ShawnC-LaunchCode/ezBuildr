import { Clock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkflowDataSources, useWorkflowVariables } from "@/lib/vault-hooks";

import { PayloadMappingEditor, type PayloadMapping } from "./external-send/PayloadMappingEditor";

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

export function ExternalSendBlockEditor({ workflowId, config, onChange, phase, onPhaseChange }: ExternalSendBlockEditorProps): JSX.Element {
    const { data: dataSources } = useWorkflowDataSources(workflowId);
    const { data: variables = [] } = useWorkflowVariables(workflowId);

    const destinations = dataSources?.filter(ds => ds.type === 'external' || (ds.type as string) === 'api');

    const updateConfig = (updates: Partial<ExternalSendConfig>): void => {
        onChange({ ...config, ...updates });
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
                        {(destinations?.length ?? 0) > 0 ? destinations?.map(ds => (
                            <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                        )) : <SelectItem value="none" disabled>No external destinations Linked</SelectItem>}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    Link external APIs in the Data Sources tab.
                </p>
            </div>

            <PayloadMappingEditor
                mappings={config.payloadMappings}
                onChange={(newMappings) => updateConfig({ payloadMappings: newMappings })}
                variables={variables}
            />

            {(config.destinationId === '' || config.destinationId === undefined) && (
                <div className="p-2 border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs rounded">
                    Please select a destination.
                </div>
            )}
            {/* Execution Timing */}
            {phase !== undefined && onPhaseChange !== undefined && (
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
