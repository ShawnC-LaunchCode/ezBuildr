
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Trash2, Copy } from "lucide-react";

export default function OAuthApps() {
    const [isCreating, setIsCreating] = useState(false);
    const [newAppName, setNewAppName] = useState("");
    const [newRedirectUri, setNewRedirectUri] = useState("");
    const queryClient = useQueryClient();

    // Mock Query - In real implementation, add GET /api/oauth-apps endpoint
    const { data: apps, isLoading } = useQuery({
        queryKey: ['oauth-apps'],
        queryFn: async () => {
            // return fetch('/api/oauth-apps').then(res => res.json());
            return []; // Mock empty for now until endpoint exists
        }
    });

    const handleCreate = async () => {
        // Implement POST /api/oauth-apps
        console.log("Create app", newAppName, newRedirectUri);
        setIsCreating(false);
    };

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">OAuth Applications</h1>
                    <p className="text-muted-foreground">Manage your OAuth 2.1 applications and credentials.</p>
                </div>
                <Button onClick={() => setIsCreating(true)}>
                    <Plus className="mr-2 h-4 w-4" /> New Application
                </Button>
            </div>

            {isCreating && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Application</CardTitle>
                        <CardDescription>Register a new application to use OAuth.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Application Name</Label>
                            <Input value={newAppName} onChange={e => setNewAppName(e.target.value)} placeholder="My Super App" />
                        </div>
                        <div className="space-y-2">
                            <Label>Redirect URI</Label>
                            <Input value={newRedirectUri} onChange={e => setNewRedirectUri(e.target.value)} placeholder="https://myapp.com/callback" />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                            <Button onClick={handleCreate}>Create App</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6">
                {(apps || []).length === 0 ? (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                            <p className="text-muted-foreground">No applications registered yet.</p>
                            <Button variant="link" onClick={() => setIsCreating(true)}>Create your first app</Button>
                        </CardContent>
                    </Card>
                ) : (
                    (apps || []).map((app: any) => (
                        <Card key={app.id}>
                            <CardHeader>
                                <CardTitle>{app.name}</CardTitle>
                                <CardDescription>Client ID: {app.clientId}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {/* Details */}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
