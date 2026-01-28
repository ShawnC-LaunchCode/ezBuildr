import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { snapshotAPI, type ApiSnapshot } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useSnapshots(workflowId: string | undefined): UseQueryResult<ApiSnapshot[]> {
    return useQuery({
        queryKey: queryKeys.snapshots(workflowId ?? ""),
        queryFn: () => snapshotAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useSnapshot(workflowId: string | undefined, snapshotId: string | undefined): UseQueryResult<ApiSnapshot> {
    return useQuery({
        queryKey: queryKeys.snapshot(workflowId ?? "", snapshotId ?? ""),
        queryFn: () => snapshotAPI.get(workflowId ?? "", snapshotId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined" && !!snapshotId && snapshotId !== "undefined",
    });
}

export function useCreateSnapshot(): UseMutationResult<ApiSnapshot, unknown, { workflowId: string; name: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, name }: { workflowId: string; name: string }) =>
            snapshotAPI.create(workflowId, name),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
        },
    });
}

export function useRenameSnapshot(): UseMutationResult<ApiSnapshot, unknown, { workflowId: string; snapshotId: string; name: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, snapshotId, name }: { workflowId: string; snapshotId: string; name: string }) =>
            snapshotAPI.rename(workflowId, snapshotId, name),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot(variables.workflowId, variables.snapshotId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
        },
    });
}

export function useDeleteSnapshot(): UseMutationResult<void, unknown, { workflowId: string; snapshotId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, snapshotId }: { workflowId: string; snapshotId: string }) =>
            snapshotAPI.delete(workflowId, snapshotId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
        },
    });
}

export function useSaveSnapshotFromRun(): UseMutationResult<ApiSnapshot, unknown, { workflowId: string; snapshotId: string; runId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, snapshotId, runId }: { workflowId: string; snapshotId: string; runId: string }) =>
            snapshotAPI.saveFromRun(workflowId, snapshotId, runId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshot(variables.workflowId, variables.snapshotId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
        },
    });
}
