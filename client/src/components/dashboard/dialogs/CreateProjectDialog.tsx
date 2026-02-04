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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiProject } from "@/lib/vault-api";

interface CreateProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingProject: ApiProject | null;
    onSubmit: (data: { title: string; description: string }) => Promise<void>;
    isLoading: boolean;
}

export function CreateProjectDialog({
    open,
    onOpenChange,
    editingProject,
    onSubmit,
    isLoading,
}: CreateProjectDialogProps) {
    const [formData, setFormData] = useState({ title: "", description: "" });

    useEffect(() => {
        if (open) {
            if (editingProject) {
                setFormData({
                    title: editingProject.title,
                    description: editingProject.description ?? "",
                });
            } else {
                setFormData({ title: "", description: "" });
            }
        }
    }, [open, editingProject]);

    const handleSubmit = () => {
        void onSubmit(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
                    <DialogDescription>
                        {editingProject
                            ? "Update your project details"
                            : "Create a new project to organize your workflows"}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="project-title">Title *</Label>
                        <Input
                            id="project-title"
                            placeholder="e.g., Customer Onboarding"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSubmit();
                                }
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="project-description">Description</Label>
                        <Textarea
                            id="project-description"
                            placeholder="Optional description..."
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading
                            ? "Saving..."
                            : editingProject
                                ? "Update"
                                : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
