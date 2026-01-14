import { formatDistanceToNow } from "date-fns";
import { Loader2, LogOut, FileText, Play, CheckCircle2, Clock } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface PortalRun {
    id: string;
    workflowTitle: string;
    status: 'completed' | 'in_progress';
    updatedAt: string;
    completedAt?: string;
    accessSettings?: {
        allow_portal: boolean;
        allow_resume: boolean;
        allow_redownload: boolean;
    };
    shareToken?: string;
}

export default function PortalDashboard() {
    const [runs, setRuns] = useState<PortalRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [, setLocation] = useLocation();

    useEffect(() => {
        const fetchRuns = async () => {
            try {
                const runs = await api.get("/portal/runs");
                setRuns(runs);
            } catch (error) {
                // If 401, redirect to login
                if ((error as any)?.response?.status === 401) {
                    setLocation("/portal/login");
                }
            } finally {
                setLoading(false);
            }
        };

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

    const handleResume = (runId: string) => {
        // Navigate to public share/run link?
        // If it's a "portal run", it might need a special token or session-based access.
        // Since we are logged in, we can probably go to a run view that checks session?
        // Wait, the regular runner (/run/:slug) uses creator session OR anon.
        // We need a way to run AS the portal user.
        // Current backend logic for /api/runs/:runId requires userId or runToken.
        // We don't have a runToken here easily (unless we fetch it).
        // AND we don't have a "Creator User ID".
        // We have a "Portal User Email".
        // RunService logic needs to support Portal Session for execution.
        // Or we rely on "Magic Link" to generate a short-lived run token?
        // For now, let's assume we can view the run details page or a "Resume" link.
        // Actually, `RunCompletionView` (shared link) handles fetching documents.
        // But resuming execution?
        // We might need to generate a "Resume Link" (run token) on the fly?
        // Let's implement that later. For now, we will create a share link or use a placeholder.

        // Idea: Redirect to `/portal/run/:runId` which acts as a proxy wrapper?
        // Or simply `/share/:token` if we have a token?
        // But we want to RESUME provided we have access.

        // Temporary: Log it.
        console.log("Resume", runId);
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
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500">
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
                            <p>You haven't completed any workflows yet.</p>
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
                                        {run.status === 'completed' && run.accessSettings?.allow_redownload !== false && run.shareToken && (
                                            <Button variant="outline" size="sm" onClick={() => setLocation(`/share/${run.shareToken}`)}>
                                                <FileText className="h-4 w-4 mr-2" />
                                                View Documents
                                            </Button>
                                        )}

                                        {run.status !== 'completed' && run.accessSettings?.allow_resume !== false && (
                                            <Button size="sm" onClick={() => handleResume(run.id)}>
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
