
import { UseMutationResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useToast } from '@/hooks/use-toast';

interface UseVisualBuilderShortcutsProps {
    isReadOnly: boolean;
    selectedNodeId: string | null;
    duplicateNode: (id: string) => void;
    deleteNode: (id: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exportGraph: () => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateWorkflow: UseMutationResult<any, Error, any>;
    setSaving: (saving: boolean) => void;
    setDirty: (dirty: boolean) => void;
    setSaveError: (error: string | null) => void;
    setShowPreview: (show: boolean | ((prev: boolean) => boolean)) => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useVisualBuilderShortcuts({
    isReadOnly,
    selectedNodeId,
    duplicateNode,
    deleteNode,
    exportGraph,
    updateWorkflow,
    setSaving,
    setDirty,
    setSaveError,
    setShowPreview
}: UseVisualBuilderShortcutsProps) {
    const { toast } = useToast();

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
                return;
            }

            // Save: Cmd+S
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (isReadOnly) {
                    toast({ title: 'View Only', description: 'Cannot save in view-only mode.', variant: 'destructive' });
                    return;
                }

                setSaving(true);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
                if (isReadOnly) { return; }
                if (selectedNodeId) {
                    duplicateNode(selectedNodeId);
                    toast({ title: 'Duplicated', description: 'Block duplicated.' });
                }
            }

            // Delete: Backspace or Delete
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (isReadOnly) { return; }
                if (selectedNodeId) {
                    deleteNode(selectedNodeId);
                    toast({ title: 'Deleted', description: 'Block deleted.' });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedNodeId,
        duplicateNode,
        deleteNode,
        exportGraph,
        updateWorkflow,
        setSaving,
        setDirty,
        setSaveError,
        toast,
        isReadOnly,
        setShowPreview
    ]);
}
