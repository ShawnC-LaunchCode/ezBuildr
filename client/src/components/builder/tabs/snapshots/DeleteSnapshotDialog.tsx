
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DeleteSnapshotDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    snapshotName: string;
    onDelete: () => Promise<void>;
    isDeleting: boolean;
}

export function DeleteSnapshotDialog({
    open,
    onOpenChange,
    snapshotName,
    onDelete,
    isDeleting
}: DeleteSnapshotDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Scenario</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete "{snapshotName}"?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => { void onDelete(); }} disabled={isDeleting}>
                        {isDeleting ? "Deleting..." : "Delete Scenario"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
