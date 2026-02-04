import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ApiProject, ApiWorkflow } from "@/lib/vault-api";

interface MoveWorkflowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflow: ApiWorkflow | null;
    projects: ApiProject[];
    onSubmit: (projectId: string | null) => Promise<void>;
    isLoading: boolean;
}

export function MoveWorkflowDialog({
    open,
    onOpenChange,
    workflow,
    projects,
    onSubmit,
    isLoading,
}: MoveWorkflowDialogProps) {
    const [targetProjectId, setTargetProjectId] = useState<string | null>(null);

    useEffect(() => {
        if (open && workflow) {
            setTargetProjectId(workflow.projectId);
        }
    }, [open, workflow]);

    const handleSubmit = () => {
        void onSubmit(targetProjectId);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move Workflow</DialogTitle>
                    <DialogDescription>
                        Move &quot;{workflow?.title}&quot; to a project or unfiled
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="target-project">Target Project</Label>
                        <Select
                            value={targetProjectId ?? "unfiled"}
                            onValueChange={(value) => setTargetProjectId(value === "unfiled" ? null : value)}
                        >
                            <SelectTrigger id="target-project">
                                <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unfiled">Unfiled</SelectItem>
                                {projects.map((project) => (
                                    <SelectItem key={project.id} value={project.id}>
                                        {project.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? "Moving..." : "Move"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
