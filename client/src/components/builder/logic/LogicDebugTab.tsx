
import { Loader2, Bug, CheckCircle, AlertOctagon, AlertTriangle } from "lucide-react";
import { useState } from 'react';

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useDebugLogic } from "@/lib/vault-hooks";

import type { AIDebugLogicResponse, AIGeneratedWorkflow } from "@shared/types/ai";

interface LogicDebugTabProps {
    workflowId: string;
    currentWorkflow: ApiWorkflow;
}

export function LogicDebugTab({ workflowId, currentWorkflow }: LogicDebugTabProps) {
    const [debugResult, setDebugResult] = useState<AIDebugLogicResponse | null>(null);
    const debugMutation = useDebugLogic();
    const { toast } = useToast();

    const handleDebug = async () => {
        try {
            const result = await debugMutation.mutateAsync({
                workflowId,
                currentWorkflow: (currentWorkflow as unknown) as AIGeneratedWorkflow
            });
            setDebugResult(result);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "An unknown error occurred";
            toast({ title: "Error", description: message, variant: "destructive" });
        }
    };

    return (
        <>
            <div className="mb-4">
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { void handleDebug(); }}
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
                            debugResult.issues.map((issue) => (
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
        </>
    );
}
