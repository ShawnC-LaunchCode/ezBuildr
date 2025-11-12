/**
 * API hooks for Stage 7 Visual Builder
 * Integrates with Stage 4 Workflows API endpoints
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Types
// ============================================================================

export interface WorkflowGraph {
  nodes: Array<{
    id: string;
    type: 'question' | 'compute' | 'branch' | 'template';
    position?: { x: number; y: number };
    config: any;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  startNodeId?: string;
}

export interface Workflow {
  id: string;
  name: string;
  projectId: string;
  status: 'draft' | 'published' | 'archived';
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion?: WorkflowVersion;
  project?: {
    id: string;
    name: string;
    tenantId: string;
  };
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  graphJson: WorkflowGraph;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  versionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  trace: Array<{
    nodeId: string;
    executed: boolean;
    skipped?: boolean;
    conditionResult?: boolean;
    error?: string;
  }>;
  createdAt: string;
  completedAt: string | null;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch workflow by ID with current version
 */
export function useWorkflowGraph(workflowId: string | undefined) {
  return useQuery<Workflow>({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchAPI<Workflow>(`/api/workflows/${workflowId}`),
    enabled: !!workflowId,
  });
}

/**
 * Update workflow graph (PATCH /workflows/:id)
 */
export function useUpdateWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (graphJson: WorkflowGraph) =>
      fetchAPI<Workflow>(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ graphJson }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving workflow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Publish workflow (POST /workflows/:id/publish)
 */
export function usePublishWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: () =>
      fetchAPI<Workflow>(`/api/workflows/${workflowId}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      toast({
        title: 'Workflow published',
        description: 'Your workflow has been published successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error publishing workflow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * List workflow versions
 */
export function useWorkflowVersions(workflowId: string | undefined) {
  return useQuery<{ data: WorkflowVersion[] }>({
    queryKey: ['workflow-versions', workflowId],
    queryFn: () => fetchAPI<{ data: WorkflowVersion[] }>(`/api/workflows/${workflowId}/versions`),
    enabled: !!workflowId,
  });
}

/**
 * Run workflow with debug mode (POST /workflows/:id/run?debug=true)
 */
export function useRunWorkflow(workflowId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (inputs: Record<string, any>) =>
      fetchAPI<WorkflowRun>(`/api/workflows/${workflowId}/run?debug=true`, {
        method: 'POST',
        body: JSON.stringify({ inputs }),
      }),
    onError: (error: Error) => {
      toast({
        title: 'Error running workflow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Validate workflow graph
 */
export function useValidateWorkflow() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (graphJson: WorkflowGraph) =>
      fetchAPI<{ valid: boolean; errors: any[] }>('/api/workflows/validate', {
        method: 'POST',
        body: JSON.stringify({ graphJson }),
      }),
    onError: (error: Error) => {
      toast({
        title: 'Validation error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Fetch workflow run details
 */
export function useWorkflowRun(runId: string | undefined) {
  return useQuery<WorkflowRun>({
    queryKey: ['workflow-run', runId],
    queryFn: () => fetchAPI<WorkflowRun>(`/api/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Refetch every 2s if running, stop if completed/failed
      if (data?.status === 'running' || data?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}
