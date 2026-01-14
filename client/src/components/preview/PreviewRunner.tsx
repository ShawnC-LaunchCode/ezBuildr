import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";

import { IntakeProvider } from "@/components/builder/IntakeContext";
import { DevToolsPanel } from "@/components/devtools/DevToolsPanel";
import { useToast } from "@/hooks/use-toast";
import { hotReloadManager } from "@/lib/previewRunner/HotReloadManager";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { generateAIRandomValues, generateAIRandomValuesForSteps } from "@/lib/randomizer/aiRandomFill";
import { ApiStep } from "@/lib/vault-api";
import { WorkflowRunner } from "@/pages/WorkflowRunner";

import { evaluateConditionExpression } from "@shared/conditionEvaluator";

import { DevToolbar } from "./DevToolbar";


interface PreviewRunnerProps {
    workflowId: string;
    onExit: () => void;
}

export function PreviewRunner({ workflowId, onExit }: PreviewRunnerProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Preview Environment State
    const [env, setEnv] = useState<PreviewEnvironment | null>(null);
    const [showDevTools, setShowDevTools] = useState(false);
    const [previewRunId, setPreviewRunId] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);

    // Fetch workflow data
    const { data: workflow, isLoading: loadingWorkflow } = useQuery({
        queryKey: ["preview-workflow", workflowId],
        queryFn: async () => {
            const response = await fetch(`/api/workflows/${workflowId}`, {
                credentials: "include",
                cache: "no-cache",
            });
            if (!response.ok) {throw new Error('Failed to load workflow');}
            return response.json();
        },
        enabled: !!workflowId,
        staleTime: 0,
        gcTime: 0,
    });

    const allSteps = useMemo(() => {
        return workflow?.sections?.flatMap((section: any) => section.steps || []) || [];
    }, [workflow]);

    // Fetch snapshot values
    const { data: snapshotValues } = useQuery({
        queryKey: ["snapshot-values", snapshotId],
        queryFn: async () => {
            if (!snapshotId || snapshotId === 'none') {return null;}
            const response = await fetch(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`, {
                credentials: "include",
            });
            if (!response.ok) {throw new Error('Failed to load snapshot values');}
            return response.json();
        },
        enabled: !!snapshotId && snapshotId !== 'none',
    });

    // Create preview run ID (for docs)
    useEffect(() => {
        if (!workflowId || previewRunId) {return;}
        async function createRun() {
            try {
                const res = await fetch(`/api/workflows/${workflowId}/runs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                });
                if (res.ok) {
                    const data = await res.json();
                    setPreviewRunId(data.data.runId);
                    // Set token?
                }
            } catch (e) {
                console.error('Failed to create preview run:', e);
                // Preview mode can continue without run ID (read-only mode)
            }
        }
        createRun();
    }, [workflowId, previewRunId]);

    // Init Environment
    // Init Environment
    useEffect(() => {
        if (workflow && allSteps && workflow.sections) {
            // Always recreate env when workflow/steps change to pick up schema updates (e.g., required status)
            // This fixes the bug where toggling required doesn't update in preview until reload

            let initialValues = {};
            if (snapshotId && snapshotValues) {
                const stepIdValues: Record<string, any> = {};
                // Map alias/id to stepId
                for (const [key, value] of Object.entries(snapshotValues)) {
                    const step = allSteps.find((s: ApiStep) => s.alias === key || s.id === key);
                    if (step) {stepIdValues[step.id] = value;}
                }
                initialValues = stepIdValues;
            } else if (env) {
                // Preserve existing values when re-creating env (except when loading snapshot)
                initialValues = env.getValues();
            }

            // Recreate env to pick up latest workflow definition changes
            const newEnv = new PreviewEnvironment({
                workflowId: workflow.id,
                sections: workflow.sections,
                steps: allSteps,
                initialValues,
            });
            setEnv(newEnv);
            hotReloadManager.attach(newEnv);
        }
        return () => hotReloadManager.detach();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflow?.id, JSON.stringify(workflow?.sections?.map((s: any) => s.id)), JSON.stringify(allSteps?.map((s: ApiStep) => s.id)), snapshotId, snapshotValues]);

    const handleRandomFill = async () => {
        if (!env || !allSteps) {return;}
        setIsAiLoading(true);
        try {
            const values = await generateAIRandomValues(allSteps, workflowId, workflow.title);
            // Apply values
            Object.entries(values).forEach(([stepId, val]) => {
                env.setValue(stepId, val);
            });

            // Calculate visible sections to jump to the end
            if (workflow.sections) {
                const aliasResolver = (variableName: string): string | undefined => {
                    const step = allSteps.find((s: ApiStep) => s.alias === variableName);
                    return step?.id;
                };

                const visibleSections = workflow.sections.filter((section: any) => {
                    if (!section.visibleIf) {return true;}
                    try {
                        return evaluateConditionExpression(section.visibleIf, values, aliasResolver);
                    } catch (e) {
                        console.error('Error evaluating section visibility condition:', section.id, e);
                        return true; // Fail-safe: show section if evaluation fails
                    }
                });

                if (visibleSections.length > 0) {
                    // Jump to the last section
                    env.setCurrentSection(visibleSections.length - 1);
                }
            }

            toast({ title: "Random Data Generated", description: "Filled workflow and jumped to end." });
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to generate data", variant: "destructive" });
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleRandomFillPage = async () => {
        if (!env || !allSteps) {return;}
        const currentState = env.getState();
        const currentSectionId = workflow.sections[currentState.currentSectionIndex]?.id;
        if (!currentSectionId) {return;}

        const pageSteps = allSteps.filter((s: ApiStep) => s.sectionId === currentSectionId);

        setIsAiLoading(true);
        try {
            const values = await generateAIRandomValuesForSteps(pageSteps, workflowId, workflow.title);
            Object.entries(values).forEach(([stepId, val]) => {
                env.setValue(stepId, val);
            });
            toast({ title: "Page Filled", description: "Filled current page with random values." });
        } catch (e) {
            console.error('Failed to generate AI random values:', e);
            toast({
                title: "Error",
                description: e instanceof Error ? e.message : "Failed to generate data",
                variant: "destructive"
            });
        } finally {
            setIsAiLoading(false);
        }
    };

    if (loadingWorkflow || !env) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="h-screen w-screen fixed inset-0 z-50 flex flex-col bg-background">
            <DevToolbar
                workflowId={workflowId}
                onExit={onExit}
                onReset={() => env.reset()}
                onRandomFill={handleRandomFill}
                onRandomFillPage={handleRandomFillPage}
                onLoadSnapshot={(id) => setSnapshotId(id)}
                onToggleDevTools={() => setShowDevTools(!showDevTools)}
                showDevTools={showDevTools}
                isAiLoading={isAiLoading}
            />

            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 overflow-auto">
                    <IntakeProvider workflowId={workflow.id}>
                        <WorkflowRunner
                            key={`preview-${env.getState().id}`}
                            runId={previewRunId || undefined}
                            previewEnvironment={env}
                        />
                    </IntakeProvider>
                </div>

                <DevToolsPanel
                    env={env}
                    isOpen={showDevTools}
                    onClose={() => setShowDevTools(false)}
                />
            </div>
        </div>
    );
}
