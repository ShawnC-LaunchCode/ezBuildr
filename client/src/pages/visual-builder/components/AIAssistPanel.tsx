
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wand2, Check, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

interface AIAssistPanelProps {
    templateId: string;
    fileBuffer?: ArrayBuffer; // If analyzing a new upload
    fileName?: string;
    onApplyMapping?: (mapping: any) => void;
    workflowVariables?: any[];
}

export function AIAssistPanel({ templateId, fileBuffer, fileName, onApplyMapping, workflowVariables }: AIAssistPanelProps) {
    const [analysis, setAnalysis] = useState<any>(null);
    const [mappings, setMappings] = useState<any[]>([]);

    // Analyze Mutation
    const analyzeMutation = useMutation({
        mutationFn: async () => {
            const formData = new FormData();
            if (fileBuffer && fileName) {
                const blob = new Blob([fileBuffer]);
                formData.append('file', blob, fileName);
            } else {
                // Return generic message if looking up by ID isn't implemented yet
                // In a real app we'd fetch the file from the server here
                return null;
            }
            const res = await axios.post('/api/ai/doc/analyze', formData);
            return res.data.data;
        },
        onSuccess: (data) => {
            setAnalysis(data);
            if (data?.variables && workflowVariables) {
                suggestMappingMutation.mutate(data.variables);
            }
        }
    });

    // Suggest Mapping Mutation
    const suggestMappingMutation = useMutation({
        mutationFn: async (variables: any[]) => {
            const res = await axios.post('/api/ai/doc/suggest-mappings', {
                templateVariables: variables,
                workflowVariables
            });
            return res.data.data;
        },
        onSuccess: (data) => {
            setMappings(data);
        }
    });

    return (
        <div className="h-full flex flex-col border-l bg-white dark:bg-zinc-900 w-[350px]">
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-500" />
                    AI Assistant
                </h3>
                <Badge variant="secondary" className="text-xs">Beta</Badge>
            </div>

            <ScrollArea className="flex-1 p-4">
                {!analysis && !analyzeMutation.isPending && (
                    <div className="text-center py-10 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Scan your template to detect variables & issues.
                        </p>
                        <Button onClick={() => analyzeMutation.mutate()} className="w-full">
                            Analyze Template
                        </Button>
                    </div>
                )}

                {analyzeMutation.isPending && (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Analyzing document structure...</span>
                    </div>
                )}

                {analysis && (
                    <div className="space-y-6">
                        {/* Variables Detected */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center justify-between">
                                Detected Variables
                                <Badge variant="outline">{analysis.variables.length}</Badge>
                            </h4>
                            <div className="space-y-2">
                                {analysis.variables.map((v: any, i: number) => (
                                    <Card key={i} className="bg-slate-50 dark:bg-slate-800/50">
                                        <CardContent className="p-3 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-xs font-semibold">{v.name}</span>
                                                <Badge variant={v.confidence > 0.8 ? "default" : "secondary"} className="text-[10px] h-5">
                                                    {Math.round(v.confidence * 100)}%
                                                </Badge>
                                            </div>

                                            {/* Mapping Suggestion */}
                                            {mappings.length > 0 && (
                                                <div className="mt-3 pt-2 border-t">
                                                    {(() => {
                                                        const mapping = mappings.find(m => m.templateVariable === v.name);
                                                        if (!mapping) return <span className="text-xs text-muted-foreground">No mapping found</span>;

                                                        return (
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-xs text-muted-foreground">Mapped to:</span>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <Badge variant="outline" className="text-xs truncate max-w-[120px]">
                                                                        {mapping.workflowVariableId ? (
                                                                            workflowVariables?.find(wv => wv.id === mapping.workflowVariableId)?.label || mapping.workflowVariableId
                                                                        ) : (
                                                                            <span className="text-green-600">+ Create New</span>
                                                                        )}
                                                                    </Badge>
                                                                    {onApplyMapping && (
                                                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onApplyMapping(mapping)}>
                                                                            <Check className="w-3 h-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        {/* Suggestions */}
                        {analysis.suggestions && analysis.suggestions.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium">Suggestions</h4>
                                <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-4">
                                    {analysis.suggestions.map((s: string, i: number) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
