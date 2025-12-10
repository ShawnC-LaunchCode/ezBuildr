
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, FileText, Loader2, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TemplateUploadWizardProps {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowVariables?: any[];
}

export function TemplateUploadWizard({
    projectId,
    open,
    onOpenChange,
    workflowVariables = []
}: TemplateUploadWizardProps) {
    const queryClient = useQueryClient();
    const [step, setStep] = useState(1);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);

    // AI State
    const [analysis, setAnalysis] = useState<any>(null);
    const [mappings, setMappings] = useState<any[]>([]);

    // 1. Upload & Analyze Mutation
    const uploadAndAnalyzeMutation = useMutation({
        mutationFn: async () => {
            // Just analyze first, don't save to DB yet (or save as draft?)
            // We'll analyze the file buffer directly
            if (!file) throw new Error("No file");

            const formData = new FormData();
            formData.append('file', file);

            const res = await axios.post('/api/ai/doc/analyze', formData);
            return res.data.data;
        },
        onSuccess: (data) => {
            setAnalysis(data);
            if (data.variables) {
                // Automatically get mappings
                suggestMappingMutation.mutate(data.variables);
            }
            setStep(2);
        }
    });

    // 2. Suggest Mappings
    const suggestMappingMutation = useMutation({
        mutationFn: async (variables: any[]) => {
            const res = await axios.post('/api/ai/doc/suggest-mappings', {
                templateVariables: variables,
                workflowVariables
            });
            return res.data.data;
        },
        onSuccess: (data) => {
            setMappings(data);
        }
    });

    // 3. Final Save
    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!file || !name) throw new Error("Missing data");

            const formData = new FormData();
            formData.append('name', name);
            formData.append('description', description);
            formData.append('type', 'docx');
            formData.append('file', file);
            // We could also save the mappings metadata here if backend supported it

            const response = await fetch(`/api/projects/${projectId}/templates`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!response.ok) throw new Error("Failed to save");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-templates', projectId] });
            toast.success('Template saved successfully');
            onOpenChange(false);
            reset();
        }
    });

    const reset = () => {
        setStep(1);
        setName('');
        setDescription('');
        setFile(null);
        setAnalysis(null);
        setMappings([]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            if (!name) setName(selectedFile.name.replace(/\.[^/.]+$/, ''));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {step === 1 ? "Upload New Template" : "AI Template Analysis"}
                    </DialogTitle>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="file">Template File (.docx)</Label>
                            <Input id="file" type="file" accept=".docx" onChange={handleFileChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description (Optional)</Label>
                            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 py-4">
                        <Alert className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
                            <Sparkles className="h-4 w-4 text-blue-600" />
                            <AlertTitle>Analysis Complete</AlertTitle>
                            <AlertDescription>
                                We found {analysis?.variables?.length || 0} variables. Review suggestions below.
                            </AlertDescription>
                        </Alert>

                        <ScrollArea className="h-[250px] border rounded-md p-4">
                            <div className="space-y-3">
                                {analysis?.variables?.map((v: any, i: number) => {
                                    const mapping = mappings.find(m => m.templateVariable === v.name);
                                    return (
                                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm">
                                            <div className="font-mono">{v.name}</div>
                                            <div className="flex items-center gap-2">
                                                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                                <Badge variant={mapping?.workflowVariableId ? "default" : "secondary"}>
                                                    {mapping?.workflowVariableId ? (
                                                        workflowVariables.find(wv => wv.id === mapping.workflowVariableId)?.label || "Mapped"
                                                    ) : "New Variable"}
                                                </Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        <p className="text-xs text-muted-foreground">
                            Variables marked "New" can be automatically created in your workflow later.
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step === 1 ? (
                        <Button onClick={() => uploadAndAnalyzeMutation.mutate()} disabled={!file || !name || uploadAndAnalyzeMutation.isPending}>
                            {uploadAndAnalyzeMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Sparkles className="mr-2 w-4 h-4" />}
                            Analyze & Continue
                        </Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 w-4 h-4" />}
                                Save Template
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
