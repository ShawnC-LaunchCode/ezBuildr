
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { UseMutationResult } from '@tanstack/react-query';

interface UseVisualBuilderShortcutsProps {
    isReadOnly: boolean;
    selectedNodeId: string | null;
    duplicateNode: (id: string) => void;
    deleteNode: (id: string) => void;
    exportGraph: () => any;
    updateWorkflow: UseMutationResult<any, Error, any>;
    setSaving: (saving: boolean) => void;
    setDirty: (dirty: boolean) => void;
    setSaveError: (error: string | null) => void;
    setShowPreview: (show: boolean | ((prev: boolean) => boolean)) => void;
}

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
