import { useQuery } from '@tanstack/react-query';
import { Loader2, Download, FileText, CheckCircle2, AlertCircle, Play } from "lucide-react";
import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRoute } from "wouter";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Assuming Alert exists
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface GeneratedDocument {
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
}

interface RunDetailsResponse {
    run: any;
    documents: GeneratedDocument[];
    finalBlockConfig: {
        title?: string;
        message?: string;
        showDocuments?: boolean;
        customLinks?: Array<{ label: string; url: string; style: 'button' | 'link' }>;
        brandingColor?: string;
        redirectUrl?: string;
    } | null;
}

export default function RunCompletionView() {
    const [match, params] = useRoute("/share/:token");
    const token = params?.token;

    const { data, isLoading, error } = useQuery<{ success: boolean; data: RunDetailsResponse }>({
        queryKey: ['shared-run', token],
        queryFn: async () => {
            const res = await fetch(`/api/shared/runs/${token}`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to load run');
            }
            return res.json();
        },
        enabled: !!token,
        retry: false
    });

    const { run, documents, finalBlockConfig } = data?.data || {};

    // Default configuration if missing (e.g. legacy runs without final block)
    const config = finalBlockConfig || {
        title: "Workflow Complete",
        message: "Thank you for completing the workflow. Your documents are ready below.",
        showDocuments: true,
        customLinks: [],
        brandingColor: "#10b981" // Default green
    };

    const brandingStyle = {
        backgroundColor: config.brandingColor || "#10b981",
    };

    // Redirect logic
    useEffect(() => {
        if (config.redirectUrl && !isLoading && data) {
            setTimeout(() => {
                window.location.href = config.redirectUrl!;
            }, 5000); // 5 second delay before redirect
        }
    }, [config.redirectUrl, isLoading, data]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Alert variant="destructive" className="max-w-md">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                        {error instanceof Error ? error.message : "This link is invalid or has expired."}
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!data?.success) {
        return null; // Should be handled by error state
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl w-full space-y-8">

                {/* Header Section */}
                <div className="text-center">
                    <div
                        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white mb-4 shadow-lg"
                        style={brandingStyle}
                    >
                        <CheckCircle2 className="h-10 w-10" />
                    </div>


                    <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                        {(!run.completed && config.title === "Workflow Complete")
                            ? "Workflow Paused"
                            : (config.title || "Workflow Complete")}
                    </h2>

                    <div className="mt-4 text-lg text-gray-600 prose prose-sm max-w-none">
                        <ReactMarkdown>{config.message || ""}</ReactMarkdown>
                    </div>
                </div>

                {/* Documents Section */}
                {config.showDocuments && documents && documents.length > 0 && run.completed && run.accessSettings?.allow_redownload !== false && (
                    <Card className="overflow-hidden shadow-sm border-gray-200">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                            <CardTitle className="text-xl flex items-center gap-2">
                                <FileText className="h-5 w-5 text-gray-500" />
                                Generated Documents
                            </CardTitle>
                            <CardDescription>
                                Please download your documents below.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y divide-gray-100 p-0">
                            {documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{doc.fileName}</p>
                                            <p className="text-sm text-gray-500">{(doc.fileSize / 1024).toFixed(1)} KB • {doc.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        asChild
                                        className="gap-2"
                                    >
                                        <a href={doc.fileUrl} download target="_blank" rel="noopener noreferrer">
                                            <Download className="h-4 w-4" />
                                            Download
                                        </a>
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Resume Action */}
                {!run.completed && run.accessSettings?.allow_resume !== false && (
                    <div className="flex justify-center mt-8">
                        <Button size="lg" onClick={() => window.location.href = `/run/${run.id}?token=${run.runToken}`}>
                            <Play className="h-5 w-5 mr-2" />
                            Resume Workflow
                        </Button>
                    </div>
                )}

                {/* Actions / Links Section */}
                {(config.customLinks && config.customLinks.length > 0) && (
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                        {config.customLinks.map((link, idx) => (
                            <Button
                                key={idx}
                                variant={link.style === 'button' ? 'default' : 'ghost'}
                                size="lg"
                                asChild
                                style={link.style === 'button' ? { backgroundColor: config.brandingColor } : {}}
                            >
                                <a href={link.url} target="_blank" rel="noopener noreferrer">
                                    {link.label}
                                </a>
                            </Button>
                        ))}
                    </div>
                )}

                {/* Footer / Branding */}
                <div className="mt-12 text-center text-sm text-gray-400">
                    Powered by ezBuildr
                </div>
            </div>
        </div>
    );
}
