
import { Loader2, AlertCircle } from "lucide-react";
import React, { useEffect, useState } from 'react';
import { useRoute } from "wouter";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { FloatingAIAssist } from "./components/FloatingAIAssist";

interface PublicWorkflow {
    id: string;
    title: string;
    description: string;
    publicSettings?: any;
}

export default function PublicRunner() {
    const [, params] = useRoute("/w/:slug");
    const slug = params?.slug;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [workflow, setWorkflow] = useState<PublicWorkflow | null>(null);
    const [runState, setRunState] = useState<'idle' | 'running' | 'completed'>('idle');

    useEffect(() => {
        if (slug) {
            fetchWorkflow();
        }
    }, [slug]);

    const fetchWorkflow = async () => {
        try {
            const res = await fetch(`/public/w/${slug}`);
            if (!res.ok) {
                if (res.status === 404) {throw new Error("Workflow not found or private");}
                throw new Error("Failed to load workflow");
            }
            const data = await res.json();
            setWorkflow(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const startRun = async () => {
        try {
            setRunState('running');
            const res = await fetch(`/public/w/${slug}/run`, { method: 'POST' });
            if (!res.ok) {throw new Error("Failed to start run");}
            const data = await res.json();
            // In a real app, this would initialize a Multi-Step Runner component
            // For now, we simulate completion
            setTimeout(() => {
                setRunState('completed');
            }, 1000);
        } catch (err: any) {
            setError(err.message);
            setRunState('idle');
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
                <Alert variant="destructive" className="max-w-md">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
                        {workflow?.title}
                    </h1>
                    <p className="mt-4 text-lg text-gray-600">
                        {workflow?.description}
                    </p>
                </div>

                <Card className="mt-8 bg-white shadow-xl rounded-xl overflow-hidden border-0 ring-1 ring-gray-200">
                    <CardContent className="p-8">
                        {runState === 'idle' && (
                            <div className="text-center py-8">
                                <Button size="lg" onClick={startRun} className="w-full sm:w-auto text-lg px-8 py-6 h-auto">
                                    Start Workflow
                                </Button>
                            </div>
                        )}

                        {runState === 'running' && (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                                <p className="text-gray-500">Initializing Workflow...</p>
                            </div>
                        )}

                        {runState === 'completed' && (
                            <div className="text-center py-8 space-y-4">
                                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                    <span className="text-2xl">🎉</span>
                                </div>
                                <h3 className="text-xl font-medium text-gray-900">Completed!</h3>
                                <p className="text-gray-500">Thank you for completing this workflow.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="text-center text-sm text-gray-400">
                    Powered by ezBuildr
                </div>
            </div>
            <FloatingAIAssist
                currentBlockText={workflow?.description || "Welcome to the workflow."} // Placeholder for current block
            />
        </div>

    );
}
