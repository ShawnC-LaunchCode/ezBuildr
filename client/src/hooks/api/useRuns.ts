import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { runAPI, type ApiRun, type ApiRunRuntime, type ApiStepValue } from "../../lib/vault-api";

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

export function useRunRuntime(id: string | undefined, options?: { enabled?: boolean }): UseQueryResult<ApiRunRuntime> {
    return useQuery({
        queryKey: queryKeys.runRuntime(id ?? ""),
        queryFn: () => runAPI.getRuntime(id ?? ""),
        enabled: options?.enabled !== undefined ? options.enabled : !!id && id !== "undefined",
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCreateRun(): UseMutationResult<unknown, unknown, { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }> {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: ({ workflowId, queryParams, ...data }: { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }) =>
            runAPI.create(workflowId, data, queryParams),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.runs(variables.workflowId) });
        },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useUpsertValue(): UseMutationResult<unknown, unknown, { runId: string; stepId: string; value: any }> {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: ({ runId, stepId, value }: { runId: string; stepId: string; value: any }) =>
            runAPI.upsertValue(runId, stepId, value),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.runWithValues(variables.runId) });
        },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSubmitPage(): UseMutationResult<{ success: boolean; errors?: string[]; fieldErrors?: Record<string, string[]> }, unknown, { runId: string; pageId: string; values: Array<{ stepId: string; value: any }> }> {
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: ({ runId, pageId, values }: { runId: string; pageId: string; values: Array<{ stepId: string; value: any }> }) =>
            runAPI.submitPage(runId, pageId, values),
        // Don't invalidate queries here - causes race condition with navigation state updates
        // Values are already saved to backend; local formValues state is the source of truth for UI
    });
}

export function useNext(): UseMutationResult<{ nextPageId?: string }, unknown, { runId: string; currentPageId: string }> {
    return useMutation({
        mutationFn: ({ runId, currentPageId }: { runId: string; currentPageId: string }) =>
            runAPI.next(runId, currentPageId),
        // Don't invalidate queries here - navigation state is managed locally in WorkflowRunner
        // Refetching causes race conditions that interfere with setCurrentPageIndex updates
    });
}

export function useCompleteRun(): UseMutationResult<unknown, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: runAPI.complete,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSuccess: async (data: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            await queryClient.invalidateQueries({ queryKey: queryKeys.run(data.id) });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            await queryClient.invalidateQueries({ queryKey: queryKeys.runs(data.workflowId) });
        },
    });
}
