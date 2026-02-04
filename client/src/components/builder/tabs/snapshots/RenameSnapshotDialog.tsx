
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameSnapshotDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentName: string;
    onRename: (newName: string) => Promise<void>;
    isRenaming: boolean;
}

export function RenameSnapshotDialog({
    open,
    onOpenChange,
    currentName,
    onRename,
    isRenaming
}: RenameSnapshotDialogProps) {
    const [newName, setNewName] = useState(currentName);

    useEffect(() => {
        setNewName(currentName);
    }, [currentName, open]);

    const handleSave = () => {
        void onRename(newName);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename Scenario</DialogTitle>
                    <DialogDescription>Give this scenario a descriptive name (e.g. "Scenario A: High Net Worth")</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="rename">Scenario Name</Label>
                        <Input
                            id="rename"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSave();
                                }
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => {
                            onOpenChange(false);
                            setNewName(currentName);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isRenaming || !newName.trim()}>
                        {isRenaming ? "Saving..." : "Save Name"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
