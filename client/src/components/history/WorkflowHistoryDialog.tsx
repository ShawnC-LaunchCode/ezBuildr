import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    History, Play, FileText, Download, AlertCircle, CheckCircle2,
    Clock, RotateCcw, GitCommit
} from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { runAPI, versionAPI, workflowExportAPI, ApiRun, ApiWorkflowVersion } from "@/lib/vault-api";

import { ExecutionDetailView } from "./ExecutionDetailView";

interface WorkflowHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowId: string;
}

export function WorkflowHistoryDialog({
    open,
    onOpenChange,
    workflowId,
}: WorkflowHistoryDialogProps) {
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

    // Fetch Runs
    const { data: runs, isLoading: isRunsLoading } = useQuery<ApiRun[]>({
        queryKey: ['workflow-runs', workflowId],
        queryFn: () => runAPI.list(workflowId),
        enabled: open,
    });

    // Fetch Versions
    const { data: versions, isLoading: isVersionsLoading } = useQuery<ApiWorkflowVersion[]>({
        queryKey: ['workflow-versions', workflowId],
        queryFn: async () => {
            const result = await versionAPI.list(workflowId);
            return Array.isArray(result) ? result : [];
        },
        enabled: open,
    });

    const handleExportRuns = (format: 'json' | 'csv') => {
        workflowExportAPI.downloadExport(workflowId, format);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <History className="w-5 h-5 text-muted-foreground" />
                        History & Audit
                    </DialogTitle>
                    <DialogDescription>
                        View execution history, past versions, and audit logs.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    {selectedRunId ? (
                        <ExecutionDetailView
                            runId={selectedRunId}
                            onBack={() => setSelectedRunId(null)}
                        />
                    ) : (
                        <Tabs defaultValue="executions" className="h-full flex flex-col">
                            <div className="px-6 py-2 border-b bg-muted/30 flex items-center justify-between">
                                <TabsList>
                                    <TabsTrigger value="executions" className="gap-2">
                                        <Play className="w-4 h-4" /> Executions
                                    </TabsTrigger>
                                    <TabsTrigger value="versions" className="gap-2">
                                        <GitCommit className="w-4 h-4" /> Versions
                                    </TabsTrigger>
                                </TabsList>

                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleExportRuns('csv')}>
                                        <Download className="w-3 h-3 mr-2" /> Export CSV
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleExportRuns('json')}>
                                        <Download className="w-3 h-3 mr-2" /> Export JSON
                                    </Button>
                                </div>
                            </div>

                            <TabsContent value="executions" className="flex-1 p-0 m-0 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Version</TableHead>
                                                <TableHead>Duration</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isRunsLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading runs...</TableCell>
                                                </TableRow>
                                            ) : runs?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No executions found.</TableCell>
                                                </TableRow>
                                            ) : (
                                                runs?.map((run) => (
                                                    <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRunId(run.id)}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                {run.completed ? (
                                                                    <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
                                                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="secondary">
                                                                        <Clock className="w-3 h-3 mr-1" /> In Progress
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {format(new Date(run.createdAt), "MMM d, yyyy h:mm a")}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                                                <GitCommit className="w-3 h-3" />
                                                                v{versions?.find(v => v.id === run.versionId)?.versionNumber}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-sm">
                                                            {run.completed && run.completedAt && (
                                                                <span>
                                                                    {Math.round((new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime()) / 1000)}s
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedRunId(run.id);
                                                            }}>
                                                                View Details
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="versions" className="flex-1 p-0 m-0 overflow-hidden">
                                <ScrollArea className="h-full">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Version</TableHead>
                                                <TableHead>Created</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Notes</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isVersionsLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading versions...</TableCell>
                                                </TableRow>
                                            ) : versions?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No versions found.</TableCell>
                                                </TableRow>
                                            ) : (
                                                Array.isArray(versions) && versions.map((v) => (
                                                    <TableRow key={v.id}>
                                                        <TableCell align="center">
                                                            <Badge variant="outline">v{v.versionNumber}</Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {format(new Date(v.createdAt), "MMM d, yyyy h:mm a")}
                                                        </TableCell>
                                                        <TableCell>
                                                            {v.isPublished ? (
                                                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">Published</Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-sm">Draft</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="max-w-xs truncate text-muted-foreground">
                                                            {v.notes || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm">
                                                                Rollback
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
