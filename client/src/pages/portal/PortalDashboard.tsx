import { formatDistanceToNow } from "date-fns";
import { Loader2, LogOut, FileText, Play, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { setRunToken } from "@/lib/runTokens";
import { fetchAPI } from "@/lib/vault-api";
interface PortalRun {
    id: string;
    workflowTitle: string;
    status: 'completed' | 'in_progress';
    updatedAt: string;
    completedAt?: string;
    accessSettings?: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        allow_portal: boolean;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        allow_resume: boolean;
        // eslint-disable-next-line @typescript-eslint/naming-convention
        allow_redownload: boolean;
    };
    // The runs list no longer returns a reusable token (share tokens are stored
    // hashed at rest). It exposes only whether a share link exists; a fresh
    // plaintext token is minted on demand via POST /api/runs/:id/share.
    hasShareToken?: boolean;
}

interface ShareTokenResponse {
    data?: {
        shareToken?: string;
    };
}

interface PortalAccessTokenResponse {
    data?: {
        runToken?: string;
    };
}

function isShareTokenResponse(value: unknown): value is ShareTokenResponse {
    if (typeof value !== 'object' || value === null || !('data' in value)) {
        return false;
    }

    const data = (value as { data?: unknown }).data;
    if (data === undefined) {
        return true;
    }

    return typeof data === 'object' && data !== null && (
        !('shareToken' in data) || typeof (data as { shareToken?: unknown }).shareToken === 'string'
    );
}

export default function PortalDashboard() {
    const [runs, setRuns] = useState<PortalRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    useEffect(() => {
        const fetchRuns = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const runs = await api.get("/portal/runs");
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                setRuns(runs);
            } catch (error) {
                // If 401, redirect to login
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                if ((error as any)?.response?.status === 401) {
                    setLocation("/portal/login");
                }
            } finally {
                setLoading(false);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            }
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        };
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchRuns();
    }, [setLocation]);
    const handleLogout = async () => {
        try {
            await api.post("/portal/auth/logout");
            setLocation("/portal/login");
        } catch (error) {
            console.error("Logout failed", error);
        }
    };
    const issueRunToken = async (runId: string): Promise<string> => {
        const response = await api.post(`/portal/runs/${runId}/access-token`) as PortalAccessTokenResponse;
        const runToken = response.data?.runToken;
        if (!runToken) {
            throw new Error("No run token returned");
        }
        setRunToken(runId, runToken);
        return runToken;
    };
    const handleResume = async (runId: string) => {
        try {
            await issueRunToken(runId);
            setLocation(`/run/${runId}`);
        } catch {
            toast({ title: "Unable to resume", description: "This interview is no longer available.", variant: "destructive" });
        }
    };
    const handleViewDocuments = async (runId: string): Promise<void> => {
        try {
            await issueRunToken(runId);
            const data = await fetchAPI<unknown>(`/api/runs/${runId}/share`, { method: 'POST' });
            const shareToken = isShareTokenResponse(data) ? data.data?.shareToken : undefined;
            if (!shareToken) {
                throw new Error("No share token returned");
            }
            setLocation(`/share/${shareToken}`);
        } catch {
            toast({ title: "Unable to open documents", description: "This interview is no longer available.", variant: "destructive" });
        }
    };
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Logo placeholder */}
                        <div className="bg-blue-600 text-white p-1 rounded font-bold text-sm">VL</div>
                        <h1 className="font-semibold text-lg">My Portal</h1>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { void handleLogout(); }} className="text-gray-500">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </header>
            <main className="max-w-5xl mx-auto px-4 py-8">
                <h2 className="text-2xl font-bold mb-6">Your Workflows</h2>
                {runs.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-gray-500">
                            <p>You haven&apos;t completed any workflows yet.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {runs.map((run) => (
                            <Card key={run.id} className="overflow-hidden">
                                <div className="flex flex-col sm:flex-row sm:items-center p-6 gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-lg">{run.workflowTitle}</h3>
                                            {run.status === 'completed' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                                    Completed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    In Progress
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            {run.status === 'completed'
                                                ? `Completed ${formatDistanceToNow(new Date(run.completedAt!), { addSuffix: true })}`
                                                : `Last active ${formatDistanceToNow(new Date(run.updatedAt), { addSuffix: true })}`
                                            }
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {run.status === 'completed' && run.accessSettings?.allow_redownload !== false && (
                                            <Button variant="outline" size="sm" onClick={() => { void handleViewDocuments(run.id); }}>
                                                <FileText className="h-4 w-4 mr-2" />
                                                View Documents
                                            </Button>
                                        )}
                                        {run.status !== 'completed' && run.accessSettings?.allow_resume !== false && (
                                            <Button size="sm" onClick={() => { void handleResume(run.id); }}>
                                                <Play className="h-4 w-4 mr-2" />
                                                Resume
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
