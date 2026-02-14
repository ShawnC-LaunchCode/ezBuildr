/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import axios from 'axios';
import { Save, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

import { MappingSidebar } from './MappingSidebar';
import { PdfCanvas } from './PdfCanvas';
import { PageDimension, PdfField, WorkflowVariable } from './PdfMappingEditor.types';

interface PdfTemplate {
    name: string;
    metadata?: {
        fields?: PdfField[];
    };
    mapping?: Record<string, string>;
}

interface PdfMappingEditorProps {
    templateId: string;
    isOpen: boolean;
    onClose: () => void;
    workflowVariables: WorkflowVariable[];
    projectId: string;
}

export function PdfMappingEditor({ templateId, isOpen, onClose, workflowVariables }: PdfMappingEditorProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [template, setTemplate] = useState<PdfTemplate | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [fields, setFields] = useState<PdfField[]>([]);
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState(1.0);
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Note: We need page dimensions to map coordinates.
    // React-pdf page.view is [x1, y1, x2, y2]
    const [pageDimensions, setPageDimensions] = useState<Record<number, PageDimension>>({});

    // Load template data
    useEffect(() => {
        if (isOpen && templateId) {
            void loadTemplate();
        }
    }, [isOpen, templateId]);

    const loadTemplate = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get<PdfTemplate>(`/api/templates/${templateId}`);
            setTemplate(response.data);
            if (response.data.metadata?.fields) {
                setFields(response.data.metadata.fields);
            }
            if (response.data.mapping) {
                setMapping(response.data.mapping);
            }
        } catch (err: unknown) {
            console.error("Failed to load template", err);
            setError("Failed to load PDF template data.");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await axios.patch(`/api/templates/${templateId}`, {
                mapping: mapping
            });
            toast({
                title: "Mapping saved",
                description: "Template field mappings have been updated."
            });
            onClose();
        } catch (err) {
            toast({
                title: "Save failed",
                description: "Could not save mappings.",
                variant: "destructive"
            });
        }
    };

    const onDocumentLoadSuccess = ({ numPages: nextNumPages }: { numPages: number }) => {
        setNumPages(nextNumPages);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPageLoadSuccess = (page: any, index: number) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const view = (page.view as number[]) || [0, 0, page.width, page.height];
        setPageDimensions(prev => ({
            ...prev,
            [index]: { width: page.width, height: page.height, view }
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <div className="flex justify-between items-center">
                        <DialogTitle>{template?.name ?? "PDF Mapping Editor"}</DialogTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(2.0, s + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
                            <Button onClick={() => { void handleSave(); }} size="sm"><Save className="w-4 h-4 mr-2" /> Save</Button>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: PDF Viewer */}
                    <div className="flex-1 bg-slate-100 overflow-auto flex justify-center p-4 relative">
                        <PdfCanvas
                            templateId={templateId}
                            loading={loading}
                            error={error}
                            numPages={numPages}
                            scale={scale}
                            pageDimensions={pageDimensions}
                            fields={fields}
                            mapping={mapping}
                            selectedField={selectedField}
                            onDocumentLoadSuccess={onDocumentLoadSuccess}
                            onPageLoadSuccess={onPageLoadSuccess}
                            setSelectedField={setSelectedField}
                        />
                    </div>

                    {/* Right: Sidebar */}
                    <MappingSidebar
                        selectedField={selectedField}
                        mapping={mapping}
                        setMapping={setMapping}
                        workflowVariables={workflowVariables}
                        fields={fields}
                        setSelectedField={setSelectedField}
                    />
                </div>
            </DialogContent>
        </Dialog >
    );
}