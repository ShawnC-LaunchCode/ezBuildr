
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface PublishWorkflowDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onPublish: (notes: string) => Promise<void>;
    isPublishing?: boolean;
}

export function PublishWorkflowDialog({ isOpen, onClose, onPublish, isPublishing }: PublishWorkflowDialogProps) {
    const [notes, setNotes] = useState("");

    const handlePublish = async () => {
        await onPublish(notes);
        setNotes("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Publish Workflow</DialogTitle>
                    <DialogDescription>
                        Create a new immutable version of your workflow. This version can be run by participants.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        placeholder="Release notes (optional) - e.g. 'Fixed validation logic'"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="min-h-[100px]"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPublishing}>Cancel</Button>
                    <Button onClick={handlePublish} disabled={isPublishing}>
                        {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Publish Version
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
