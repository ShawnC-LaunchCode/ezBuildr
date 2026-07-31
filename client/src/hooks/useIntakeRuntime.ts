import { useQuery } from "@tanstack/react-query";

import type { ApiWorkflow, ApiStep } from "@/lib/vault-api";

interface IntakeData {
    values: Record<string, unknown>; // alias -> value
    sourceRunId?: string;
    sourceWorkflowTitle?: string;
    isLoading: boolean;
}

type IntakeRuntimeWorkflow = Pick<ApiWorkflow, 'id' | 'title' | 'intakeConfig'>;

interface WorkflowSection {
    id: string;
}

interface UpstreamRunValue {
    stepId: string;
    value: unknown;
}

interface UpstreamRun {
    values: UpstreamRunValue[];
}

async function readJson<T>(response: Response): Promise<T> {
    const data: unknown = await response.json();
    return data as T;
}

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
            return readJson<ApiWorkflow>(res);
        },
        enabled: !!currentWorkflowId && runtimeWorkflow == null,
        staleTime: 5 * 60 * 1000,
    });

    const currentWorkflow = runtimeWorkflow ?? queriedWorkflow;
    const intakeConfig = currentWorkflow?.intakeConfig as unknown;
    const upstreamWorkflowId = typeof intakeConfig === 'object'
        && intakeConfig !== null
        && 'upstreamWorkflowId' in intakeConfig
        && typeof intakeConfig.upstreamWorkflowId === 'string'
        ? intakeConfig.upstreamWorkflowId
        : undefined;

    // 2. Fetch Upstream Workflow (for Aliases)
    const { data: upstreamWorkflow } = useQuery<ApiWorkflow & { steps?: ApiStep[] }>({
        queryKey: ['workflow-full', upstreamWorkflowId],
        queryFn: async () => {
            const res = await fetch(`/api/workflows/${upstreamWorkflowId}`);
            if (!res.ok) {
                throw new Error('Failed to fetch upstream workflow');
            }
            return readJson<ApiWorkflow & { steps?: ApiStep[] }>(res);
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
            const sections = await readJson<WorkflowSection[]>(sectionsRes);

            const stepsPromises = sections.map(async (section) =>
                readJson<ApiStep[]>(await fetch(`/api/sections/${section.id}/steps`))
            );
            const stepsArrays = await Promise.all(stepsPromises);
            return stepsArrays.flat();
        },
        enabled: !!upstreamWorkflowId,
        staleTime: 5 * 60 * 1000,
    });

    // 4. Fetch Upstream Run Values
    const { data: upstreamRun } = useQuery<UpstreamRun>({
        queryKey: ['run', sourceRunId],
        queryFn: async () => {
            const res = await fetch(`/api/runs/${sourceRunId}`);
            if (!res.ok) {
                throw new Error('Failed to fetch upstream run');
            }
            const result = await readJson<{ data: UpstreamRun }>(res);
            return result.data;
        },
        enabled: !!sourceRunId && !!upstreamWorkflowId,
    });

    // 5. Resolve Values Map (Alias -> Value)
    const intakeValues: Record<string, unknown> = {};

    if (upstreamRun?.values && upstreamSteps) {
        upstreamRun.values.forEach((v) => {
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
