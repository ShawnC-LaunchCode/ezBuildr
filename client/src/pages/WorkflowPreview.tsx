import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Eye, RotateCcw, Loader2, Camera, Save, Shuffle, FileText, Bug, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowRunner } from "./WorkflowRunner";
import { PreviewEnvironment } from "@/lib/previewRunner/PreviewEnvironment";
import { DevToolsPanel } from "@/components/devtools/DevToolsPanel";
import { hotReloadManager } from "@/lib/previewRunner/HotReloadManager";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ApiSection, ApiStep } from "@/lib/vault-api";

export default function WorkflowPreview() {
  const { workflowId = "" } = useParams<{ workflowId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Preview Environment State
  const [env, setEnv] = useState<PreviewEnvironment | null>(null);
  const [showDevTools, setShowDevTools] = useState(true);
  const [previewRunId, setPreviewRunId] = useState<string | null>(null);
  const [previewRunToken, setPreviewRunToken] = useState<string | null>(null);

  // Get snapshot ID from query params
  const searchParams = new URLSearchParams(window.location.search);
  const snapshotId = searchParams.get("snapshotId");

  // Fetch workflow data (sections + steps + logic rules) in a single call
  const { data: workflow, isLoading: loadingWorkflow, error: workflowError } = useQuery({
    queryKey: ["preview-workflow", workflowId],
    queryFn: async () => {
      // console.log('[WorkflowPreview] Fetching workflow:', workflowId);
      const response = await fetch(`/api/workflows/${workflowId}`, {
        credentials: "include",
        cache: "no-cache", // Disable HTTP caching
      });

      // console.log('[WorkflowPreview] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('[WorkflowPreview] API error:', error);
        throw new Error(error.error || 'Failed to load workflow');
      }

      const data = await response.json();
      // console.log('[WorkflowPreview] RAW API Response:', data);
      // console.log('[WorkflowPreview] data.sections type:', typeof data.sections);
      // console.log('[WorkflowPreview] data.sections value:', data.sections);
      // console.log('[WorkflowPreview] Workflow data received:', {
      //   id: data.id,
      //   sectionsCount: data.sections?.length || 0,
      //   hasLogicRules: !!data.logicRules
      // });
      return data;
    },
    enabled: !!workflowId,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache in React Query
  });

  // Log any query errors
  if (workflowError) {
    console.error('[WorkflowPreview] Query error:', workflowError);
  }

  // Extract steps from workflow sections (backend returns sections with steps nested)
  const allSteps = workflow?.sections?.flatMap((section: any) => section.steps || []) || [];

  // Fetch snapshot values if snapshotId is provided
  const { data: snapshotValues, isLoading: loadingSnapshot } = useQuery({
    queryKey: ["snapshot-values", snapshotId],
    queryFn: async () => {
      if (!snapshotId) return null;

      const response = await fetch(`/api/workflows/${workflowId}/snapshots/${snapshotId}/values`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error('Failed to load snapshot values');
      }

      return response.json();
    },
    enabled: !!snapshotId && !!workflowId,
  });

  // Create a preview run for document generation
  useEffect(() => {
    if (!workflowId || previewRunId) return; // Only create once

    async function createPreviewRun() {
      try {
        // console.log('[WorkflowPreview] Creating preview run for document generation');
        const response = await fetch(`/api/workflows/${workflowId}/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to create preview run');
        }

        const result = await response.json();
        // console.log('[WorkflowPreview] Preview run created:', result.data);

        setPreviewRunId(result.data.runId);
        setPreviewRunToken(result.data.runToken);

        // Store runToken in localStorage for WorkflowRunner to use
        if (result.data.runToken) {
          localStorage.setItem(`run_token_${result.data.runId}`, result.data.runToken);
          localStorage.setItem('active_run_token', result.data.runToken);
        }
      } catch (error) {
        console.error('[WorkflowPreview] Error creating preview run:', error);
      }
    }

    createPreviewRun();
  }, [workflowId, previewRunId]);

  // Hot Reload Listener
  useEffect(() => {
    if (env && workflow && allSteps) {
      hotReloadManager.attach(env);
      // If we had a real signal, we would call env.updateSchema() here
      // For now, attaching allows the manager to drive it
    }
    return () => hotReloadManager.detach();
  }, [env, workflow, allSteps]);


  // Initialize Preview Environment
  useEffect(() => {
    /*
    console.log('[WorkflowPreview] Environment initialization check:', {
      hasWorkflow: !!workflow,
      hasAllSteps: !!allSteps,
      stepsLength: allSteps?.length,
      hasSections: !!workflow?.sections,
      sectionsLength: workflow?.sections?.length,
      snapshotId,
      loadingSnapshot,
    });
    */

    if (workflow && allSteps && workflow.sections) {
      // Guard: Don't recreate if we already have an environment for this workflow
      if (env && env.getState && env.getState().workflowId === workflow.id) {
        return;
      }

      // If snapshot is being loaded, wait for it
      if (snapshotId && loadingSnapshot) {
        console.log('[WorkflowPreview] Waiting for snapshot to load...');
        return;
      }

      // Convert alias-based snapshot values if needed
      let initialValues = {};

      if (snapshotId && snapshotValues) {
        const stepIdValues: Record<string, any> = {};
        for (const [key, value] of Object.entries(snapshotValues)) {
          const step = allSteps.find((s: ApiStep) => s.alias === key || s.id === key);
          if (step) stepIdValues[step.id] = value;
        }
        initialValues = stepIdValues;

        toast({
          title: "Snapshot Loaded",
          description: `Loaded ${Object.keys(stepIdValues).length} values from snapshot`,
        });
      }

      /*
      console.log('[WorkflowPreview] Creating preview environment with:', {
        workflowId: workflow.id,
        sectionsCount: workflow.sections.length,
        stepsCount: allSteps.length,
        initialValuesCount: Object.keys(initialValues).length,
      });
      */

      const newEnv = new PreviewEnvironment({
        workflowId: workflow.id,
        sections: workflow.sections,
        steps: allSteps,
        initialValues,
      });

      setEnv(newEnv);
      // console.log('[WorkflowPreview] Preview environment created successfully');
    }
  }, [workflow?.id, allSteps?.length, snapshotId, loadingSnapshot, toast]);

  // Navigate back to builder
  const navigateToBuilder = () => {
    navigate(`/workflows/${workflowId}/builder`);
  };

  // Reset preview - reset values to defaults/URL params and delete documents
  const handleReset = async () => {
    if (!env) return;

    try {
      console.log('[WorkflowPreview] Resetting preview to defaults/URL params');

      // Step 1: Reset form values to defaults/URL parameters
      env.reset();

      // Step 2: Delete generated documents from database (if any)
      if (previewRunId) {
        const runToken = previewRunToken || localStorage.getItem(`run_token_${previewRunId}`);

        try {
          const deleteResponse = await fetch(`/api/runs/${previewRunId}/documents`, {
            method: 'DELETE',
            headers: {
              ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
            },
            credentials: 'include'
          });

          if (deleteResponse.ok) {
            console.log('[WorkflowPreview] Documents deleted successfully');
          } else if (deleteResponse.status !== 404) {
            // 404 is fine - no documents to delete
            console.warn('[WorkflowPreview] Failed to delete documents:', deleteResponse.status);
          }
        } catch (error) {
          console.warn('[WorkflowPreview] Error deleting documents (non-critical):', error);
          // Don't fail the reset if document deletion fails
        }

        // Step 3: Clear document cache
        queryClient.removeQueries({ queryKey: ["run-documents", previewRunId] });
        queryClient.invalidateQueries({ queryKey: ["run-documents", previewRunId] });
      }

      toast({
        title: "Preview Reset",
        description: "All values reset to defaults/URL params. Documents cleared.",
      });
    } catch (error) {
      console.error('[WorkflowPreview] Error resetting preview:', error);
      toast({
        title: "Error",
        description: "Failed to reset preview",
        variant: "destructive"
      });
    }
  };

  // Clear documents and regenerate with updated values
  const handleClearDocuments = async () => {
    if (!previewRunId || !env) return;

    try {
      console.log('[WorkflowPreview] Clearing documents and regenerating with updated values');

      // Step 1: Save current form values to database (in case they changed)
      const allValues = env.getValues();
      const valuesToSave = Object.entries(allValues).map(([stepId, value]) => ({
        stepId,
        value
      }));

      console.log('[WorkflowPreview] Saving updated values:', { count: valuesToSave.length });

      const runToken = previewRunToken || localStorage.getItem(`run_token_${previewRunId}`);

      // Save values to database
      const saveResponse = await fetch(`/api/runs/${previewRunId}/values/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ values: valuesToSave })
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save updated values');
      }

      console.log('[WorkflowPreview] Values saved successfully');

      // Step 2: Delete old documents from database
      const deleteResponse = await fetch(`/api/runs/${previewRunId}/documents`, {
        method: 'DELETE',
        headers: {
          ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
        },
        credentials: 'include'
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete old documents');
      }

      console.log('[WorkflowPreview] Old documents deleted successfully');

      // Step 3: Trigger document regeneration with updated values
      const generateResponse = await fetch(`/api/runs/${previewRunId}/generate-documents`, {
        method: 'POST',
        headers: {
          ...(runToken ? { 'Authorization': `Bearer ${runToken}` } : {})
        },
        credentials: 'include'
      });

      if (!generateResponse.ok) {
        throw new Error('Failed to trigger document regeneration');
      }

      console.log('[WorkflowPreview] Document regeneration triggered');

      // Step 4: Clear the document cache and refetch
      queryClient.removeQueries({ queryKey: ["run-documents", previewRunId] });
      queryClient.invalidateQueries({ queryKey: ["run-documents", previewRunId] });

      toast({
        title: "Updating Documents",
        description: "Regenerating documents with your updated values...",
      });
    } catch (error) {
      console.error('[WorkflowPreview] Error clearing documents:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to clear documents",
        variant: "destructive"
      });
    }
  };

  // Handle preview completion (callback)
  const handlePreviewComplete = () => {
    toast({
      title: "Preview Complete",
      description: "Preview workflow completed. Returning to builder...",
    });
    // Optional: stay on summary screen or navigate back
  };

  if (loadingWorkflow || loadingSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading preview{snapshotId ? ' snapshot' : ''}...</span>
        </div>
      </div>
    );
  }

  if (!workflow || !env) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-destructive mb-2">Failed to load preview</p>
          {!workflow && <p className="text-sm text-muted-foreground">Workflow data could not be loaded</p>}
          {workflow && !env && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Environment initialization failed</p>
              <p>Sections: {workflow.sections?.length || 0}</p>
              <p>Steps: {allSteps?.length || 0}</p>
            </div>
          )}
          <Button onClick={navigateToBuilder} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Builder
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Preview Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-primary">
              Preview Mode {snapshotId && <span className="text-xs">• Snapshot Loaded</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              In-memory only — no data is saved to the database
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDevTools ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowDevTools(!showDevTools)}
            className="gap-2"
          >
            <Bug className="w-4 h-4" />
            DevTools
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearDocuments}
            title="Save current values and regenerate documents"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Update Docs
          </Button>

          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset All
          </Button>

          <Button variant="outline" size="sm" onClick={navigateToBuilder}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Builder
          </Button>
        </div>
      </div>

      {/* Runner Content */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 h-full overflow-auto relative">
          <WorkflowRunner
            runId={previewRunId || undefined}
            previewEnvironment={env}
            onPreviewComplete={handlePreviewComplete}
          />
        </div>

        {/* DevTools Sidebar */}
        <DevToolsPanel
          env={env}
          isOpen={showDevTools}
          onClose={() => setShowDevTools(false)}
        />
      </div>
    </div>
  );
}
