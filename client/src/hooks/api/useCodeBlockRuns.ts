import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchAPI, type ApiAdvanceBlockState, type ApiWorkflowVariable } from '@/lib/vault-api';

export interface PreviewVariable extends ApiWorkflowVariable {
  declaredType: string;
  isVirtual: boolean;
  source: 'question' | 'code block' | 'inbound';
  blockStepId?: string;
}
export interface CodeBlockInspectorData {
  variables: PreviewVariable[];
  blockStates: ApiAdvanceBlockState[];
}

/** Bootstrap metadata/state only. Never poll: advance supplies live states and values. */
export function useCodeBlockRuns(runId: string | null, enabled: boolean): UseQueryResult<CodeBlockInspectorData, Error> {
  return useQuery({
    queryKey: ['code-block-inspector', runId],
    queryFn: () => fetchAPI<CodeBlockInspectorData>(`/api/runs/${runId}/code-blocks`),
    enabled: enabled && runId !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
