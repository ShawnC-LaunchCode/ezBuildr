import axios from "axios";
import { AlertCircle, FileUp, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

interface TemplateUpdateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    templateId: string;
    templateName: string;
    projectId: string;
    onSuccess: () => void;
}

interface AnalysisImpact {
    workflowsAffected: number;
    workflows: Array<{ id: string; name: string }>;
    hasRemovedPlaceholders: boolean;
    requiresReview: boolean;
}

export function TemplateUpdateDialog({
    open,
    onOpenChange,
    templateId,
    templateName,
    projectId,
    onSuccess
}: TemplateUpdateDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [notes, setNotes] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [impact, setImpact] = useState<AnalysisImpact | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {return;}

        setSelectedFile(file);
        setImpact(null);
        setIsAnalyzing(true);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await axios.post<{ data: { impact: AnalysisImpact } }>(
                `/api/templates/${templateId}/analyze-update?projectId=${projectId}`,
                formData,
                { headers: { "Content-Type": "multipart/form-data" } }
            );
            
            setImpact(response.data.data.impact);
        } catch (error) {
            console.error("Failed to analyze template update", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleUpdateClick = async () => {
        if (!selectedFile) {return;}

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", selectedFile);
            if (notes) {
                formData.append("notes", notes);
            }

            await axios.patch(`/api/templates/${templateId}`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            onSuccess();
            handleClose();
        } catch (error) {
            console.error("Failed to update template", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setNotes("");
        setImpact(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Update Template</DialogTitle>
                    <DialogDescription>
                        Replace the file for &quot;{templateName}&quot; to create a new version.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="file">New Template File</Label>
                        <Input
                            id="file"
                            type="file"
                            accept=".docx,.pdf"
                            onChange={(e) => { void handleFileChange(e); }}
                            disabled={isAnalyzing || isUploading}
                        />
                    </div>

                    {isAnalyzing && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing impact...
                        </div>
                    )}

                    {impact && (
                        <div className="space-y-3">
                            {impact.requiresReview ? (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Impact Warning</AlertTitle>
                                    <AlertDescription>
                                        <p className="mb-2">
                                            This update will affect {impact.workflowsAffected} active workflow(s):
                                        </p>
                                        <ul className="list-disc pl-4 text-xs opacity-90 mb-2">
                                            {impact.workflows.map(w => (
                                                <li key={w.id}>{w.name}</li>
                                            ))}
                                        </ul>
                                        {impact.hasRemovedPlaceholders && (
                                            <p className="font-semibold text-xs mt-2">
                                                Warning: Placeholders have been removed, which may break mappings in these workflows.
                                            </p>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            ) : impact.workflowsAffected > 0 ? (
                                <Alert className="border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:border-blue-900 dark:text-blue-200">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Used in Active Workflows</AlertTitle>
                                    <AlertDescription>
                                        This template is used in {impact.workflowsAffected} workflow(s). The new version will be available immediately.
                                    </AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="space-y-2">
                                <Label htmlFor="notes">Commit Notes (Optional)</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Describe what changed in this version..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    disabled={isUploading}
                                />
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isUploading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => { void handleUpdateClick(); }}
                        disabled={isUploading || isAnalyzing || !selectedFile}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                            </>
                        ) : (
                            <>
                                <FileUp className="mr-2 h-4 w-4" />
                                Publish Update
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
