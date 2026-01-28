import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { fetchAPI } from "../../lib/vault-api";

import type {
    AIWorkflowRevisionRequest,
    AIWorkflowRevisionResponse,
    AIGeneratedWorkflow,
    AIConnectLogicRequest,
    AIConnectLogicResponse,
    AIDebugLogicRequest,
    AIDebugLogicResponse,
    AIVisualizeLogicRequest,
    AIVisualizeLogicResponse,
    QualityScore
} from "../../../../shared/types/ai";

export function useReviseWorkflow(): UseMutationResult<AIWorkflowRevisionResponse, unknown, AIWorkflowRevisionRequest> {
    return useMutation({
        mutationFn: async (data: AIWorkflowRevisionRequest) => {
            // 1. Enqueue Job
            const initRes = await fetchAPI<{ jobId: string }>('/api/ai/workflows/revise', {
                method: 'POST',
                body: JSON.stringify(data),
            });
            const { jobId } = initRes;
            if (!jobId) { throw new Error("Failed to start AI revision job"); }
            // 2. Poll for Completion
            // Using a recursive promise or a while loop
            const poll = async (): Promise<AIWorkflowRevisionResponse> => {
                // Explicitly type the expected response to avoid 'unknown' error
                interface RevisionStatusResponse { status: 'completed' | 'failed' | 'pending'; result: AIWorkflowRevisionResponse; error?: string }
                const statusRes = await fetchAPI<RevisionStatusResponse>(`/api/ai/workflows/revise/${jobId}`);

                if (statusRes.status === 'completed') {
                    return statusRes.result;
                }
                if (statusRes.status === 'failed') {
                    throw new Error(statusRes.error || "AI revision job failed");
                }
                // Wait 2s and retry
                await new Promise(resolve => setTimeout(resolve, 2000));
                return poll();
            };
            return poll();
        },
    });
}

export function useGenerateWorkflow(): UseMutationResult<{
    success: boolean;
    workflow: AIGeneratedWorkflow & { id: string };
    metadata: {
        duration: number;
        sectionsGenerated: number;
        logicRulesGenerated: number;
        transformBlocksGenerated: number;
    };
    quality?: QualityScore;
}, unknown, {
    projectId: string;
    description: string;
    category?: 'application' | 'survey' | 'intake' | 'onboarding' | 'request' | 'checklist' | 'general';
}> {
    return useMutation({
        mutationFn: async (data) => {
            return fetchAPI<{
                success: boolean;
                workflow: AIGeneratedWorkflow & { id: string };
                metadata: {
                    duration: number;
                    sectionsGenerated: number;
                    logicRulesGenerated: number;
                    transformBlocksGenerated: number;
                };
                quality?: QualityScore;
            }>('/api/ai/workflows/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
    });
}

export function useConnectLogic(): UseMutationResult<AIConnectLogicResponse, unknown, AIConnectLogicRequest> {
    return useMutation({
        mutationFn: (data: AIConnectLogicRequest) =>
            fetchAPI<AIConnectLogicResponse>('/api/ai/workflows/generate-logic', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
}

export function useDebugLogic(): UseMutationResult<AIDebugLogicResponse, unknown, AIDebugLogicRequest> {
    return useMutation({
        mutationFn: (data: AIDebugLogicRequest) =>
            fetchAPI<AIDebugLogicResponse>('/api/ai/workflows/debug-logic', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
}

export function useVisualizeLogic(): UseMutationResult<AIVisualizeLogicResponse, unknown, AIVisualizeLogicRequest> {
    return useMutation({
        mutationFn: (data: AIVisualizeLogicRequest) =>
            fetchAPI<AIVisualizeLogicResponse>('/api/ai/workflows/visualize-logic', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
}
