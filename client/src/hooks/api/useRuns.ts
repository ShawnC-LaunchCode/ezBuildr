import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { runAPI, type ApiRun, type ApiStepValue } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useRuns(workflowId: string | undefined): UseQueryResult<ApiRun[]> {
    return useQuery({
        queryKey: queryKeys.runs(workflowId ?? ""),
        queryFn: () => runAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useRun(id: string | undefined): UseQueryResult<ApiRun> {
    return useQuery({
        queryKey: queryKeys.run(id ?? ""),
        queryFn: () => runAPI.get(id ?? ""),
        enabled: !!id && id !== "undefined",
    });
}

export function useRunWithValues(id: string | undefined, options?: { enabled?: boolean }): UseQueryResult<ApiRun & { values: ApiStepValue[] }> {
    return useQuery({
        queryKey: queryKeys.runWithValues(id ?? ""),
        queryFn: () => runAPI.getWithValues(id ?? ""),
        enabled: options?.enabled !== undefined ? options.enabled : !!id && id !== "undefined",
    });
}

export function useCreateRun(): UseMutationResult<unknown, unknown, { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, queryParams, ...data }: { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }) =>
            runAPI.create(workflowId, data, queryParams),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.runs(variables.workflowId) });
        },
    });
}

export function useUpsertValue(): UseMutationResult<unknown, unknown, { runId: string; stepId: string; value: any }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ runId, stepId, value }: { runId: string; stepId: string; value: any }) =>
            runAPI.upsertValue(runId, stepId, value),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.runWithValues(variables.runId) });
        },
    });
}

export function useSubmitSection(): UseMutationResult<{ success: boolean; errors?: string[]; fieldErrors?: Record<string, string[]> }, unknown, { runId: string; sectionId: string; values: Array<{ stepId: string; value: any }> }> {
    return useMutation({
        mutationFn: ({ runId, sectionId, values }: { runId: string; sectionId: string; values: Array<{ stepId: string; value: any }> }) =>
            runAPI.submitSection(runId, sectionId, values),
        // Don't invalidate queries here - causes race condition with navigation state updates
        // Values are already saved to backend; local formValues state is the source of truth for UI
    });
}

export function useNext(): UseMutationResult<{ nextSectionId?: string }, unknown, { runId: string; currentSectionId: string }> {
    return useMutation({
        mutationFn: ({ runId, currentSectionId }: { runId: string; currentSectionId: string }) =>
            runAPI.next(runId, currentSectionId),
        // Don't invalidate queries here - navigation state is managed locally in WorkflowRunner
        // Refetching causes race conditions that interfere with setCurrentSectionIndex updates
    });
}

export function useCompleteRun(): UseMutationResult<unknown, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: runAPI.complete,
        onSuccess: async (data: any) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.run(data.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.runs(data.workflowId) });
        },
    });
}
