import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { projectAPI, type ApiProject, type ApiProjectWithWorkflows, type ApiWorkflow } from "../../lib/vault-api";
import { queryKeys } from "./queryKeys";

export function useProjects(activeOnly?: boolean): UseQueryResult<ApiProject[]> {
    return useQuery({
        queryKey: queryKeys.projects,
        queryFn: () => projectAPI.list(activeOnly),
    });
}

export function useProject(
    id: string | undefined,
    options?: Omit<UseQueryOptions<ApiProjectWithWorkflows>, "queryKey" | "queryFn">
): UseQueryResult<ApiProjectWithWorkflows> {
    return useQuery({
        queryKey: queryKeys.project(id ?? ""),
        queryFn: () => projectAPI.get(id ?? ""),
        enabled: !!id && id !== "undefined",
        ...options,
    });
}

export function useProjectWorkflows(projectId: string | undefined): UseQueryResult<ApiWorkflow[]> {
    return useQuery({
        queryKey: queryKeys.projectWorkflows(projectId ?? ""),
        queryFn: () => projectAPI.getWorkflows(projectId ?? ""),
        enabled: !!projectId && projectId !== "undefined",
    });
}

export function useCreateProject(): UseMutationResult<ApiProject, unknown, { title: string; description?: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: projectAPI.create,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useUpdateProject(): UseMutationResult<ApiProject, unknown, Partial<Omit<ApiProject, 'id' | 'creatorId' | 'createdAt' | 'updatedAt'>> & { id: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) =>
            projectAPI.update(id, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useArchiveProject(): UseMutationResult<ApiProject, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: projectAPI.archive,
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useUnarchiveProject(): UseMutationResult<ApiProject, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: projectAPI.unarchive,
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useDeleteProject(): UseMutationResult<void, unknown, string> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: projectAPI.delete,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}

export function useTransferProject(): UseMutationResult<ApiProject, unknown, { id: string; targetOwnerType: 'user' | 'org'; targetOwnerUuid: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, targetOwnerType, targetOwnerUuid }) =>
            projectAPI.transfer(id, targetOwnerType, targetOwnerUuid),
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        },
    });
}
