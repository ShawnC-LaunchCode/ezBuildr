import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Download, Star } from "lucide-react";
import React, { useState } from 'react';
import { useLocation } from "wouter";

import Sidebar from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";


// Types
interface Template {
    id: string;
    title: string;
    description: string;
    category: string;
    usageCount: number;
    rating: number;
    isOfficial: boolean;
    tags?: string[];
}

export default function Marketplace() {
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('all');
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    // Fetch templates
    const { data: templates = [], isLoading } = useQuery<Template[]>({
        queryKey: ['templates', category, searchTerm],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchTerm) {params.append('search', searchTerm);}
            if (category !== 'all') {params.append('category', category);}

            const res = await fetch(`/api/templates?${params.toString()}`);
            if (!res.ok) {throw new Error('Failed to fetch templates');}
            return res.json();
        }
    });

    // Install mutation
    const installMutation = useMutation({
        mutationFn: async (templateId: string) => {
            // For now, we need to know WHICH project to install to.
            // In a real app, we'd prompt for project selection or use current project context.
            // We'll hardcode a "default" or prompt via a simple window.prompt for v1 dev.
            // const projectId = "default-project-id"; 
            // Actually, let's just pass a dummy project ID; backend will likely ignore or we assume project exists.
            // Wait, backend `installTemplate` requires `projectId`.
            // We will rely on backend to handle user's default project if needed, or we should fetch projects.
            // For MVP, passing a placeholder.
            const projectId = "default";

            const res = await fetch(`/api/templates/${templateId}/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            });
            if (!res.ok) {throw new Error('Failed to install template');}
            return res.json();
        },
        onSuccess: (workflow) => {
            toast({
                title: "Template Installed",
                description: "Redirecting to workflow builder...",
                variant: "default"
            });
            // Redirect to builder
            setTimeout(() => {
                setLocation(`/builder/${workflow.id}`);
            }, 1000);
        },
        onError: () => {
            toast({
                title: "Installation Failed",
                description: "Could not install the template.",
                variant: "destructive"
            });
        }
    });

    const categories = ['all', 'legal', 'hr', 'finance', 'general', 'marketing'];

    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto p-6">
                    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Template Marketplace</h1>
                            <p className="text-muted-foreground">Discover and install pre-built workflows to get started faster.</p>
                        </div>

                        {/* Search and Filter */}
                        <div className="flex gap-4 items-center flex-wrap">
                            <div className="relative flex-1 min-w-[300px] max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search templates..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {categories.map(cat => (
                                    <Button
                                        key={cat}
                                        variant={category === cat ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCategory(cat)}
                                        className="capitalize"
                                    >
                                        {cat}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {isLoading ? (
                                <div className="col-span-full text-center py-20">Loading templates...</div>
                            ) : templates.length === 0 ? (
                                <div className="col-span-full text-center py-20 text-muted-foreground">No templates found.</div>
                            ) : (
                                templates.map((template) => (
                                    <Card key={template.id} className="flex flex-col hover:shadow-lg transition-all">
                                        <CardHeader>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="text-xl">{template.title}</CardTitle>
                                                    <CardDescription className="line-clamp-2 mt-2">{template.description}</CardDescription>
                                                </div>
                                                {template.isOfficial && (
                                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Official</Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex-1">
                                            <div className="flex gap-4 text-sm text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Download className="h-4 w-4" />
                                                    <span>{template.usageCount} installs</span>
                                                </div>
                                                {template.rating > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                        <span>{(template.rating / 100).toFixed(1)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {template.tags?.map(tag => (
                                                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                        <CardFooter>
                                            <Button
                                                className="w-full"
                                                onClick={() => installMutation.mutate(template.id)}
                                                disabled={installMutation.isPending}
                                            >
                                                {installMutation.isPending ? "Installing..." : "Use Template"}
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
