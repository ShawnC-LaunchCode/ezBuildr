/**
 * Visual Workflow Builder - Stage 7
 * Full Afterpattern-style visual builder using React Flow
 */
import { ArrowLeft, Share2, Clock, BarChart3 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useParams, useLocation } from 'wouter';

import { DropoffList } from '@/components/analytics/DropoffList';
import { WorkflowHealthPanel } from '@/components/analytics/WorkflowHealthPanel';
import { ShareWorkflowDialog } from '@/components/dashboard/ShareWorkflowDialog';
import { WorkflowHistoryDialog } from '@/components/history/WorkflowHistoryDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { blueprintAPI } from '@/lib/vault-api';

import { BuilderCanvas } from './visual-builder/components/BuilderCanvas';
import { ConnectionsPanel } from './visual-builder/components/ConnectionsPanel';
import { NodeSidebar } from './visual-builder/components/NodeSidebar';
import { PreviewPanel } from './visual-builder/components/PreviewPanel';
import { Toolbar } from './visual-builder/components/Toolbar';
import { useWorkflowGraph, useUpdateWorkflow } from './visual-builder/hooks/useWorkflowAPI';
import { useBuilderStore } from './visual-builder/store/useBuilderStore';
export default function VisualWorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string>('current');
  const { data: workflow, isLoading } = useWorkflowGraph(workflowId);
  const updateWorkflow = useUpdateWorkflow(workflowId);
  const { user } = useAuth();
  // Safe default: If we can't verify owner, assume read-only if it's not our own
  const isReadOnly = workflow && user ? workflow.creatorId !== user.id : false;
  const {
    loadGraph,
    exportGraph,
    isDirty,
    setDirty,
    setSaving,
    setSaveError,
    nodes,
    duplicateNode,
    deleteNode,
    selectedNodeId,
  } = useBuilderStore();
  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !workflowId) {return;}
    try {
      await blueprintAPI.create({ name: templateName, sourceWorkflowId: workflowId });
      toast({
        title: "Success",
        description: "Template created successfully.",
      });
      setShowSaveTemplateDialog(false);
      setTemplateName('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    }
  };
  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      // Save: Cmd+S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isReadOnly) {
          toast({ title: 'View Only', description: 'You cannot save changes in view-only mode.', variant: 'destructive' });
          return;
        }
        setSaving(true);
        const graphJson = exportGraph();
        updateWorkflow.mutate(graphJson, {
          onSuccess: () => {
            setDirty(false);
            setSaveError(null);
            setSaving(false);
            toast({ title: 'Saved', description: 'Workflow saved successfully.' });
          },
          onError: (err) => {
            setSaveError(err.message);
            setSaving(false);
          }
        });
      }
      // Preview: Cmd+Enter
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        setShowPreview(prev => !prev);
      }
      // Duplicate: Cmd+D
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        if (isReadOnly) {return;}
        if (selectedNodeId) {
          duplicateNode(selectedNodeId);
          toast({ title: 'Duplicated', description: 'Block duplicated.' });
        }
      }
      // Delete: Backspace or Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Warning: destructive action. Only if node selected.
        if (isReadOnly) {return;}
        if (selectedNodeId) {
          // In a real app we might want confirmation, but for power users direct delete is common.
          deleteNode(selectedNodeId);
          toast({ title: 'Deleted', description: 'Block deleted.' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, duplicateNode, deleteNode, exportGraph, updateWorkflow, setSaving, setDirty, setSaveError, toast]);
  // Load workflow graph on mount
  useEffect(() => {
    if (workflow?.currentVersion?.graphJson) {
      loadGraph(workflow.currentVersion.graphJson);
    }
  }, [workflow, loadGraph]);
  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!isDirty || !workflowId || isReadOnly) {return;}
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
              onClick={() => { void navigate('/workflows'); }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-xl font-semibold">{workflow.name}</h1>
            <Button variant="outline" size="sm" onClick={() => { void navigate(`/workflows/${workflowId}/builder`); }}>
              Standard Builder
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { void setShowHistoryDialog(true); }}>
              <Clock className="w-4 h-4 mr-2" />
              History
            </Button>
            <Button variant="outline" size="sm" onClick={() => { void setShowInsights(true); }}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Insights
            </Button>
            <Button variant="outline" size="sm" onClick={() => { void setShowShareDialog(true); }}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <span className="sr-only">Open menu</span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                  >
                    <path
                      d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                      fill="currentColor"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setTemplateName(`${workflow.name  } Template`);
                  setShowSaveTemplateDialog(true);
                }}>
                  Save as Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Toolbar */}
        <Toolbar
          workflowId={workflowId}
          workflowStatus={workflow.status}
          onRunPreview={() => setShowPreview(!showPreview)}
          readOnly={isReadOnly}
          selectedVersion={selectedVersion}
          onVersionChange={setSelectedVersion}
        />
        {/* Main Layout: Left Panel | Canvas | Right Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Connections */}
          <div className="w-64 border-r bg-card overflow-y-auto">
            <ConnectionsPanel />
          </div>
          {/* Center - Canvas */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
            {selectedVersion !== 'current' && (
              <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm text-center border-b border-amber-200">
                You are viewing an older version of this workflow. <Button variant="link" className="h-auto p-0 text-amber-900 font-semibold ml-1" onClick={() => { void setSelectedVersion('current'); }}>Switch to current</Button>
              </div>
            )}
            <div className="flex-1 relative">
              <BuilderCanvas readOnly={isReadOnly} />
              {isReadOnly && selectedVersion === 'current' && (
                <div className="absolute top-4 right-1/2 translate-x-1/2 bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-medium border border-amber-200 shadow-sm z-50 pointer-events-none">
                  View Only
                </div>
              )}
            </div>
          </div>
          {/* Right Panel - Inspector or Preview */}
          {showPreview ? (
            <div className="w-96 bg-muted/30 overflow-y-auto">
              <PreviewPanel
                workflowId={workflowId}
                onClose={() => setShowPreview(false)}
              />
            </div>
          ) : (
            <div className="w-96 border-l bg-card overflow-y-auto">
              {isReadOnly ? (
                <div className="p-8 text-center text-muted-foreground mt-10">
                  <p>You have view-only access.</p>
                  <p className="text-xs mt-2">Contact the owner to request edit permissions.</p>
                </div>
              ) : (
                <NodeSidebar />
              )}
            </div>
          )}
        </div>
      </div>
      <ShareWorkflowDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        workflowId={workflowId}
        workflowTitle={workflow?.name || ''}
      />
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Create a reusable template from this workflow. Future changes to this workflow will not affect the template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => { void setTemplateName(e.target.value); }}
                placeholder="My Awesome Template"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void setShowSaveTemplateDialog(false); }}>Cancel</Button>
            <Button onClick={() => { void handleSaveTemplate(); }} disabled={!templateName.trim()}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WorkflowHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        workflowId={workflowId}
      />
      <Dialog open={showInsights} onOpenChange={setShowInsights}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Workflow Insights
            </DialogTitle>
            <DialogDescription>
              Performance metrics and user flow analysis for {selectedVersion === 'current' ? 'Current Version' : 'Selected Version'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-8 py-4">
            {/* Health Stats */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Health Overview (30d)</h3>
              </div>
              <WorkflowHealthPanel
                workflowId={workflowId}
                versionId={selectedVersion === 'current' ? undefined : selectedVersion}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Dropoff Funnel */}
              <div className="md:col-span-2 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Conversion Funnel</h3>
                <DropoffList
                  workflowId={workflowId}
                  versionId={selectedVersion === 'current' ? workflow?.currentVersionId! : selectedVersion}
                />
              </div>
              {/* Future: Heatmap or other insights */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Optimization Tips</h3>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-900 space-y-3">
                  <p>
                    <strong>Tip:</strong> High drop-off on "Contact Info"? Try moving it later in the workflow.
                  </p>
                  <p>
                    <strong>Tip:</strong> Users taking &gt;5m? Consider breaking into multiple pages.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ReactFlowProvider>
  );
}