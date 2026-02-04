/**
 * Add Snip Dialog
 * UI for selecting and importing snips into a workflow
 * Includes collision detection and resolution modal (Prompt 31)
 */
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getAllSnips } from "@/lib/snips/registry";

import { CollisionResolutionModal } from "./CollisionResolutionModal";
import { SnipCard, SnipEmptyState } from "./snips/SnipCard";
import { useSnipImport } from "./snips/useSnipImport";

interface AddSnipDialogProps {
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddSnipDialog({ workflowId, open, onOpenChange }: AddSnipDialogProps) {
    const snips = getAllSnips();

    const {
        importing,
        selectedSnipId,
        setSelectedSnipId,
        showCollisionModal,
        setShowCollisionModal,
        detectedCollisions,
        handleImportClick,
        handleCollisionResolve,
        handleCollisionCancel
    } = useSnipImport({
        workflowId,
        onClose: () => onOpenChange(false)
    });

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
                            <SnipEmptyState />
                        ) : (
                            snips.map((snip) => (
                                <SnipCard
                                    key={snip.id}
                                    snip={snip}
                                    isSelected={selectedSnipId === snip.id}
                                    onSelect={setSelectedSnipId}
                                />
                            ))
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => { void onOpenChange(false); }} disabled={importing}>
                            Cancel
                        </Button>
                        <Button onClick={() => { void handleImportClick(); }} disabled={!selectedSnipId || importing}>
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