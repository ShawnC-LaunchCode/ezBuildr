import { fetchAPI } from "@/lib/vault-api";

export type StepValue = unknown;

// Helper to check if a string is a valid UUID
export function isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

interface WorkflowRunResponse {
    data: {
        runId: string;
        runToken: string;
        workflowId: string;
    };
    error?: string;
}

// Helper to start a run from a public link slug
export async function startRunFromSlug(
    slug: string,
    initialValues?: Record<string, unknown>
): Promise<{ runId: string; runToken: string; workflowId: string }> {
    const result = await fetchAPI<WorkflowRunResponse>(`/api/workflows/public/${slug}/start`, {
        method: 'POST',
        body: JSON.stringify({ initialValues }),
    });

    return result.data;
}

// Helper to start a run from a workflow UUID
export async function startRunFromWorkflowId(
    workflowId: string,
    initialValues?: Record<string, unknown>
): Promise<{ runId: string; runToken: string; workflowId: string }> {
    const result = await fetchAPI<WorkflowRunResponse>(`/api/workflows/${workflowId}/runs`, {
        method: 'POST',
        body: JSON.stringify({ initialValues }),
    });

    return result.data;
}
