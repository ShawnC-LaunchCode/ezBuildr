
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useToast } from "@/hooks/use-toast";
import { importSnip, validateSnipImport } from "@/lib/snips/importService";

interface UseSnipImportProps {
    workflowId: string;
    onClose: () => void;
}

interface UseSnipImportReturn {
    importing: boolean;
    selectedSnipId: string | null;
    setSelectedSnipId: (id: string | null) => void;
    showCollisionModal: boolean;
    setShowCollisionModal: (show: boolean) => void;
    detectedCollisions: string[];
    handleImportClick: () => Promise<void>;
    handleCollisionResolve: (resolutions: Record<string, string>) => void;
    handleCollisionCancel: () => void;
}

export function useSnipImport({ workflowId, onClose }: UseSnipImportProps): UseSnipImportReturn {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [importing, setImporting] = useState(false);
    const [selectedSnipId, setSelectedSnipId] = useState<string | null>(null);

    // Collision resolution state
    const [showCollisionModal, setShowCollisionModal] = useState(false);
    const [detectedCollisions, setDetectedCollisions] = useState<string[]>([]);

    const executeImport = async (aliasMappings: Record<string, string>): Promise<void> => {
        if (!selectedSnipId) { return; }
        setImporting(true);

        try {
            const result = await importSnip(workflowId, {
                snipId: selectedSnipId,
                aliasMappings,
            });

            // Invalidate workflow queries to refresh sections/steps
            await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
            await queryClient.invalidateQueries({ queryKey: ["sections", workflowId] });
            await queryClient.invalidateQueries({ queryKey: ["workflow-all-steps", workflowId] });

            // Enhanced feedback based on collision status
            let description = "Pages and questions have been added to your workflow";
            if (result.hadCollisions) {
                description += ". Some variables were renamed to avoid conflicts";
            }

            toast({
                title: "Snip imported",
                description,
            });

            onClose();
            setSelectedSnipId(null);
            setShowCollisionModal(false);
            setDetectedCollisions([]);

        } catch (error) {
            console.error('[AddSnipDialog] Import error:', error);
            toast({
                title: "Import failed",
                description: error instanceof Error ? error.message : "Failed to import snip",
                variant: "destructive",
            });
        } finally {
            setImporting(false);
        }
    };

    const handleImportClick = async (): Promise<void> => {
        if (!selectedSnipId) {
            toast({
                title: "No snip selected",
                description: "Please select a snip to import",
                variant: "destructive",
            });
            return;
        }

        // Step 1: Detect collisions
        setImporting(true);
        try {
            const validation = await validateSnipImport(workflowId, selectedSnipId);
            if (validation.aliasConflicts.length > 0) {
                // Collisions detected - show resolution modal
                setDetectedCollisions(validation.aliasConflicts);
                setShowCollisionModal(true);
                setImporting(false);
            } else {
                // No collisions - proceed with import
                void executeImport({});
            }
        } catch (error) {
            console.error('[AddSnipDialog] Validation error:', error);
            toast({
                title: "Validation failed",
                description: error instanceof Error ? error.message : "Failed to validate snip",
                variant: "destructive",
            });
            setImporting(false);
        }
    };

    const handleCollisionResolve = (resolutions: Record<string, string>): void => {
        setShowCollisionModal(false);
        // Proceed with import using resolved mappings
        void executeImport(resolutions);
    };

    const handleCollisionCancel = (): void => {
        setShowCollisionModal(false);
        setDetectedCollisions([]);
        toast({
            title: "Import cancelled",
            description: "No changes were made to your workflow",
        });
    };

    return {
        importing,
        selectedSnipId,
        setSelectedSnipId,
        showCollisionModal,
        setShowCollisionModal,
        detectedCollisions,
        handleImportClick,
        handleCollisionResolve,
        handleCollisionCancel
    };
}
