
import React, { useEffect, useState } from "react";
import { versionAPI, ApiWorkflowVersion } from "@/lib/vault-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface DiffViewerProps {
    workflowId: string;
    version1: ApiWorkflowVersion | null;
    version2: ApiWorkflowVersion | null; // If null, diff against current? Or assume explicit selection
    isOpen: boolean;
    onClose: () => void;
}

interface DiffResult {
    sections: any[];
    steps: any[];
    summary: {
        sectionsAdded: number;
        sectionsRemoved: number;
        stepsAdded: number;
        stepsRemoved: number;
        stepsModified: number;
    };
}

export function DiffViewer({ workflowId, version1, version2, isOpen, onClose }: DiffViewerProps) {
    const [diff, setDiff] = useState<DiffResult | null>(null);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen && workflowId && version1 && version2) {
            loadDiff();
        }
    }, [isOpen, workflowId, version1, version2]);

    const loadDiff = async () => {
        if (!version1 || !version2) return;
        setLoading(true);
        try {
            const result = await versionAPI.diff(workflowId, version1.id, version2.id);
            setDiff(result);
        } catch (error) {
            toast({
                title: "Error loading diff",
                description: "Failed to compute difference",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const renderChangeBadge = (type: string) => {
        switch (type) {
            case 'added': return <Badge className="bg-green-500">Added</Badge>;
            case 'removed': return <Badge variant="destructive">Removed</Badge>;
            case 'modified': return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Modified</Badge>;
            default: return null;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Version Comparison</DialogTitle>
                    <DialogDescription>
                        Comparing v{version1?.versionNumber} to v{version2?.versionNumber}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center items-center flex-1">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : diff ? (
                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="space-y-6 py-4">
                            {/* Summary */}
                            <div className="grid grid-cols-5 gap-4 text-center">
                                <div className="p-2 bg-muted rounded">
                                    <div className="text-2xl font-bold">{diff.summary.sectionsAdded}</div>
                                    <div className="text-xs text-muted-foreground">Sections Added</div>
                                </div>
                                <div className="p-2 bg-muted rounded">
                                    <div className="text-2xl font-bold">{diff.summary.sectionsRemoved}</div>
                                    <div className="text-xs text-muted-foreground">Sections Removed</div>
                                </div>
                                <div className="p-2 bg-muted rounded">
                                    <div className="text-2xl font-bold">{diff.summary.stepsAdded}</div>
                                    <div className="text-xs text-muted-foreground">Steps Added</div>
                                </div>
                                <div className="p-2 bg-muted rounded">
                                    <div className="text-2xl font-bold">{diff.summary.stepsRemoved}</div>
                                    <div className="text-xs text-muted-foreground">Steps Removed</div>
                                </div>
                                <div className="p-2 bg-muted rounded">
                                    <div className="text-2xl font-bold">{diff.summary.stepsModified}</div>
                                    <div className="text-xs text-muted-foreground">Steps Modified</div>
                                </div>
                            </div>

                            {/* Sections Diff */}
                            {diff.sections.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Sections</h3>
                                    {diff.sections.map(s => (
                                        <Card key={s.id} className="border-l-4 border-l-primary">
                                            <CardHeader className="py-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {renderChangeBadge(s.changeType)}
                                                        <span className="font-medium">{s.title || "Untitled Section"}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground font-mono">{s.id.slice(0, 8)}</span>
                                                </div>
                                            </CardHeader>
                                            {s.propertyChanges && (
                                                <CardContent className="py-2 text-sm bg-muted/20">
                                                    {Object.entries(s.propertyChanges).map(([prop, change]: [string, any]) => (
                                                        <div key={prop} className="grid grid-cols-[100px_1fr_20px_1fr] items-center gap-2">
                                                            <span className="font-semibold text-muted-foreground">{prop}:</span>
                                                            <span className="truncate text-red-600 bg-red-50 p-1 rounded">{String(change.oldValue)}</span>
                                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                            <span className="truncate text-green-600 bg-green-50 p-1 rounded">{String(change.newValue)}</span>
                                                        </div>
                                                    ))}
                                                </CardContent>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                            )}

                            {/* Steps Diff */}
                            {diff.steps.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="font-semibold text-lg">Steps</h3>
                                    {diff.steps.map(s => (
                                        <Card key={s.id} className="border-l-4 border-l-secondary">
                                            <CardHeader className="py-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {renderChangeBadge(s.changeType)}
                                                        <span className="font-medium">Block {s.type}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground font-mono">{s.id.slice(0, 8)}</span>
                                                </div>
                                            </CardHeader>
                                            {s.propertyChanges && (
                                                <CardContent className="py-2 text-sm bg-muted/20">
                                                    {Object.entries(s.propertyChanges).map(([prop, change]: [string, any]) => (
                                                        <div key={prop} className="grid grid-cols-[100px_1fr_20px_1fr] items-center gap-2">
                                                            <span className="font-semibold text-muted-foreground">{prop}:</span>
                                                            <span className="truncate text-red-600 bg-red-50 p-1 rounded">{JSON.stringify(change.oldValue)}</span>
                                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                            <span className="truncate text-green-600 bg-green-50 p-1 rounded">{JSON.stringify(change.newValue)}</span>
                                                        </div>
                                                    ))}
                                                </CardContent>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex justify-center items-center flex-1 text-muted-foreground">
                        Select versions to compare
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
