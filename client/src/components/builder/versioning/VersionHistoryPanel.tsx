
import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { ApiWorkflowVersion, versionAPI } from "@/lib/vault-api";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GitCommit, RotateCcw, FileDiff, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VersionHistoryPanelProps {
    workflowId: string;
    isOpen: boolean;
    onClose: () => void;
    onRestore: (version: ApiWorkflowVersion) => void;
    onDiff: (version: ApiWorkflowVersion) => void;
}

export function VersionHistoryPanel({
    workflowId,
    isOpen,
    onClose,
    onRestore,
    onDiff
}: VersionHistoryPanelProps) {
    const [versions, setVersions] = useState<ApiWorkflowVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen && workflowId) {
            loadVersions();
        }
    }, [isOpen, workflowId]);

    const loadVersions = async () => {
        setLoading(true);
        try {
            const data = await versionAPI.list(workflowId);
            setVersions(data);
        } catch (error) {
            toast({
                title: "Error loading versions",
                description: "Failed to fetch version history",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (version: ApiWorkflowVersion) => {
        if (confirm(`Are you sure you want to restore version ${version.versionNumber}? This will overwrite your current draft.`)) {
            try {
                await versionAPI.restore(workflowId, version.id);
                toast({ title: "Restored successfully", description: `Reverted to v${version.versionNumber}` });
                onRestore(version);
                onClose();
                // Trigger reload? The parent should handle it.
            } catch (error) {
                toast({ title: "Restore failed", variant: "destructive" });
            }
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle>Version History</SheetTitle>
                    <SheetDescription>
                        View and manage previous versions of this workflow.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex flex-col gap-4 h-full">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                            <div className="space-y-4">
                                {versions.map((version) => {
                                                    const isAiGenerated = version.migrationInfo &&
                                                        typeof version.migrationInfo === 'object' &&
                                                        'aiMetadata' in version.migrationInfo &&
                                                        (version.migrationInfo as any).aiMetadata?.aiGenerated;

                                                    return (
                                    <div
                                        key={version.id}
                                        className={`flex flex-col gap-2 p-4 border rounded-lg hover:bg-accent/50 transition-colors ${
                                            isAiGenerated ? 'border-purple-200 bg-purple-50/50' : ''
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge variant={version.isDraft ? "secondary" : "default"}>
                                                    {version.isDraft ? "Draft" : `v${version.versionNumber}`}
                                                </Badge>
                                                {isAiGenerated && (
                                                    <Badge variant="outline" className="gap-1 text-purple-600 border-purple-300">
                                                        <Sparkles className="h-3 w-3" />
                                                        AI
                                                    </Badge>
                                                )}
                                                <span className="text-sm text-muted-foreground">
                                                    {format(new Date(version.createdAt), "PPP p")}
                                                </span>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button size="icon" variant="ghost" title="Compare" onClick={() => onDiff(version)}>
                                                    <FileDiff className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" title="Restore" onClick={() => handleRestore(version)}>
                                                    <RotateCcw className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {version.notes && (
                                            <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                                                {version.notes}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <GitCommit className="h-3 w-3" />
                                            <span>{version.createdBy}</span>
                                            {isAiGenerated && (
                                                <span className="text-purple-600">
                                                    (via AI)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
