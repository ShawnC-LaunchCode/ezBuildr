
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiSnapshot } from "@/lib/vault-api";

interface ViewSnapshotDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    snapshot: ApiSnapshot | null;
}

export function ViewSnapshotDialog({
    open,
    onOpenChange,
    snapshot
}: ViewSnapshotDialogProps) {
    if (!snapshot) { return null; }

    const values = snapshot.values ?? {};

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{snapshot.name} (Data View)</DialogTitle>
                    <DialogDescription>
                        {Object.keys(values).length} stored values in this scenario
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-96 overflow-auto">
                    <pre className="p-4 bg-muted rounded-lg text-xs font-mono">
                        {JSON.stringify(values, null, 2)}
                    </pre>
                </div>
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
