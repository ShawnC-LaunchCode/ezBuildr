// @ts-nocheck
import { useEffect, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { BuilderCanvas } from '@/pages/visual-builder/components/BuilderCanvas';
import { ConnectionsPanel } from '@/pages/visual-builder/components/ConnectionsPanel';
import { NodeSidebar } from '@/pages/visual-builder/components/NodeSidebar';
import { PreviewPanel } from '@/pages/visual-builder/components/PreviewPanel';
import { Toolbar } from '@/pages/visual-builder/components/Toolbar';
import { useVisualBuilderShortcuts } from '@/pages/visual-builder/hooks/useVisualBuilderShortcuts';
import { useWorkflowGraph, useUpdateWorkflow } from '@/pages/visual-builder/hooks/useWorkflowAPI';
import { useBuilderStore } from '@/pages/visual-builder/store/useBuilderStore';

interface VisualBuilderTabProps {
    workflowId: string;
    readOnly?: boolean;
}

export function VisualBuilderTab({ workflowId, readOnly: propReadOnly }: VisualBuilderTabProps) {
    const [showPreview, setShowPreview] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<string>('current');

    const { data: workflow, isLoading } = useWorkflowGraph(workflowId);
    const updateWorkflow = useUpdateWorkflow(workflowId);
    const { user } = useAuth();

    // Determine if read-only
    const isReadOnly = propReadOnly ?? (workflow && user ? workflow.creatorId !== user.id : false);

    const {
        loadGraph,
        exportGraph,
        isDirty,
        setDirty,
        setSaving,
        setSaveError,
        duplicateNode,
        deleteNode,
        selectedNodeId,
    } = useBuilderStore();

    // Keyboard Shortcuts
    useVisualBuilderShortcuts({
        isReadOnly: !!isReadOnly,
        selectedNodeId,
        duplicateNode,
        deleteNode,
        exportGraph,
        updateWorkflow,
        setSaving,
        setDirty,
        setSaveError,
        setShowPreview
    });

    // Load workflow graph
    useEffect(() => {
        if (workflow?.currentVersion?.graphJson) {
            loadGraph(workflow.currentVersion.graphJson);
        }
    }, [workflow, loadGraph]);

    // Auto-save
    useEffect(() => {
        if (!isDirty || !workflowId || isReadOnly) { return; }

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const timeoutId = setTimeout(async () => {
            try {
                setSaving(true);
                const graphJson = exportGraph();
                await updateWorkflow.mutateAsync(graphJson);
                setDirty(false);
                setSaveError(null);
            } catch (error) {
                setSaveError((error as Error).message);
            } finally {
                setSaving(false);
            }
        }, 2000);

        return () => clearTimeout(timeoutId);
    }, [isDirty, workflowId, exportGraph, updateWorkflow, setDirty, setSaving, setSaveError, isReadOnly]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Skeleton className="h-12 w-64" />
            </div>
        );
    }

    return (
        <ReactFlowProvider>
            <div className="h-full flex flex-col bg-background">
                <Toolbar
                    workflowId={workflowId}
                    workflowStatus={workflow?.status ?? 'draft'}
                    onRunPreview={() => setShowPreview(!showPreview)}
                    readOnly={isReadOnly}
                    selectedVersion={selectedVersion}
                    onVersionChange={setSelectedVersion}
                />

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-64 border-r bg-card overflow-y-auto">
                        <ConnectionsPanel />
                    </div>

                    <div className="flex-1 overflow-hidden relative flex flex-col">
                        {selectedVersion !== 'current' && (
                            <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm text-center border-b border-amber-200">
                                Viewing older version. <Button variant="link" className="h-auto p-0 text-amber-900 font-semibold ml-1" onClick={() => setSelectedVersion('current')}>Switch to current</Button>
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
                                </div>
                            ) : (
                                <NodeSidebar />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </ReactFlowProvider>
    );
}
