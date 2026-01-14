import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, RotateCcw, Bot, BarChart3 } from "lucide-react";
import React, { useState, useEffect } from "react";

import { AIPerformanceMonitor } from "@/components/admin/AIPerformanceMonitor";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface AiSettingsResponse {
    settings?: { systemPrompt: string };
    defaultPrompt?: string;
}

export default function AdminAiSettings() {
    const { toast } = useToast();
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const queryClient = useQueryClient();
    const [prompt, setPrompt] = useState("");

    // Fetch current settings
    const { data, isLoading, error } = useQuery<AiSettingsResponse>({
        queryKey: ["/api/admin/ai-settings"],
        enabled: !!isAuthenticated && user?.role === 'admin',
    });

    // Update effect when data loads
    useEffect(() => {
        if (data?.settings?.systemPrompt) {
            setPrompt(data.settings.systemPrompt);
        } else if (data?.defaultPrompt) {
            setPrompt(data.defaultPrompt);
        }
    }, [data]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async (newPrompt: string) => {
            const res = await apiRequest("PUT", "/api/admin/ai-settings", { systemPrompt: newPrompt });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-settings"] });
            toast({
                title: "Settings Saved",
                description: "Global AI system prompt has been updated.",
            });
        },
        onError: (err: Error) => {
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive",
            });
        },
    });

    const handleReset = () => {
        if (data?.defaultPrompt) {
            if (confirm("Are you sure you want to reset to the default system prompt? Unsaved changes will be lost.")) {
                setPrompt(data.defaultPrompt);
            }
        }
    };

    const handleSave = () => {
        if (prompt.length < 10) {
            toast({
                title: "Invalid Prompt",
                description: "Prompt must be at least 10 characters long.",
                variant: "destructive",
            });
            return;
        }
        saveMutation.mutate(prompt);
    };

    // Auth protection
    if (authLoading) {return null;}
    if (!isAuthenticated || user?.role !== 'admin') {
        return (
            <div className="flex h-screen items-center justify-center">
                <p>Access Denied</p>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header
                    title="AI Settings"
                    description="Manage global AI configuration"
                />

                <div className="flex-1 overflow-auto p-6">
                    <Tabs defaultValue="prompt" className="space-y-6">
                        <TabsList>
                            <TabsTrigger value="prompt" className="flex items-center gap-2">
                                <Bot className="h-4 w-4" />
                                System Prompt
                            </TabsTrigger>
                            <TabsTrigger value="performance" className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" />
                                AI Performance
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="prompt" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <Bot className="h-5 w-5 text-primary" />
                                                Global System Prompt
                                            </CardTitle>
                                            <CardDescription className="mt-2">
                                                This prompt governs the behavior of the AI workflow assistant.
                                                Use <code>{`{{interviewerRole}}`}</code>, <code>{`{{readingLevel}}`}</code>, and <code>{`{{tone}}`}</code> placeholders for dynamic preferences.
                                            </CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={handleReset} disabled={isLoading || saveMutation.isPending}>
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Reset to Default
                                            </Button>
                                            <Button onClick={handleSave} disabled={isLoading || saveMutation.isPending}>
                                                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                Save Changes
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {isLoading ? (
                                        <div className="flex justify-center p-12">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <Textarea
                                                value={prompt}
                                                onChange={(e) => setPrompt(e.target.value)}
                                                className="min-h-[500px] font-mono text-sm leading-relaxed"
                                                placeholder="Enter system prompt..."
                                            />
                                            <p className="text-sm text-muted-foreground text-right">
                                                {prompt.length} characters
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="performance" className="space-y-6">
                            <AIPerformanceMonitor />
                        </TabsContent>
                    </Tabs>
                </div>
            </main>
        </div>
    );
}
