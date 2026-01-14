/**
 * Add Snip Dialog
 * UI for selecting and importing snips into a workflow
 * Includes collision detection and resolution modal (Prompt 31)
 */

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Package } from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { importSnip, validateSnipImport } from "@/lib/snips/importService";
import { getAllSnips } from "@/lib/snips/registry";
import type { SnipDefinition } from "@/lib/snips/types";

import { CollisionResolutionModal } from "./CollisionResolutionModal";


interface AddSnipDialogProps {
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddSnipDialog({ workflowId, open, onOpenChange }: AddSnipDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [importing, setImporting] = useState(false);
    const [selectedSnipId, setSelectedSnipId] = useState<string | null>(null);

    // Collision resolution state
    const [showCollisionModal, setShowCollisionModal] = useState(false);
    const [detectedCollisions, setDetectedCollisions] = useState<string[]>([]);
    const [resolvedMappings, setResolvedMappings] = useState<Record<string, string>>({});

    const snips = getAllSnips();

    const handleImportClick = async () => {
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
                await executeImport({});
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

    const executeImport = async (aliasMappings: Record<string, string>) => {
        if (!selectedSnipId) {return;}

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

            onOpenChange(false);
            setSelectedSnipId(null);
            setShowCollisionModal(false);
            setDetectedCollisions([]);
            setResolvedMappings({});
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

    const handleCollisionResolve = (resolutions: Record<string, string>) => {
        setResolvedMappings(resolutions);
        setShowCollisionModal(false);

        // Proceed with import using resolved mappings
        executeImport(resolutions);
    };

    const handleCollisionCancel = () => {
        setShowCollisionModal(false);
        setDetectedCollisions([]);
        setResolvedMappings({});
        toast({
            title: "Import cancelled",
            description: "No changes were made to your workflow",
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add Snip to Workflow</DialogTitle>
                        <DialogDescription>
                            Select a reusable workflow fragment to add to your workflow.
                            Snips include pre-configured pages, questions, and logic.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        {snips.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>No snips available yet</p>
                            </div>
                        ) : (
                            snips.map((snip) => (
                                <Card
                                    key={snip.id}
                                    className={`cursor-pointer transition-all ${selectedSnipId === snip.id
                                        ? "ring-2 ring-indigo-500 border-indigo-500"
                                        : "hover:border-indigo-300"
                                        }`}
                                    onClick={() => setSelectedSnipId(snip.id)}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="text-base">{snip.displayName}</CardTitle>
                                                <CardDescription className="text-sm mt-1">
                                                    {snip.description}
                                                </CardDescription>
                                            </div>
                                            {snip.category && (
                                                <Badge variant="secondary" className="ml-2">
                                                    {snip.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                            <span>{snip.pages.length} page{snip.pages.length !== 1 ? 's' : ''}</span>
                                            <span>
                                                {snip.pages.reduce((sum, p) => sum + p.questions.length, 0)} question
                                                {snip.pages.reduce((sum, p) => sum + p.questions.length, 0) !== 1 ? 's' : ''}
                                            </span>
                                            <span className="ml-auto font-mono">v{snip.version}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                            Cancel
                        </Button>
                        <Button onClick={handleImportClick} disabled={!selectedSnipId || importing}>
                            {importing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Import Snip
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Collision Resolution Modal */}
            <CollisionResolutionModal
                open={showCollisionModal}
                onOpenChange={setShowCollisionModal}
                collisions={detectedCollisions}
                onResolve={handleCollisionResolve}
                onCancel={handleCollisionCancel}
            />
        </>
    );
}
