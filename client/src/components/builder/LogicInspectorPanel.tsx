
import { Loader2, Zap, Bug, GitGraph, CheckCircle, AlertTriangle, AlertOctagon } from "lucide-react";
import React, { useState } from 'react';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useConnectLogic, useDebugLogic, useVisualizeLogic, useUpdateWorkflow } from "@/lib/vault-hooks";

interface LogicInspectorPanelProps {
    workflowId: string;
    currentWorkflow: any;
    isOpen: boolean;
    onClose: () => void;
}

export function LogicInspectorPanel({ workflowId, currentWorkflow, isOpen, onClose }: LogicInspectorPanelProps) {
    const [description, setDescription] = useState('');
    const [activeTab, setActiveTab] = useState('generate');
    const [debugResult, setDebugResult] = useState<any>(null);

    const connectMutation = useConnectLogic();
    const debugMutation = useDebugLogic();
    const updateMutation = useUpdateWorkflow();
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!description.trim()) {return;}
        try {
            const result = await connectMutation.mutateAsync({
                workflowId,
                currentWorkflow,
                description,
                mode: 'easy'
            });
            // In a real app we'd show a diff preview first
            await updateMutation.mutateAsync({ id: workflowId, ...result.updatedWorkflow });
            toast({ title: "Logic Generated", description: "Workflow logic updated." });
            setDescription('');
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const handleDebug = async () => {
        try {
            const result = await debugMutation.mutateAsync({
                workflowId,
                currentWorkflow
            });
            setDebugResult(result);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    if (!isOpen) {return null;}

    return (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-background border-l shadow-xl z-50 flex flex-col transition-transform duration-300">
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                    <GitGraph className="w-5 h-5 text-blue-500" />
                    Logic Inspector
                </h2>
                <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>

            <div className="flex-1 overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <TabsList className="m-4 grid grid-cols-3">
                        <TabsTrigger value="generate">Generate</TabsTrigger>
                        <TabsTrigger value="debug">Debug</TabsTrigger>
                        <TabsTrigger value="variables">Variables</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generate" className="flex-1 p-4 space-y-4 overflow-auto">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium">Add Logic Rules</CardTitle>
                                <CardDescription>Describe what should happen.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Input
                                    placeholder="e.g. Show spouse details if marital status is Married"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                                <Button
                                    className="w-full"
                                    onClick={handleGenerate}
                                    disabled={connectMutation.isPending || !description}
                                >
                                    {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                                    Generate Logic
                                </Button>
                            </CardContent>
                        </Card>

                        <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground">
                            <p>Tips:</p>
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                <li>Be specific about variable names if possible.</li>
                                <li>You can describe multiple rules at once.</li>
                                <li>Say "Skip section X" to hide pages.</li>
                            </ul>
                        </div>
                    </TabsContent>

                    <TabsContent value="variables" className="flex-1 p-4 space-y-4 overflow-auto">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Live Variables</h3>
                                <Badge variant="outline" className="text-[10px] font-mono">JSON View</Badge>
                            </div>
                            <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-slate-950 text-slate-50 font-mono text-xs">
                                {/* Placeholder for real-time variables linkage */}
                                <div className="space-y-1">
                                    <span className="text-slate-400">{"// Current Run State (Preview)"}</span>
                                    <pre className="text-emerald-400">
                                        {JSON.stringify({
                                            clientName: "John Doe",
                                            matterType: "Estate Planning",
                                            isUrgent: true,
                                            meta: {
                                                timestamp: new Date().toISOString(),
                                                mode: "preview"
                                            }
                                        }, null, 2)}
                                    </pre>
                                    <div className="pt-4 text-slate-500 italic">
                                        {"// In a real implementation, this would connect to the active run store."}
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    <TabsContent value="debug" className="flex-1 p-4 flex flex-col overflow-hidden">
                        <div className="mb-4">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={handleDebug}
                                disabled={debugMutation.isPending}
                            >
                                {debugMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bug className="w-4 h-4 mr-2" />}
                                Run Analysis
                            </Button>
                        </div>

                        <ScrollArea className="flex-1">
                            {debugResult ? (
                                <div className="space-y-4">
                                    {debugResult.issues.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-8 text-green-600">
                                            <CheckCircle className="w-12 h-12 mb-2" />
                                            <p className="font-medium">No issues found</p>
                                        </div>
                                    ) : (
                                        debugResult.issues.map((issue: any) => (
                                            <Card key={issue.id} className="border-l-4 border-l-red-500">
                                                <CardContent className="p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {issue.severity === 'error' ? <AlertOctagon className="w-4 h-4 text-red-500" /> : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                                                        <span className="font-semibold capitalize text-sm">{issue.type.replace('_', ' ')}</span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{issue.message}</p>
                                                    {issue.locations?.length > 0 && (
                                                        <div className="mt-2 text-xs bg-muted p-1 rounded">
                                                            Locations: {issue.locations.join(', ')}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    Run debugging to check for unreachable pages, loops, and errors.
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
