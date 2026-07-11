import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { projectAPI, type ApiAssetCopyOptions, type ApiAssetCopyResult, type ApiProject, type ApiAccessResponse, type ApiProjectAccess, type ApiProjectWithWorkflows, type ApiWorkflow } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export interface CreateProjectInput {
    title?: string;
    name?: string;
    description?: string;
    ownerType?: 'user' | 'org';
    ownerUuid?: string;
}

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

export function useProjectAccess(
    projectId: string | undefined,
    options?: Omit<UseQueryOptions<ApiProjectAccess[]>, "queryKey" | "queryFn">
): UseQueryResult<ApiProjectAccess[]> {
    return useQuery({
        queryKey: queryKeys.projectAccess(projectId ?? ""),
        queryFn: () => projectAPI.getAccess(projectId ?? ""),
        enabled: !!projectId && projectId !== "undefined",
        retry: false,
        ...options,
    });
}

export function useProjectAccessDetails(
    projectId: string | undefined,
    options?: Omit<UseQueryOptions<ApiAccessResponse<ApiProjectAccess>>, "queryKey" | "queryFn">
): UseQueryResult<ApiAccessResponse<ApiProjectAccess>> {
    return useQuery({
        queryKey: queryKeys.projectAccess(projectId ?? ""),
        queryFn: () => projectAPI.getAccessDetails(projectId ?? ""),
        enabled: !!projectId && projectId !== "undefined",
        retry: false,
        ...options,
    });
}

export function useOrganizationProjects(orgId: string | undefined): UseQueryResult<ApiProject[]> {
    return useQuery({
        queryKey: queryKeys.organizationProjects(orgId ?? ""),
        queryFn: () => projectAPI.listForOrganization(orgId ?? ""),
        enabled: !!orgId && orgId !== "undefined",
    });
}

export function useGrantProjectAccess(): UseMutationResult<
    ApiProjectAccess[],
    unknown,
    {
        projectId: string;
        entries: Array<{ principalType: 'user' | 'team'; principalId: string; role: 'view' | 'edit' | 'owner' }>;
    }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ projectId, entries }) => projectAPI.grantAccess(projectId, entries),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projectAccess(variables.projectId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
        },
    });
}

export function useRevokeProjectAccess(): UseMutationResult<
    unknown,
    unknown,
    {
        projectId: string;
        entries: Array<{ principalType: 'user' | 'team'; principalId: string }>;
    }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ projectId, entries }) => projectAPI.revokeAccess(projectId, entries),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projectAccess(variables.projectId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
        },
    });
}

export function useCreateProject(): UseMutationResult<ApiProject, unknown, CreateProjectInput> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: projectAPI.create,
        onSuccess: async (project) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            if (project.ownerType === 'org' && project.ownerUuid) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.organizationProjects(project.ownerUuid) });
            }
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

export function useCopyProject(): UseMutationResult<ApiAssetCopyResult, unknown, { id: string; options: ApiAssetCopyOptions }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, options }) => projectAPI.copy(id, options),
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
            if (data.project?.ownerType === 'org' && data.project.ownerUuid) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.organizationProjects(data.project.ownerUuid) });
            }
        },
    });
}
