import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getRunToken, setRunToken } from "@/lib/runTokens";
import { useRunWithValues } from "@/lib/vault-hooks";
import { isUUID, startRunFromSlug, startRunFromWorkflowId, type StepValue } from "@/pages/workflow-runner/runner.utils";
import type { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { usePreviewEnvironment } from "@/lib/previewRunner/usePreviewEnvironment";

const RESERVED_URL_PARAMS = ['ref', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'token', 'resume'];

function parseInitialValuesFromUrl(urlParams: URLSearchParams): Record<string, StepValue> {
  const initialValues: Record<string, StepValue> = {};
  for (const [key, value] of urlParams.entries()) {
    if (RESERVED_URL_PARAMS.includes(key)) {
      continue;
    }
    try {
      initialValues[key] = JSON.parse(value);
    } catch {
      initialValues[key] = value;
    }
  }
  return initialValues;
}

function consumeRunTokenFromUrl(runId: string, urlParams: URLSearchParams): void {
  if (typeof window === 'undefined') {
    return;
  }
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const tokenFromUrl = urlParams.get('token') ?? hashParams.get('token');
  if (!tokenFromUrl || !isUUID(runId)) {
    return;
  }
  setRunToken(runId, tokenFromUrl);

  const newUrl = new URL(window.location.href);
  newUrl.searchParams.delete('token');
  if (newUrl.hash.includes('token=')) {
    const hashParamsToClean = new URLSearchParams(newUrl.hash.substring(1));
    hashParamsToClean.delete('token');
    const newHash = hashParamsToClean.toString();
    newUrl.hash = newHash ? `#${newHash}` : '';
  }
  window.history.replaceState({}, '', newUrl.toString());
}

export function useRunSession(runId?: string, previewEnvironment?: PreviewEnvironment) {
  const [actualRunId, setActualRunId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const previewState = usePreviewEnvironment(previewEnvironment ?? null);
  const mode: 'preview' | 'production' = previewEnvironment ? 'preview' : 'production';

  useEffect(() => {
    if (previewEnvironment) {
      if (runId) setActualRunId(runId);
      setIsInitializing(false);
      return;
    }

    async function initialize() {
      if (!runId) {
        setInitError('No run ID provided');
        setIsInitializing(false);
        return;
      }
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const initialValues = parseInitialValuesFromUrl(urlParams);
        const initialValuesArg = Object.keys(initialValues).length > 0 ? initialValues : undefined;
        consumeRunTokenFromUrl(runId, urlParams);

        if (isUUID(runId)) {
          const runToken = getRunToken(runId);
          if (runToken) {
            setActualRunId(runId);
          } else {
            try {
              const runData = await startRunFromWorkflowId(runId, initialValuesArg);
              setActualRunId(runData.runId);
              setRunToken(runData.runId, runData.runToken);
            } catch (createError) {
              try {
                const publicRunData = await startRunFromSlug(runId, initialValuesArg);
                setActualRunId(publicRunData.runId);
                setRunToken(publicRunData.runId, publicRunData.runToken);
                return;
              } catch {
                // fall through
              }
              try {
                const response = await fetch(`/api/runs/${runId}`, { credentials: 'include' });
                if (response.ok) {
                  const result = await response.json();
                  const workflowId = result.data?.workflowId;
                  if (workflowId) {
                    const newRunData = await startRunFromWorkflowId(workflowId, initialValuesArg);
                    setActualRunId(newRunData.runId);
                    setRunToken(newRunData.runId, newRunData.runToken);
                    toast({
                      title: "New session started",
                      description: "Created a new run for this workflow",
                    });
                  } else {
                    throw new Error("Could not determine workflow ID");
                  }
                } else {
                  setActualRunId(runId);
                }
              } catch (fetchError) {
                setActualRunId(runId);
              }
            }
          }
        } else {
          const runData = await startRunFromSlug(runId, initialValuesArg);
          setActualRunId(runData.runId);
          setRunToken(runData.runId, runData.runToken);
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : 'Failed to load workflow');
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : 'Failed to load workflow',
          variant: "destructive",
        });
      } finally {
        setIsInitializing(false);
      }
    }
    void initialize();
  }, [runId, toast, previewEnvironment]);

  const { data: run } = useRunWithValues(actualRunId ?? '', {
    enabled: mode === 'production' && actualRunId !== null && !isInitializing,
  });

  const workflowId = mode === 'preview' ? previewState?.workflowId : run?.workflowId;

  return {
    actualRunId,
    isInitializing,
    initError,
    mode,
    previewState,
    run,
    workflowId,
  };
}
