/**
 * TanStack Query hooks for Vault-Logic API
 */
import { useQuery, useQueries, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { DevPanelBus } from "./devpanelBus";
import {
  fetchAPI,
  projectAPI,
  workflowAPI,
  versionAPI,
  snapshotAPI,
  variableAPI,
  sectionAPI,
  stepAPI,
  blockAPI,
  transformBlockAPI,
  runAPI,
  accountAPI,
  workflowModeAPI,
  collectionsAPI,
  dataSourceAPI,
  templateAPI,
  logicRuleAPI,
  type ApiProject,
  type ApiProjectWithWorkflows,
  type ApiWorkflow,
  type ApiSection,
  type ApiStep,
  type ApiBlock,
  type ApiTransformBlock,
  type ApiCollectionField
} from "./vault-api";

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
  WorkflowDiff,
  QualityScore,
  QualityScoreSchema
} from "../../../shared/types/ai";
// Re-export types for convenience
export type { ApiStep, ApiSection, ApiProject, ApiWorkflow, ApiBlock, ApiTransformBlock, ApiRun } from "./vault-api";
// ============================================================================
// Query Keys
// ============================================================================
export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectWorkflows: (projectId: string) => ["projects", projectId, "workflows"] as const,
  workflows: ["workflows"] as const,
  workflowsUnfiled: ["workflows", "unfiled"] as const,
  workflow: (id: string) => ["workflows", id] as const,
  versions: (workflowId: string) => ["workflows", workflowId, "versions"] as const,
  snapshots: (workflowId: string) => ["workflows", workflowId, "snapshots"] as const,
  snapshot: (workflowId: string, snapshotId: string) => ["workflows", workflowId, "snapshots", snapshotId] as const,
  variables: (workflowId: string) => ["workflows", workflowId, "variables"] as const,
  sections: (workflowId: string) => ["sections", workflowId] as const,
  section: (id: string) => ["sections", "single", id] as const,
  steps: (sectionId: string) => ["steps", sectionId] as const,
  step: (id: string) => ["steps", "single", id] as const,
  blocks: (workflowId: string, phase?: string) => ["blocks", workflowId, phase] as const,
  transformBlocks: (workflowId: string) => ["transformBlocks", workflowId] as const,
  transformBlock: (id: string) => ["transformBlocks", id] as const,
  runs: (workflowId: string) => ["runs", workflowId] as const,
  run: (id: string) => ["runs", id] as const,
  runWithValues: (id: string) => ["runs", id, "values"] as const,
  accountPreferences: ["account", "preferences"] as const,
  workflowMode: (workflowId: string) => ["workflows", workflowId, "mode"] as const,
  collections: (tenantId: string) => ["collections", tenantId] as const,
  collection: (tenantId: string, collectionId: string) => ["collections", tenantId, collectionId] as const,
  collectionFields: (tenantId: string, collectionId: string) => ["collections", tenantId, collectionId, "fields"] as const,
  collectionRecords: (tenantId: string, collectionId: string) => ["collections", tenantId, collectionId, "records"] as const,
  collectionRecord: (tenantId: string, collectionId: string, recordId: string) => ["collections", tenantId, collectionId, "records", recordId] as const,
  dataSources: ["dataSources"] as const,
  workflowDataSources: (workflowId: string) => ["workflows", workflowId, "dataSources"] as const,
  dataSource: (id: string) => ["dataSources", id] as const,
  logicRules: (workflowId: string) => ["workflows", workflowId, "logicRules"] as const,
};
// ============================================================================
// Projects
// ============================================================================
export function useProjects(activeOnly?: boolean) {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => projectAPI.list(activeOnly),
  });
}
export function useProject(id: string | undefined, options?: Omit<UseQueryOptions<ApiProjectWithWorkflows>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: queryKeys.project(id!),
    queryFn: () => projectAPI.get(id!),
    enabled: !!id && id !== "undefined",
    ...options,
  });
}
export function useProjectWorkflows(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectWorkflows(projectId!),
    queryFn: () => projectAPI.getWorkflows(projectId!),
    enabled: !!projectId && projectId !== "undefined",
  });
}
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ApiProject> & { id: string }) =>
      projectAPI.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.archive,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useUnarchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.unarchive,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useTransferProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetOwnerType, targetOwnerUuid }: {
      id: string;
      targetOwnerType: 'user' | 'org';
      targetOwnerUuid: string;
    }) => projectAPI.transfer(id, targetOwnerType, targetOwnerUuid),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
// ============================================================================
// Workflows
// ============================================================================
export function useWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: workflowAPI.list,
  });
}
export function useUnfiledWorkflows() {
  return useQuery({
    queryKey: queryKeys.workflowsUnfiled,
    queryFn: workflowAPI.listUnfiled,
  });
}
export function useWorkflow(id: string | undefined, options?: Omit<UseQueryOptions<ApiWorkflow>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: queryKeys.workflow(id!),
    queryFn: () => workflowAPI.get(id!),
    enabled: !!id && id !== "undefined",
    ...options,
  });
}
export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ApiWorkflow> & { id: string }) =>
      workflowAPI.update(id, data),
    onSuccess: (_, variables) => {
      // Invalidate the specific workflow and all its sub-resources (sections, steps, blocks, etc.)
      queryClient.invalidateQueries({ queryKey: ["workflows", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["sections", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["steps"] }); // Steps often have weird keys, safer to nuke 'em
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
    },
  });
}
export function useTransferWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetOwnerType, targetOwnerUuid }: {
      id: string;
      targetOwnerType: 'user' | 'org';
      targetOwnerUuid: string;
    }) => workflowAPI.transfer(id, targetOwnerType, targetOwnerUuid),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
    },
  });
}
export function useReviseWorkflow() {
  const _queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AIWorkflowRevisionRequest) => {
      // 1. Enqueue Job
      const initRes = await fetchAPI('/api/ai/workflows/revise', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const { jobId } = initRes as { jobId: string };
      if (!jobId) { throw new Error("Failed to start AI revision job"); }
      // 2. Poll for Completion
      const poll = async (): Promise<AIWorkflowRevisionResponse> => {
        const statusRes = await fetchAPI(`/api/ai/workflows/revise/${jobId}`);
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
    onSuccess: (_data) => {
      // User must review and apply manually
    },
  });
}
export function useGenerateWorkflow() {
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      description: string;
      category?: 'application' | 'survey' | 'intake' | 'onboarding' | 'request' | 'checklist' | 'general';
    }) => {
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
export function useConnectLogic() {
  return useMutation({
    mutationFn: (data: AIConnectLogicRequest) =>
      fetchAPI<AIConnectLogicResponse>('/api/ai/workflows/generate-logic', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
export function useDebugLogic() {
  return useMutation({
    mutationFn: (data: AIDebugLogicRequest) =>
      fetchAPI<AIDebugLogicResponse>('/api/ai/workflows/debug-logic', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
export function useVisualizeLogic() {
  return useMutation({
    mutationFn: (data: AIVisualizeLogicRequest) =>
      fetchAPI<AIVisualizeLogicResponse>('/api/ai/workflows/visualize-logic', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  });
}
export function useMoveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
      workflowAPI.moveToProject(id, projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowsUnfiled });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(data.id) });
      if (data.projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectWorkflows(data.projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.project(data.projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
export function useVersions(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.versions(workflowId!),
    queryFn: () => versionAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function usePublishWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, graphJson, notes }: { workflowId: string; graphJson: unknown; notes?: string }) =>
      versionAPI.publish(workflowId, { graphJson, notes }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.versions(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
    },
  });
}
export function useRestoreVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, versionId }: { workflowId: string; versionId: string }) =>
      versionAPI.restore(workflowId, versionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.versions(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
      // Invalidate everything basically
      queryClient.invalidateQueries({ queryKey: ["workflows", variables.workflowId] });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
// ============================================================================
// Workflow Snapshots
// ============================================================================
export function useSnapshots(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshots(workflowId!),
    queryFn: () => snapshotAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useSnapshot(workflowId: string | undefined, snapshotId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshot(workflowId!, snapshotId!),
    queryFn: () => snapshotAPI.get(workflowId!, snapshotId!),
    enabled: !!workflowId && workflowId !== "undefined" && !!snapshotId && snapshotId !== "undefined",
  });
}
export function useCreateSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, name }: { workflowId: string; name: string }) =>
      snapshotAPI.create(workflowId, name),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
    },
  });
}
export function useRenameSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, snapshotId, name }: { workflowId: string; snapshotId: string; name: string }) =>
      snapshotAPI.rename(workflowId, snapshotId, name),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot(variables.workflowId, variables.snapshotId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
    },
  });
}
export function useDeleteSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, snapshotId }: { workflowId: string; snapshotId: string }) =>
      snapshotAPI.delete(workflowId, snapshotId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
    },
  });
}
export function useSaveSnapshotFromRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, snapshotId, runId }: { workflowId: string; snapshotId: string; runId: string }) =>
      snapshotAPI.saveFromRun(workflowId, snapshotId, runId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot(variables.workflowId, variables.snapshotId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots(variables.workflowId) });
    },
  });
}
// ============================================================================
// Workflow Variables
// ============================================================================
export function useWorkflowVariables(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.variables(workflowId!),
    queryFn: () => variableAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
// ============================================================================
// Sections
// ============================================================================
export function useSections(workflowId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.sections(workflowId || ""),
    queryFn: () => sectionAPI.list(workflowId!),
    enabled: options?.enabled !== undefined ? options.enabled : !!workflowId && workflowId !== "undefined",
  });
}
export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: { workflowId: string; title: string; description?: string; order: number; config?: unknown }) =>
      sectionAPI.create(workflowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
export function useUpdateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId: _workflowId, ...data }: Partial<ApiSection> & { id: string; workflowId: string }) =>
      sectionAPI.update(id, data),
    onMutate: async (variables) => {
      const { id, workflowId, ...data } = variables;
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sections(workflowId) });
      // Snapshot the previous value
      const previousSections = queryClient.getQueryData<ApiSection[]>(queryKeys.sections(workflowId));
      // Optimistically update to the new value
      if (previousSections) {
        const updatedSections = previousSections.map((section) =>
          section.id === id ? { ...section, ...data } : section
        );
        queryClient.setQueryData(queryKeys.sections(workflowId), updatedSections);
      }
      // Return context with the previous value
      return { previousSections };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousSections) {
        queryClient.setQueryData(queryKeys.sections(variables.workflowId), context.previousSections);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
export function useReorderSections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, sections }: { workflowId: string; sections: Array<{ id: string; order: number }> }) =>
      sectionAPI.reorder(workflowId, sections),
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.sections(variables.workflowId) });
      // Snapshot the previous value
      const previousSections = queryClient.getQueryData<ApiSection[]>(queryKeys.sections(variables.workflowId));
      // Optimistically update to the new value
      if (previousSections) {
        const updatedSections = previousSections
          .map((section) => {
            const newOrder = variables.sections.find((s) => s.id === section.id);
            return newOrder ? { ...section, order: newOrder.order } : section;
          })
          .sort((a, b) => a.order - b.order); // Sort by order to match backend behavior
        queryClient.setQueryData(queryKeys.sections(variables.workflowId), updatedSections);
      }
      // Return context with the previous value
      return { previousSections };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousSections) {
        queryClient.setQueryData(queryKeys.sections(variables.workflowId), context.previousSections);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
    },
  });
}
export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; workflowId: string }) =>
      sectionAPI.delete(variables.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
// ============================================================================
// Steps
// ============================================================================
export function useSteps(sectionId: string | undefined, options?: Omit<UseQueryOptions<ApiStep[]>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: queryKeys.steps(sectionId!),
    queryFn: () => stepAPI.list(sectionId!),
    enabled: !!sectionId && sectionId !== "undefined",
    ...options,
  });
}
/**
 * Fetch steps for multiple sections at once
 * Returns a Record<sectionId, ApiStep[]>
 *
 * This hook respects React's Rules of Hooks by using useQueries
 * which always calls the same number of hooks based on the sections array
 */
export function useAllSteps(sections: ApiSection[]): Record<string, ApiStep[]> {
  const queries = useQueries({
    queries: sections.map((section) => ({
      queryKey: queryKeys.steps(section.id),
      queryFn: () => stepAPI.list(section.id),
      staleTime: 5000, // Cache for 5 seconds to avoid excessive refetches
    })),
  });
  // Combine results into a Record<sectionId, steps[]>
  const allSteps: Record<string, ApiStep[]> = {};
  sections.forEach((section, index) => {
    allSteps[section.id] = queries[index].data || [];
  });
  return allSteps;
}
export function useStep(stepId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.step(stepId!),
    queryFn: () => stepAPI.get(stepId!),
    enabled: !!stepId && stepId !== "undefined",
  });
}
export function useCreateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, ...data }: Omit<ApiStep, "id" | "createdAt"> & { sectionId: string }) =>
      stepAPI.create(sectionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
export function useUpdateStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sectionId: _sectionId, ...data }: Partial<ApiStep> & { id: string; sectionId: string }) =>
      stepAPI.update(id, data),
    onMutate: async (variables) => {
      const { id, sectionId, ...data } = variables;
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.steps(sectionId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.step(id) });
      // Snapshot the previous values
      const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(sectionId));
      const previousStep = queryClient.getQueryData<ApiStep>(queryKeys.step(id));
      // Optimistically update the steps list
      if (previousSteps) {
        const updatedSteps = previousSteps.map((step) =>
          step.id === id ? { ...step, ...data } : step
        );
        queryClient.setQueryData(queryKeys.steps(sectionId), updatedSteps);
      }
      // Optimistically update the single step
      if (previousStep) {
        queryClient.setQueryData(queryKeys.step(id), { ...previousStep, ...data });
      }
      // Return context with the previous values
      return { previousSteps, previousStep };
    },
    onError: (err, variables, context) => {
      // Rollback to previous values on error
      if (context?.previousSteps) {
        queryClient.setQueryData(queryKeys.steps(variables.sectionId), context.previousSteps);
      }
      if (context?.previousStep) {
        queryClient.setQueryData(queryKeys.step(variables.id), context.previousStep);
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.step(variables.id) });
      // Invalidate variables when step alias changes
      const section = data?.sectionId;
      if (section) {
        // Get workflowId from the section - we'll need to query for it
        // For simplicity, just invalidate all workflow variables queries
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
      }
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
export function useReorderSteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, steps }: { sectionId: string; steps: Array<{ id: string; order: number }> }) =>
      stepAPI.reorder(sectionId, steps),
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.steps(variables.sectionId) });
      // Snapshot the previous value
      const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(variables.sectionId));
      // Optimistically update to the new value
      if (previousSteps) {
        const updatedSteps = previousSteps.map((step) => {
          const newOrder = variables.steps.find((s) => s.id === step.id);
          return newOrder ? { ...step, order: newOrder.order } : step;
        });
        queryClient.setQueryData(queryKeys.steps(variables.sectionId), updatedSteps);
      }
      // Return context with the previous value
      return { previousSteps };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousSteps) {
        queryClient.setQueryData(queryKeys.steps(variables.sectionId), context.previousSteps);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
    },
  });
}
export function useDeleteStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; sectionId: string }) =>
      stepAPI.delete(variables.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
      DevPanelBus.emitWorkflowUpdate();
    },
  });
}
// ============================================================================
// Blocks
// ============================================================================
export function useBlocks(workflowId: string | undefined, phase?: string) {
  return useQuery({
    queryKey: queryKeys.blocks(workflowId!, phase),
    queryFn: () => blockAPI.list(workflowId!, phase as any),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useCreateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: Omit<ApiBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) => {
      if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
      return blockAPI.create(workflowId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}
export function useUpdateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId, ...data }: Partial<ApiBlock> & { id: string; workflowId: string }) => {
      if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
      return blockAPI.update(id, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}
export function useReorderBlocks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, blocks }: { workflowId: string; blocks: Array<{ id: string; order: number }> }) =>
      blockAPI.reorder(workflowId, blocks),
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["blocks", variables.workflowId] });
      // Snapshot the previous value
      const previousBlocks = queryClient.getQueryData<ApiBlock[]>(queryKeys.blocks(variables.workflowId));
      // Optimistically update to the new value
      if (previousBlocks) {
        const updatedBlocks = previousBlocks.map((block) => {
          const newOrder = variables.blocks.find((b) => b.id === block.id);
          return newOrder ? { ...block, order: newOrder.order } : block;
        });
        queryClient.setQueryData(queryKeys.blocks(variables.workflowId), updatedBlocks);
      }
      // Return context with the previous value
      return { previousBlocks };
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousBlocks) {
        queryClient.setQueryData(queryKeys.blocks(variables.workflowId), context.previousBlocks);
      }
    },
    onSettled: (_, __, variables) => {
      // Always refetch after error or success to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ["blocks", variables.workflowId] });
    },
  });
}
export function useDeleteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; workflowId: string }) =>
      blockAPI.delete(variables.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
    },
  });
}
// ============================================================================
// Transform Blocks
// ============================================================================
export function useTransformBlocks(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transformBlocks(workflowId!),
    queryFn: () => transformBlockAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useTransformBlock(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transformBlock(id!),
    queryFn: () => transformBlockAPI.get(id!),
    enabled: !!id && id !== "undefined",
  });
}
export function useCreateTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...data }: Omit<ApiTransformBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) => {
      if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
      return transformBlockAPI.create(workflowId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
    },
  });
}
export function useUpdateTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId, ...data }: Partial<ApiTransformBlock> & { id: string; workflowId: string }) => {
      if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
      return transformBlockAPI.update(id, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlock(variables.id) });
    },
  });
}
// ============================================================================
// Logic Rules
// ============================================================================
export function useLogicRules(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.logicRules(workflowId!),
    queryFn: () => logicRuleAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useDeleteTransformBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; workflowId: string }) =>
      transformBlockAPI.delete(variables.id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transformBlocks(variables.workflowId) });
    },
  });
}
export function useTestTransformBlock() {
  return useMutation({
    mutationFn: ({ id, testData }: { id: string; testData: Record<string, any> }) =>
      transformBlockAPI.test(id, testData),
  });
}
// ============================================================================
// Runs
// ============================================================================
export function useRuns(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.runs(workflowId!),
    queryFn: () => runAPI.list(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.run(id!),
    queryFn: () => runAPI.get(id!),
    enabled: !!id && id !== "undefined",
  });
}
export function useRunWithValues(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.runWithValues(id!),
    queryFn: () => runAPI.getWithValues(id!),
    enabled: options?.enabled !== undefined ? options.enabled : !!id && id !== "undefined",
  });
}
export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, queryParams, ...data }: { workflowId: string; participantId?: string; metadata?: any; queryParams?: Record<string, string> }) =>
      runAPI.create(workflowId, data, queryParams),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runs(variables.workflowId) });
    },
  });
}
export function useUpsertValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, stepId, value }: { runId: string; stepId: string; value: any }) =>
      runAPI.upsertValue(runId, stepId, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.runWithValues(variables.runId) });
    },
  });
}
export function useSubmitSection() {
  const _queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, sectionId, values }: { runId: string; sectionId: string; values: Array<{ stepId: string; value: any }> }) =>
      runAPI.submitSection(runId, sectionId, values),
    // Don't invalidate queries here - causes race condition with navigation state updates
    // Values are already saved to backend; local formValues state is the source of truth for UI
  });
}
export function useNext() {
  const _queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, currentSectionId }: { runId: string; currentSectionId: string }) =>
      runAPI.next(runId, currentSectionId),
    // Don't invalidate queries here - navigation state is managed locally in WorkflowRunner
    // Refetching causes race conditions that interfere with setCurrentSectionIndex updates
  });
}
export function useCompleteRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runAPI.complete,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.run(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.runs(data.workflowId) });
    },
  });
}
// ============================================================================
// Account & Mode Preferences
// ============================================================================
export function useAccountPreferences() {
  return useQuery({
    queryKey: queryKeys.accountPreferences,
    queryFn: () => accountAPI.getPreferences(),
  });
}
export function useUpdateAccountPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountAPI.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accountPreferences });
      // Invalidate all workflow modes since the default has changed
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
export function useWorkflowMode(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflowMode(workflowId!),
    queryFn: () => workflowModeAPI.getMode(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useSetWorkflowMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, modeOverride }: { workflowId: string; modeOverride: 'easy' | 'advanced' | null }) =>
      workflowModeAPI.setMode(workflowId, modeOverride),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowMode(variables.workflowId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
    },
  });
}
// ============================================================================
// Collections / Datastore (Stage 19)
// ============================================================================
export function useCollections(tenantId: string | undefined, withStats?: boolean) {
  return useQuery({
    queryKey: queryKeys.collections(tenantId!),
    queryFn: () => collectionsAPI.list(tenantId!, withStats),
    enabled: !!tenantId && tenantId !== "undefined",
  });
}
export function useCollection(tenantId: string | undefined, collectionId: string | undefined, withFields?: boolean) {
  return useQuery({
    queryKey: queryKeys.collection(tenantId!, collectionId!),
    queryFn: () => collectionsAPI.get(tenantId!, collectionId!, withFields),
    enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
  });
}
export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...data }: { tenantId: string; name: string; slug?: string; description?: string | null }) =>
      collectionsAPI.create(tenantId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
    },
  });
}
export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, ...data }: { tenantId: string; collectionId: string; name?: string; slug?: string; description?: string | null }) =>
      collectionsAPI.update(tenantId, collectionId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
    },
  });
}
export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId }: { tenantId: string; collectionId: string }) =>
      collectionsAPI.delete(tenantId, collectionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
    },
  });
}
// Fields
export function useCollectionFields(tenantId: string | undefined, collectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collectionFields(tenantId!, collectionId!),
    queryFn: () => collectionsAPI.listFields(tenantId!, collectionId!),
    enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
  });
}
export function useCreateCollectionField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, ...data }: { tenantId: string; collectionId: string } & Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) =>
      collectionsAPI.createField(tenantId, collectionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
    },
  });
}
export function useUpdateCollectionField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, fieldId, ...data }: { tenantId: string; collectionId: string; fieldId: string } & Partial<Pick<ApiCollectionField, 'name' | 'slug' | 'isRequired' | 'options' | 'defaultValue'>>) =>
      collectionsAPI.updateField(tenantId, collectionId, fieldId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
    },
  });
}
export function useDeleteCollectionField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, fieldId }: { tenantId: string; collectionId: string; fieldId: string }) =>
      collectionsAPI.deleteField(tenantId, collectionId, fieldId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
    },
  });
}
// Records
export function useCollectionRecords(tenantId: string | undefined, collectionId: string | undefined, params?: { limit?: number; offset?: number; orderBy?: 'created_at' | 'updated_at'; order?: 'asc' | 'desc'; includeCount?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.collectionRecords(tenantId!, collectionId!), params],
    queryFn: () => collectionsAPI.listRecords(tenantId!, collectionId!, params),
    enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
  });
}
export function useCollectionRecord(tenantId: string | undefined, collectionId: string | undefined, recordId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collectionRecord(tenantId!, collectionId!, recordId!),
    queryFn: () => collectionsAPI.getRecord(tenantId!, collectionId!, recordId!),
    enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined" && !!recordId && recordId !== "undefined",
  });
}
export function useCreateCollectionRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, data }: { tenantId: string; collectionId: string; data: Record<string, any> }) =>
      collectionsAPI.createRecord(tenantId, collectionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
    },
  });
}
export function useUpdateCollectionRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, recordId, data }: { tenantId: string; collectionId: string; recordId: string; data: Record<string, any> }) =>
      collectionsAPI.updateRecord(tenantId, collectionId, recordId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecord(variables.tenantId, variables.collectionId, variables.recordId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
    },
  });
}
export function useDeleteCollectionRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, collectionId, recordId }: { tenantId: string; collectionId: string; recordId: string }) =>
      collectionsAPI.deleteRecord(tenantId, collectionId, recordId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
    },
  });
}
// ============================================================================
// Data Sources
// ============================================================================
export function useDataSources() {
  return useQuery({
    queryKey: queryKeys.dataSources,
    queryFn: dataSourceAPI.list,
  });
}
export function useWorkflowDataSources(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflowDataSources(workflowId!),
    queryFn: () => dataSourceAPI.listForWorkflow(workflowId!),
    enabled: !!workflowId && workflowId !== "undefined",
  });
}
export function useLinkDataSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
      dataSourceAPI.linkToWorkflow(id, workflowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowDataSources(variables.workflowId) });
    },
  });
}
export function useUnlinkDataSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
      dataSourceAPI.unlinkFromWorkflow(id, workflowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowDataSources(variables.workflowId) });
    },
  });
}
// ============================================================================
// Templates
// ============================================================================
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: templateAPI.list,
  });
}

export function useTemplatePlaceholders(templateId: string | undefined) {
  return useQuery({
    queryKey: ["templates", templateId, "placeholders"],
    queryFn: () => templateAPI.getPlaceholders(templateId!),
    enabled: !!templateId && templateId !== "undefined",
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
export function useActiveTemplateVariables(projectId: string | undefined, sectionConfig: any) {
  // Extract template IDs from config
  const templateIds: string[] = Array.isArray(sectionConfig?.templates)
    ? sectionConfig.templates
    : [];
  const queries = useQueries({
    queries: templateIds.map((id) => ({
      queryKey: ["templates", id, "placeholders"],
      queryFn: () => templateAPI.getPlaceholders(id),
      staleTime: 1000 * 60 * 5,
    })),
  });
  // Aggregate required variables
  const requiredVariables = new Set<string>();
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  if (!isLoading && !isError) {
    queries.forEach((query) => {
      if (query.data?.placeholders) {
        query.data.placeholders.forEach((p) => {
          if (p.type === 'variable' || p.type === 'text') { // Assuming 'text' is default from service
            requiredVariables.add(p.name);
          }
        });
      }
    });
  }
  return {
    requiredVariables: Array.from(requiredVariables),
    isLoading,
    isError
  };
}