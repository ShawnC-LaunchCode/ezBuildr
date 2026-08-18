import { useQuery, useMutation } from '@tanstack/react-query';
import { Search } from "lucide-react";
import { useState } from 'react';
import { useLocation } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/lib/vault-hooks";

// Mirrors `CatalogTemplate` in `server/lib/templates/TemplateCatalog.ts` — the
// curated catalog (TM-2) carries only these fields. No usageCount, rating or
// isOfficial: rendering those would be inventing data the API never sends (TM-4).
interface Template {
    id: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
}

interface InstalledWorkflow {
    id: string;
}

export default function Marketplace() {
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('all');
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { data: projects = [] } = useProjects(true);

    // Which template is mid-install — drives the destination-project dialog.
    // There is no default project id to fall back to; the caller must choose.
    const [installTarget, setInstallTarget] = useState<Template | null>(null);
    const [selectedProjectId, setSelectedProjectId] = useState('');

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

    const hasNoProjects = projects.length === 0;

    function openInstallDialog(template: Template) {
        // A single-project user never has to choose — pre-select it.
        setSelectedProjectId(projects.length === 1 ? projects[0].id : '');
        setInstallTarget(template);
    }

    function closeInstallDialog() {
        setInstallTarget(null);
        setSelectedProjectId('');
    }

    // Install mutation
    const installMutation = useMutation({
        mutationFn: async ({ templateId, projectId }: { templateId: string; projectId: string }) => {
            const res = await fetch(`/api/templates/${templateId}/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId })
            });
            if (!res.ok) {throw new Error('Failed to install template');}
            return res.json() as Promise<InstalledWorkflow>;
        },
        onSuccess: (workflow) => {
            closeInstallDialog();
            toast({
                title: "Template Installed",
                description: "Redirecting to workflow builder...",
                variant: "default"
            });
            // Redirect to builder
            setTimeout(() => {
                setLocation(`/workflows/${workflow.id}/builder`);
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

    function confirmInstall() {
        if (installTarget === null || selectedProjectId === '') {
            return;
        }
        installMutation.mutate({ templateId: installTarget.id, projectId: selectedProjectId });
    }

    const categories = ['all', 'legal', 'hr', 'finance', 'general', 'marketing'];

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header
                    title="Template Marketplace"
                    description="Discover and install pre-built workflows"
                />
                <div className="flex-1 overflow-auto p-4 sm:p-6">
                    <div className="space-y-6">

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

                        {hasNoProjects && (
                            <div
                                role="alert"
                                className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200"
                            >
                                You don&apos;t have a project yet. Create one before installing a
                                template — every installed template becomes a workflow inside a project.
                            </div>
                        )}

                        {/* Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {isLoading ? (
                                <div className="col-span-full text-center py-20">Loading templates...</div>
                            ) : templates.length === 0 ? (
                                <div className="col-span-full text-center py-20 text-muted-foreground">No templates found.</div>
                            ) : (
                                templates.map((template) => (
                                    <Card
                                        key={template.id}
                                        data-testid={`template-card-${template.id}`}
                                        className="flex flex-col hover:shadow-lg transition-all"
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-xl">{template.title}</CardTitle>
                                            <CardDescription className="line-clamp-2 mt-2">{template.description}</CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex-1">
                                            {template.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {template.tags.map(tag => (
                                                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                        <CardFooter>
                                            <Button
                                                className="w-full"
                                                onClick={() => openInstallDialog(template)}
                                                disabled={hasNoProjects}
                                                title={hasNoProjects ? "Create a project first to install a template" : undefined}
                                            >
                                                Use Template
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <Dialog
                open={installTarget !== null}
                onOpenChange={(open) => { if (!open) {closeInstallDialog();} }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Install &quot;{installTarget?.title}&quot;</DialogTitle>
                        <DialogDescription>
                            Choose which project this becomes a workflow in.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="install-project">Project</Label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                            <SelectTrigger id="install-project">
                                <SelectValue placeholder="Choose a project" />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map((project) => (
                                    <SelectItem key={project.id} value={project.id}>
                                        {project.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeInstallDialog}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmInstall}
                            disabled={selectedProjectId === '' || installMutation.isPending}
                        >
                            {installMutation.isPending ? "Installing..." : "Install"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
