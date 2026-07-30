import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

import { IntakeProvider } from "@/components/builder/IntakeContext";
import { DevToolsPanel } from "@/components/devtools/DevToolsPanel";
import { useToast } from "@/hooks/use-toast";
import { hotReloadManager } from "@/lib/previewRunner/HotReloadManager";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { generateAIRandomValues, generateAIRandomValuesForSteps } from "@/lib/randomizer/aiRandomFill";
import { ApiSection, ApiStep } from "@/lib/vault-api";
import { WorkflowRunner } from "@/pages/WorkflowRunner";

import { evaluateConditionExpression } from "@shared/conditionEvaluator";
import { ConditionExpression } from "@shared/types";

import { DevToolbar } from "./DevToolbar";



interface PreviewRunnerProps {
    workflowId: string;
    onExit: () => void;
}

interface PreviewSection extends ApiSection {
    steps?: ApiStep[];
}


export function PreviewRunner({ workflowId, onExit }: PreviewRunnerProps) {
    const { toast } = useToast();
    const _queryClient = useQueryClient();

    // Preview Environment State
    const [env, setEnv] = useState<PreviewEnvironment | null>(null);
    const [showDevTools, setShowDevTools] = useState(false);
    const [previewRunId, setPreviewRunId] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);

    // Fetch workflow data
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: workflow, isLoading: loadingWorkflow } = useQuery({
        queryKey: ["preview-workflow", workflowId],
        queryFn: async () => {
            const response = await fetch(`/api/workflows/${workflowId}`, {
                credentials: "include",
                cache: "no-cache",
            });
            if (!response.ok) {
                throw new Error('Failed to load workflow');
            }

            return response.json();
        },
        enabled: !!workflowId,
        staleTime: 0,
        gcTime: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const allSteps = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return workflow?.sections?.flatMap((section: PreviewSection) => section.steps ?? []) ?? [];
    }, [workflow]);

    // Fetch snapshot values
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data: snapshotValues } = useQuery({
        queryKey: ["snapshot-values", snapshotId],
        queryFn: async () => {
            if (!snapshotId || snapshotId === 'none') {
                return null;
            }
            const response = await fetch(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`, {
                credentials: "include",
            });
            if (!response.ok) { throw new Error('Failed to load snapshot values'); }

            return response.json();
        },
        enabled: !!snapshotId && snapshotId !== 'none',
    });

    // Create preview run ID (for docs)
    useEffect(() => {
        if (!workflowId || previewRunId) {
            return;
        }
        async function createRun() {
            try {
                const res = await fetch(`/api/workflows/${workflowId}/runs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                });
                if (res.ok) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const data = await res.json();
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                    setPreviewRunId(data.data.runId);
                    // Set token?
                }
            } catch (_e) {
                console.error('Failed to create preview run:', _e);
                // Preview mode can continue without run ID (read-only mode)
            }
        }
        void createRun();
    }, [workflowId, previewRunId]);

    // Init Environment
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (workflow && allSteps && workflow.sections) {
            // Always recreate env when workflow/steps change to pick up schema updates (e.g., required status)
            // This fixes the bug where toggling required doesn't update in preview until reload

            let initialValues = {};

            if (snapshotId && snapshotValues) {
                const stepIdValues: Record<string, unknown> = {};
                // Map alias/id to stepId
                for (const [key, value] of Object.entries(snapshotValues as Record<string, unknown>)) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    const step = allSteps.find((s: ApiStep) => s.alias === key || s.id === key);

                    if (step) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        stepIdValues[step.id] = value;
                    }
                }
                initialValues = stepIdValues;
            } else if (env) {
                // Preserve existing values when re-creating env (except when loading snapshot)
                initialValues = env.getValues();
            }

            // Recreate env to pick up latest workflow definition changes
            const newEnv = new PreviewEnvironment({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                workflowId: workflow.id,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                sections: workflow.sections,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                steps: allSteps,
                initialValues,
            });
            setEnv(newEnv);
            hotReloadManager.attach(newEnv);
        }
        return () => hotReloadManager.detach();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    }, [workflow?.id, JSON.stringify(workflow?.sections?.map((s: PreviewSection) => s.id)), JSON.stringify(allSteps?.map((s: ApiStep) => s.id)), snapshotId, snapshotValues]);

    const handleRandomFill = async () => {

        if (!env || !allSteps) {
            return;
        }
        setIsAiLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            const values = await generateAIRandomValues(allSteps, workflowId, workflow.title);
            // Apply values
            Object.entries(values).forEach(([stepId, val]) => {
                env.setValue(stepId, val);
            });

            // Calculate visible sections to jump to the end
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (workflow.sections) {
                const aliasResolver = (variableName: string): string | undefined => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    const step = allSteps.find((s: ApiStep) => s.alias === variableName);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
                    return step?.id;
                };

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                const visibleSections = workflow.sections.filter((section: PreviewSection) => {

                    if (!section.visibleIf) {
                        return true;
                    }
                    try {
                        return evaluateConditionExpression(section.visibleIf as ConditionExpression, values, aliasResolver);
                    } catch (_e) {
                        console.error('Error evaluating section visibility condition:', section.id, _e);
                        return false;
                    }
                });

                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (visibleSections.length > 0) {
                    // Jump to the last section
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    env.setCurrentSection(visibleSections.length - 1);
                }
            }

            toast({ title: "Random Data Generated", description: "Filled workflow and jumped to end." });
        } catch (_e) {
            console.error(_e);
            toast({ title: "Error", description: "Failed to generate data", variant: "destructive" });
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleRandomFillPage = async () => {

        if (!env || !allSteps) {
            return;
        }
        const currentState = env.getState();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const currentSectionId = workflow.sections[currentState.currentSectionIndex]?.id;

        if (!currentSectionId) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const pageSteps = allSteps.filter((s: ApiStep) => s.sectionId === currentSectionId);

        setIsAiLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            const values = await generateAIRandomValuesForSteps(pageSteps, workflowId, workflow.title);
            Object.entries(values).forEach(([stepId, val]) => {
                env.setValue(stepId, val);
            });
            toast({ title: "Page Filled", description: "Filled current page with random values." });
        } catch (error) {
            console.error('Failed to generate AI random values:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to generate data",
                variant: "destructive"
            });
        } finally {
            setIsAiLoading(false);
        }
    };


    if (loadingWorkflow || !env) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading workflow" />
            </div>
        );
    }

    return (
        <div className="h-screen w-screen fixed inset-0 z-50 flex flex-col bg-background">
            <DevToolbar
                workflowId={workflowId}
                onExit={onExit}
                onReset={() => env.reset()}
                onRandomFill={() => { void handleRandomFill(); }}
                onRandomFillPage={() => { void handleRandomFillPage(); }}
                onLoadSnapshot={(id) => setSnapshotId(id)}
                onToggleDevTools={() => setShowDevTools(!showDevTools)}
                showDevTools={showDevTools}
                isAiLoading={isAiLoading}
            />

            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 overflow-auto">
                    {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */}
                    <IntakeProvider workflowId={workflow.id}>
                        <WorkflowRunner
                            key={`preview-${env.getState().id}`}
                            runId={previewRunId ?? undefined}
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
