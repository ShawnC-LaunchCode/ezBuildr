/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { useQuery } from "@tanstack/react-query";

import type { ApiWorkflow, ApiStep } from "@/lib/vault-api";

interface IntakeData {
    values: Record<string, unknown>; // alias -> value
    sourceRunId?: string;
    sourceWorkflowTitle?: string;
    isLoading: boolean;
}

type IntakeRuntimeWorkflow = Pick<ApiWorkflow, 'id' | 'title' | 'intakeConfig'>;

export function useIntakeRuntime(currentWorkflowId?: string, runtimeWorkflow?: IntakeRuntimeWorkflow): IntakeData {
    // Allow passing source run ID via URL
    const searchParams = new URLSearchParams(window.location.search);
    const sourceRunId = searchParams.get('intake_run_id') ?? searchParams.get('source_run_id');

    // 1. Fetch Current Workflow to get Intake Config
    const { data: queriedWorkflow } = useQuery<ApiWorkflow>({
        queryKey: ['workflow', currentWorkflowId],
        queryFn: async () => {
            const res = await fetch(`/api/workflows/${currentWorkflowId}`);
            if (!res.ok) {
                throw new Error('Failed to fetch workflow');
            }
            return res.json();
        },
        enabled: !!currentWorkflowId && runtimeWorkflow == null,
        staleTime: 5 * 60 * 1000,
    });

    const currentWorkflow = runtimeWorkflow ?? queriedWorkflow;
    const upstreamWorkflowId = currentWorkflow?.intakeConfig?.upstreamWorkflowId;

    // 2. Fetch Upstream Workflow (for Aliases)
    const { data: upstreamWorkflow } = useQuery<ApiWorkflow & { steps?: ApiStep[] }>({
        queryKey: ['workflow-full', upstreamWorkflowId],
        queryFn: async () => {
            const res = await fetch(`/api/workflows/${upstreamWorkflowId}`);
            if (!res.ok) {
                throw new Error('Failed to fetch upstream workflow');
            }
            return res.json();
        },
        enabled: !!upstreamWorkflowId,
        staleTime: 5 * 60 * 1000,
    });

    // 3. Fetch Upstream Steps (to map StepID <-> Alias)
    // We need to fetch all steps of the upstream workflow
    // This is a bit expensive, simplified for now: assume we can get them or use an endpoint
    // Use existing "variables" endpoint or fetch sections->steps
    const { data: upstreamSteps } = useQuery<ApiStep[]>({
        queryKey: ['workflow-steps-flat', upstreamWorkflowId],
        queryFn: async () => {
            // Helper to fetch all steps (simplified compared to WorkflowRunner)
            // Ideally we have an endpoint /api/workflows/:id/variables or steps
            // Using sections endpoint as proxy
            const sectionsRes = await fetch(`/api/workflows/${upstreamWorkflowId}/sections`);
            if (!sectionsRes.ok) {
                return [];
            }
            const sections = await sectionsRes.json();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepsPromises = sections.map((s: any) =>
                fetch(`/api/sections/${s.id}/steps`).then(r => r.json())
            );
            const stepsArrays = await Promise.all(stepsPromises);
            return stepsArrays.flat();
        },
        enabled: !!upstreamWorkflowId,
        staleTime: 5 * 60 * 1000,
    });

    // 4. Fetch Upstream Run Values
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upstreamRun } = useQuery<any>({
        queryKey: ['run', sourceRunId],
        queryFn: async () => {
            const res = await fetch(`/api/runs/${sourceRunId}`);
            if (!res.ok) {
                throw new Error('Failed to fetch upstream run');
            }
            return res.json().then(r => r.data); // result.data
        },
        enabled: !!sourceRunId && !!upstreamWorkflowId,
    });

    // 5. Resolve Values Map (Alias -> Value)
    const intakeValues: Record<string, unknown> = {};

    if (upstreamRun?.values && upstreamSteps) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upstreamRun.values.forEach((v: any) => {
            const step = upstreamSteps.find(s => s.id === v.stepId);
            if (step?.alias) {
                intakeValues[step.alias] = v.value;
            }
        });
    }

    return {
        values: intakeValues,
        sourceRunId: sourceRunId ?? undefined,
        sourceWorkflowTitle: upstreamWorkflow?.title,
        isLoading: !!upstreamWorkflowId && (!upstreamSteps || !upstreamRun) && !!sourceRunId
    };
}
