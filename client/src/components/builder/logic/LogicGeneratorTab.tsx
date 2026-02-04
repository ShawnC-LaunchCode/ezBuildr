
import { Loader2, Zap } from "lucide-react";
import { useState } from 'react';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useConnectLogic, useUpdateWorkflow } from "@/lib/vault-hooks";

import type { AIConnectLogicRequest, AIGeneratedWorkflow } from "@shared/types/ai";

interface LogicGeneratorTabProps {
    workflowId: string;
    currentWorkflow: ApiWorkflow;
}

export function LogicGeneratorTab({ workflowId, currentWorkflow }: LogicGeneratorTabProps) {
    const [description, setDescription] = useState('');
    const connectMutation = useConnectLogic();
    const updateMutation = useUpdateWorkflow();
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!description.trim()) { return; }
        try {
            // Need to cast currentWorkflow effectively for AI compatibility
            const requestData: AIConnectLogicRequest = {
                workflowId,
                currentWorkflow: (currentWorkflow as unknown) as AIGeneratedWorkflow,
                description,
                mode: 'easy'
            };

            const result = await connectMutation.mutateAsync(requestData);

            // In a real app we'd show a diff preview first
            await updateMutation.mutateAsync({ id: workflowId, ...result.updatedWorkflow });

            toast({ title: "Logic Generated", description: "Workflow logic updated." });
            setDescription('');
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "An unknown error occurred";
            toast({ title: "Error", description: message, variant: "destructive" });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Add Logic Rules</CardTitle>
                    <CardDescription>Describe what should happen.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        placeholder="e.g. Show spouse details if marital status is Married"
                        value={description}
                        onChange={(e) => { setDescription(e.target.value); }}
                    />
                    <Button
                        className="w-full"
                        onClick={() => { void handleGenerate(); }}
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
                    <li>Say &quot;Skip section X&quot; to hide pages.</li>
                </ul>
            </div>
        </>
    );
}
