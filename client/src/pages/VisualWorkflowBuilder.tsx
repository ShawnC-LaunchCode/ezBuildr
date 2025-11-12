/**
 * Visual Workflow Builder - Stage 7
 * Full Afterpattern-style visual builder using React Flow
 */

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ReactFlowProvider } from 'reactflow';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

import { BuilderCanvas } from './visual-builder/components/BuilderCanvas';
import { NodeSidebar } from './visual-builder/components/NodeSidebar';
import { Toolbar } from './visual-builder/components/Toolbar';
import { PreviewPanel } from './visual-builder/components/PreviewPanel';
import { ConnectionsPanel } from './visual-builder/components/ConnectionsPanel';

import { useBuilderStore } from './visual-builder/store/useBuilderStore';
import { useWorkflowGraph, useUpdateWorkflow } from './visual-builder/hooks/useWorkflowAPI';

export default function VisualWorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showPreview, setShowPreview] = useState(false);

  const { data: workflow, isLoading } = useWorkflowGraph(workflowId);
  const updateWorkflow = useUpdateWorkflow(workflowId!);

  const {
    loadGraph,
    exportGraph,
    isDirty,
    setDirty,
    setSaving,
    setSaveError,
  } = useBuilderStore();

  // Load workflow graph on mount
  useEffect(() => {
    if (workflow?.currentVersion?.graphJson) {
      loadGraph(workflow.currentVersion.graphJson);
    }
  }, [workflow, loadGraph]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!isDirty || !workflowId) return;

    const timeoutId = setTimeout(async () => {
      try {
        setSaving(true);
        const graphJson = exportGraph();
        await updateWorkflow.mutateAsync(graphJson);
        setDirty(false);
        setSaveError(null);
      } catch (error) {
        setSaveError((error as Error).message);
        toast({
          title: 'Error saving workflow',
          description: (error as Error).message,
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timeoutId);
  }, [isDirty, workflowId, exportGraph, updateWorkflow, setDirty, setSaving, setSaveError, toast]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Workflow not found</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <div className="border-b px-6 py-3 flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/workflows')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-xl font-semibold">{workflow.name}</h1>
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar
          workflowId={workflowId!}
          workflowStatus={workflow.status}
          onRunPreview={() => setShowPreview(!showPreview)}
        />

        {/* Main Layout: Left Panel | Canvas | Right Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Connections */}
          <div className="w-64 border-r bg-card overflow-y-auto">
            <ConnectionsPanel />
          </div>

          {/* Center - Canvas */}
          <div className="flex-1 overflow-hidden">
            <BuilderCanvas />
          </div>

          {/* Right Panel - Inspector or Preview */}
          {showPreview ? (
            <div className="w-96 bg-muted/30 overflow-y-auto">
              <PreviewPanel
                workflowId={workflowId!}
                onClose={() => setShowPreview(false)}
              />
            </div>
          ) : (
            <div className="w-96 border-l bg-card overflow-y-auto">
              <NodeSidebar />
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
