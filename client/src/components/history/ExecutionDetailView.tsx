import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runAPI } from "@/lib/vault-api";
interface ExecutionDetailViewProps {
    runId: string;
    onBack: () => void;
}
export function ExecutionDetailView({ runId, onBack }: ExecutionDetailViewProps) {
    const { data: run, isLoading } = useQuery({
        queryKey: ['run-detail', runId],
        queryFn: () => runAPI.getWithValues(runId),
    });
    const { data: documents } = useQuery({
        queryKey: ['run-documents', runId],
        queryFn: () => runAPI.getDocuments(runId),
    });
    if (isLoading) {
        return <div className="p-8 text-center">Loading execution details...</div>;
    }
    if (!run) {
        return <div className="p-8 text-center text-destructive">Execution not found.</div>;
    }
    const duration = run.completed && run.completedAt
        ? Math.round((new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime()) / 1000)
        : null;
    return (
        <div className="flex flex-col h-full bg-muted/10">
            <div className="flex items-center gap-2 p-4 border-b bg-background">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div className="flex-1">
                    <h3 className="font-semibold flex items-center gap-2">
                        Execution #{run.id.substring(0, 8)}
                        {run.completed ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">Completed</Badge>
                        ) : (
                            <Badge variant="secondary">In Progress</Badge>
                        )}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {format(new Date(run.createdAt), "PPP p")}  • v{run.versionId.substring(0, 8)}
                    </p>
                </div>
                {duration && (
                    <div className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                        duration: {duration}s
                    </div>
                )}
            </div>
            <ScrollArea className="flex-1 p-6">
                <div className="space-y-6 max-w-4xl mx-auto">
                    {/* Metadata Card */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Type</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-semibold capitalize">
                                    {run.participantId ? "User Session" : "Anonymous / Test"}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Step Values</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-semibold">{run.values?.length || 0}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Generated Docs</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-semibold">{documents?.length || 0}</div>
                            </CardContent>
                        </Card>
                    </div>
                    {/* Documents */}
                    {documents && documents.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary" /> Generated Documents
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-2">
                                {documents.map((doc: any) => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/30 rounded border">
                                        <span className="font-medium text-sm">{doc.name}</span>
                                        <Badge variant="outline">{doc.fileType}</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                    {/* Variable State */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Captured Values</CardTitle>
                            <CardDescription>
                                Data collected during this execution.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {run.values && run.values.length > 0 ? (
                                <div className="rounded-md border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 text-left">
                                            <tr>
                                                <th className="p-3 font-medium text-muted-foreground">Step / ID</th>
                                                <th className="p-3 font-medium text-muted-foreground">Value</th>
                                                <th className="p-3 font-medium text-muted-foreground w-32">Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {run.values.map((val: any) => (
                                                <tr key={val.id}>
                                                    <td className="p-3 font-mono text-xs">{val.stepId}</td>
                                                    <td className="p-3">
                                                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">
                                                            {JSON.stringify(val.value)}
                                                        </code>
                                                    </td>
                                                    <td className="p-3 text-xs text-muted-foreground">
                                                        {format(new Date(val.updatedAt), "HH:mm:ss")}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground italic">
                                    No data captured in this run.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </ScrollArea>
        </div>
    );
}