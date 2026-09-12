import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { runAPI, type ApiAdvanceResult, type ApiRun, type ApiRunRuntime, type ApiStepValue } from "../../lib/vault-api";

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

/**
 * CB-9a-3: one logical submission evaluates once, returns authoritative state, and
 * carries the `submissionKey` that makes a retry a replay and a late response
 * detectable.
 */
export function useAdvance(): UseMutationResult<
    ApiAdvanceResult,
    unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { runId: string; pageId: string; values: Array<{ stepId: string; value: any }>; submissionKey: string }
> {
    const queryClient = useQueryClient();
    return useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: ({ runId, pageId, values, submissionKey }: { runId: string; pageId: string; values: Array<{ stepId: string; value: any }>; submissionKey: string }) =>
            runAPI.advance(runId, pageId, values, submissionKey),
        // The server persisted this destination in the reached set. Keep the
        // cached run in sync without a refetch racing navigation.
        onSuccess: (result, variables) => {
            if (result.submissionKey !== variables.submissionKey) { return; }
            const reachedPageId = result.success ? result.navigation?.nextPageId : undefined;
            if (reachedPageId == null) {
                return;
            }
            queryClient.setQueryData<ApiRunRuntime>(queryKeys.runRuntime(variables.runId), (previous) => {
                if (!previous || previous.run.visitedPageIds.includes(reachedPageId)) {
                    return previous;
                }
                return {
                    ...previous,
                    run: { ...previous.run, visitedPageIds: [...previous.run.visitedPageIds, reachedPageId] },
                };
            });
        },
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
