
import { useQuery } from '@tanstack/react-query';
import {
    Search,
    Layout,
    FileText,
    Box,
    Plus,
    Clock,
    User,
    Tag,
    Grid
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { blueprintAPI, ApiBlueprint } from '@/lib/vault-api';

interface TemplateBrowserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (template: ApiBlueprint) => void;
    title?: string;
    description?: string;
    selectLabel?: string;
    mode?: 'create' | 'insert';
}

export function TemplateBrowserDialog({
    open,
    onOpenChange,
    onSelect,
    title = "Browse Templates",
    description = "Select a template to start from.",
    selectLabel = "Use Template",
    mode = 'create'
}: TemplateBrowserDialogProps) {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [selectedTemplate, setSelectedTemplate] = useState<ApiBlueprint | null>(null);

    // Fetch templates
    const { data: templates, isLoading, isError } = useQuery({
        queryKey: ['templates'],
        queryFn: () => blueprintAPI.list(),
        enabled: open,
    });

    // Filter templates
    const filteredTemplates = templates?.filter(t => {
        // Search filter
        const matchesSearch =
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

        // Tab filter (mock logic since we don't have separate lists yet)
        // In a real app, 'mine' would filter by creatorId === currentUserId
        const matchesTab =
            activeTab === 'all' ? true :
                activeTab === 'mine' ? true : // Placeholder for ownership check
                    activeTab === 'system' ? t.tags?.includes('system') :
                        true;

        return matchesSearch && matchesTab;
    }) || [];

    const handleSelect = () => {
        if (selectedTemplate) {
            onSelect(selectedTemplate);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 border-b">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>

                    <div className="flex items-center gap-4 mt-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search templates..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-48 bg-muted/30 border-r p-4 hidden md:block">
                        <h3 className="text-xs font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Categories</h3>
                        <div className="space-y-1">
                            <Button
                                variant={activeTab === 'all' ? 'secondary' : 'ghost'}
                                className="w-full justify-start"
                                onClick={() => setActiveTab('all')}
                            >
                                <Grid className="w-4 h-4 mr-2" />
                                All Templates
                            </Button>
                            <Button
                                variant={activeTab === 'mine' ? 'secondary' : 'ghost'}
                                className="w-full justify-start"
                                onClick={() => setActiveTab('mine')}
                            >
                                <User className="w-4 h-4 mr-2" />
                                My Templates
                            </Button>
                            <Button
                                variant={activeTab === 'system' ? 'secondary' : 'ghost'}
                                className="w-full justify-start"
                                onClick={() => setActiveTab('system')}
                            >
                                <Box className="w-4 h-4 mr-2" />
                                System
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {isLoading ? (
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <Skeleton key={i} className="h-48 w-full rounded-xl" />
                                ))}
                            </div>
                        ) : isError ? (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                Failed to load templates.
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                                <FileText className="w-12 h-12 mb-4 opacity-20" />
                                <p>No templates found.</p>
                            </div>
                        ) : (
                            <ScrollArea className="flex-1 p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredTemplates.map((template) => (
                                        <div
                                            key={template.id}
                                            className={`
                         group relative border rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md
                         ${selectedTemplate?.id === template.id ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/50'}
                       `}
                                            onClick={() => setSelectedTemplate(template)}
                                        >
                                            {/* Preview Header */}
                                            <div className="h-32 bg-muted/50 p-4 border-b group-hover:bg-muted/70 transition-colors flex items-center justify-center">
                                                <Layout className="w-12 h-12 text-muted-foreground/40" />
                                            </div>

                                            {/* Content */}
                                            <div className="p-4">
                                                <h3 className="font-semibold truncate mb-1" title={template.name}>{template.name}</h3>
                                                <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-3">
                                                    {template.description || "No description provided."}
                                                </p>

                                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(template.createdAt).toLocaleDateString()}
                                                    </div>
                                                    {template.tags && template.tags.length > 0 && (
                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                                            {template.tags[0]}
                                                            {template.tags.length > 1 && ` +${template.tags.length - 1}`}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 border-t bg-background">
                    <div className="flex-1 flex items-center text-sm text-muted-foreground">
                        {selectedTemplate ? (
                            <span>Selected: <span className="font-medium text-foreground">{selectedTemplate.name}</span></span>
                        ) : (
                            <span>Select a template to continue</span>
                        )}
                    </div>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSelect} disabled={!selectedTemplate}>
                        {selectLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
