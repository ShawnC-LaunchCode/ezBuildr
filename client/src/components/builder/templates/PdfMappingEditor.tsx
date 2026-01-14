import axios from 'axios';
import { Loader2, Save, ZoomIn, ZoomOut, AlertCircle, Check, ChevronsUpDown, Variable, TableProperties, Type, FileCode, Info } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Set worker source for react-pdf
// Use local worker to avoid CSP issues with CDN
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PdfField {
    name: string;
    type: string;
    pageIndex: number;
    rect?: { x: number; y: number; width: number; height: number };
    value?: string;
    options?: string[];
    isReadOnly?: boolean;
}

interface WorkflowVariable {
    id: string;
    alias: string | null;
    text: string;
}

interface PdfMappingEditorProps {
    templateId: string;
    isOpen: boolean;
    onClose: () => void;
    workflowVariables: WorkflowVariable[];
    projectId: string; // Needed for permissions/fetching context if separate from templateId
}

export function PdfMappingEditor({ templateId, isOpen, onClose, workflowVariables, projectId }: PdfMappingEditorProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [template, setTemplate] = useState<any>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [fields, setFields] = useState<PdfField[]>([]);
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState(1.0);
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Combobox state
    const [open, setOpen] = useState(false);

    // Sort variables: Aliased first (alpha), then Unaliased (alpha by text)
    const sortedVariables = useMemo(() => {
        const aliased = workflowVariables.filter(v => !!v.alias).sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
        const unaliased = workflowVariables.filter(v => !v.alias).sort((a, b) => a.text.localeCompare(b.text));
        return [...aliased, ...unaliased];
    }, [workflowVariables]);

    // Load template data
    useEffect(() => {
        if (isOpen && templateId) {
            loadTemplate();
        }
    }, [isOpen, templateId]);

    const loadTemplate = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`/api/templates/${templateId}`);
            setTemplate(response.data);
            if (response.data.metadata?.fields) {
                setFields(response.data.metadata.fields);
            }
            if (response.data.mapping) {
                setMapping(response.data.mapping);
            }
        } catch (err: any) {
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

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const getFieldsForPage = (pageIndex: number) => {
        return fields.filter(f => f.pageIndex === pageIndex);
    };

    // Note: We need page dimensions to map coordinates.
    // React-pdf page.view is [x1, y1, x2, y2]
    const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number, height: number, view: number[] }>>({});

    const onPageLoadSuccess = (page: any, index: number) => {
        const view = page.view || [0, 0, page.width, page.height];
        // console.log(`Page ${index} loaded. View: ${view}, Width: ${page.width}, Height: ${page.height}`);
        setPageDimensions(prev => ({
            ...prev,
            [index]: { width: page.width, height: page.height, view }
        }));
    };

    // Helper to get display label for a mapped value
    const getMappedLabel = (val: string) => {
        if (!val) {return "Select variable...";}
        const v = workflowVariables.find(wv => wv.alias === val || wv.id === val); // Backward compat check
        if (!v) {return val;} // Fallback

        if (v.alias) {return v.alias;}
        // Show question text for unaliased
    };

    // --- Advanced Mapping Helpers ---

    type MappingMode = 'variable' | 'excel' | 'constant' | 'template';

    const getMappingMode = (val: string | undefined): MappingMode => {
        if (!val) {return 'variable';} // Default

        // Constant: Quoted string
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            return 'constant';
        }

        // Template: starts with concat(
        if (val.startsWith('concat(')) {
            return 'template';
        }

        // Variable: Matches a known variable ID or alias
        const isVar = workflowVariables.some(v => v.alias === val || v.id === val);
        if (isVar) {return 'variable';}

        // Else assumed to be Excel/Formula
        return 'excel';
    };

    const getDisplayValue = (val: string | undefined, mode: MappingMode): string => {
        if (!val) {return "";}
        if (mode === 'constant') {
            // Strip quotes
            return val.slice(1, -1);
        }
        if (mode === 'template') {
            // Very basic reverse engineering of concat('A', B, 'C') for display
            // This is just a visual best-effort. 
            // Real parser would be better but expensive. 
            // unique sentinel approach?
            return ""; // For now, let template tab be write-only or clear on switch
        }
        return val;
    };

    const convertTemplateToExpression = (templateStr: string): string => {
        // Simple parser: Split by {{ }}
        // "Hello {{Name}}" -> concat('Hello ', Name)
        const parts = templateStr.split(/(\{\{[^}]+\}\})/g);
        const args = parts.map(part => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                // Variable: Return name without braces
                return part.slice(2, -2).trim();
            } else if (part.length > 0) {
                // Text: Escape quotes and wrap
                return `'${part.replace(/'/g, "\\'")}'`;
            }
            return null;
        }).filter(p => p !== null);

        if (args.length === 0) {return "''";}
        if (args.length === 1) {return args[0];}
        return `concat(${args.join(', ')})`;
    };

    // Local state for template input since we can't easily validly reverse-engineer `concat`
    const [templateInput, setTemplateInput] = useState("");
    const [activeTab, setActiveTab] = useState<MappingMode>('variable');

    // Mention State
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);

    // Reset template input and sync active tab when switching fields
    useEffect(() => {
        setTemplateInput("");
        if (selectedField) {
            setActiveTab(getMappingMode(mapping[selectedField]));
        } else {
            setActiveTab('variable');
        }
    }, [selectedField]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <div className="flex justify-between items-center">
                        <DialogTitle>{template?.name || "PDF Mapping Editor"}</DialogTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}><ZoomOut className="w-4 h-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(2.0, s + 0.1))}><ZoomIn className="w-4 h-4" /></Button>
                            <Button onClick={handleSave} size="sm"><Save className="w-4 h-4 mr-2" /> Save</Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: PDF Viewer */}
                    <div className="flex-1 bg-slate-100 overflow-auto flex justify-center p-4 relative">
                        {error ? (
                            <Alert variant="destructive" className="h-fit m-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                <span className="mt-2 text-sm text-muted-foreground">Loading PDF...</span>
                            </div>
                        ) : (
                            <Document
                                file={`/api/templates/${templateId}/download`}
                                onLoadSuccess={onDocumentLoadSuccess}
                                className="flex flex-col gap-4"
                                loading={<Loader2 className="w-8 h-8 animate-spin" />}
                            >
                                {Array.from(new Array(numPages), (el, index) => (
                                    <div key={`page_container_${index}`} className="relative shadow-md">
                                        <Page
                                            key={`page_${index}`}
                                            pageNumber={index + 1}
                                            scale={scale}
                                            onLoadSuccess={(page) => onPageLoadSuccess(page, index)}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                        />
                                        {/* Overlays */}
                                        {pageDimensions[index] && getFieldsForPage(index).map(field => {
                                            if (!field.rect) {
                                                console.warn(`Field ${field.name} has no rect`);
                                                return null;
                                            }

                                            // Coordinate Mapping
                                            const view = pageDimensions[index].view;
                                            const x_min = view[0];
                                            const view_max_y = view[3];

                                            // Calculate dimensions in PDF space
                                            const fieldX = field.rect.x;
                                            const fieldY = field.rect.y;
                                            const fieldW = field.rect.width;
                                            const fieldH = field.rect.height;

                                            // Canvas X = (Field X - View X Min) * Scale
                                            const x = (fieldX - x_min) * scale;
                                            const w = fieldW * scale;
                                            const h = fieldH * scale;

                                            // Canvas Y: Y_from_top = View_Max_Y - (Field_Y_Bottom + Field_H)
                                            const y = (view_max_y - (fieldY + fieldH)) * scale;

                                            const isMapped = !!mapping[field.name];
                                            const isSelected = selectedField === field.name;

                                            // Define colors based on state
                                            let borderColor = '#3b82f6'; // Blue (Unmapped)
                                            let bgColor = 'rgba(59, 130, 246, 0.2)';

                                            if (isSelected) {
                                                borderColor = '#9333ea'; // Purple (Selected)
                                                bgColor = 'rgba(147, 51, 234, 0.3)';
                                            } else if (isMapped) {
                                                borderColor = '#eab308'; // Yellow (Mapped)
                                                bgColor = 'rgba(234, 179, 8, 0.2)';
                                            }

                                            return (
                                                <div
                                                    key={field.name}
                                                    title={field.name}
                                                    onClick={() => setSelectedField(field.name)}
                                                    style={{
                                                        position: 'absolute',
                                                        left: x,
                                                        top: y,
                                                        width: w,
                                                        height: h,
                                                        border: `2px solid ${borderColor}`,
                                                        backgroundColor: bgColor,
                                                        cursor: 'pointer',
                                                        zIndex: 10
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </Document>
                        )}
                    </div>

                    {/* Right: Sidebar */}
                    <div className="w-80 border-l bg-white flex flex-col">
                        <div className="p-4 border-b bg-slate-50">
                            <h3 className="font-semibold text-sm">Field Properties</h3>
                        </div>
                        {selectedField ? (
                            <div className="p-4 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Field Name</label>
                                    <div className="text-sm font-mono bg-slate-100 p-2 rounded break-all">
                                        {selectedField}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Value Mapping</label>

                                    <Tabs
                                        defaultValue="variable"
                                        value={activeTab}
                                        onValueChange={(val) => setActiveTab(val as MappingMode)}
                                        className="w-full"
                                    >
                                        <TabsList className="grid w-full grid-cols-4">
                                            <TabsTrigger value="variable" title="Variable"><Variable className="w-4 h-4" /></TabsTrigger>
                                            <TabsTrigger value="excel" title="Smart/Excel"><TableProperties className="w-4 h-4" /></TabsTrigger>
                                            <TabsTrigger value="constant" title="Constant Text"><Type className="w-4 h-4" /></TabsTrigger>
                                            <TabsTrigger value="template" title="Text Template"><FileCode className="w-4 h-4" /></TabsTrigger>
                                        </TabsList>

                                        {/* 1. Variable Picker */}
                                        <TabsContent value="variable" className="pt-2">
                                            <p className="text-[10px] text-muted-foreground mb-2">Map directly to a workflow variable.</p>
                                            <Popover open={open} onOpenChange={setOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        aria-expanded={open}
                                                        className="w-full justify-between font-normal text-left"
                                                    >
                                                        {mapping[selectedField] && getMappingMode(mapping[selectedField]) === 'variable'
                                                            ? <span className="truncate">{getMappedLabel(mapping[selectedField])}</span>
                                                            : <span className="text-muted-foreground">-- Select variable --</span>}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[300px] p-0" align="start">
                                                    <Command>
                                                        <CommandInput placeholder="Search variable..." />
                                                        <CommandList>
                                                            <CommandEmpty>No variable found.</CommandEmpty>
                                                            <CommandGroup>
                                                                <CommandItem
                                                                    value="unmapped"
                                                                    onSelect={() => {
                                                                        setMapping(prev => {
                                                                            const next = { ...prev };
                                                                            delete next[selectedField];
                                                                            return next;
                                                                        });
                                                                        setOpen(false);
                                                                    }}
                                                                >
                                                                    <Check className={cn("mr-2 h-4 w-4", !mapping[selectedField] ? "opacity-100" : "opacity-0")} />
                                                                    -- Unmapped --
                                                                </CommandItem>
                                                                {sortedVariables.map((variable) => {
                                                                    const valueToStore = variable.alias || variable.id;
                                                                    const isCurrent = mapping[selectedField] === valueToStore;
                                                                    return (
                                                                        <CommandItem
                                                                            key={variable.id}
                                                                            value={variable.alias ? `${variable.alias} ${variable.text}` : `${variable.text} ${variable.id}`}
                                                                            onSelect={() => {
                                                                                setMapping(prev => ({ ...prev, [selectedField]: valueToStore }));
                                                                                setOpen(false);
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4", isCurrent ? "opacity-100" : "opacity-0")} />
                                                                            <div className="flex flex-col overflow-hidden">
                                                                                {variable.alias ? (
                                                                                    <>
                                                                                        <span className="font-medium truncate">{variable.alias}</span>
                                                                                        <span className="text-xs text-muted-foreground truncate">{variable.text}</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <span className="font-medium truncate">{variable.text}</span>
                                                                                        <span className="text-xs text-muted-foreground font-mono truncate">{variable.id}</span>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </CommandItem>
                                                                    );
                                                                })}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </TabsContent>

                                        {/* 2. Excel / Smart Input */}
                                        <TabsContent value="excel" className="pt-2 relative">
                                            <p className="text-[10px] text-muted-foreground mb-2">Write a formula (e.g. <code>Price * 0.2</code>). Type <code>@</code> to insert variable.</p>
                                            <div className="relative">
                                                <Textarea
                                                    id="excel-input"
                                                    className="font-mono text-xs"
                                                    placeholder="e.g. Price * 0.2"
                                                    value={mapping[selectedField] || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setMapping(prev => ({ ...prev, [selectedField]: val }));

                                                        // Check for trigger
                                                        const cursor = e.target.selectionStart;
                                                        const textBeforeCursor = val.slice(0, cursor);
                                                        const match = textBeforeCursor.match(/(@|\{\{)([\w]*)$/);

                                                        if (match) {
                                                            setMentionOpen(true);
                                                            setMentionQuery(match[2]);
                                                            setCursorPosition(cursor);
                                                        } else {
                                                            setMentionOpen(false);
                                                        }
                                                    }}
                                                    onClick={(e) => {
                                                        setMentionOpen(false);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (mentionOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                                                            e.preventDefault();
                                                        }
                                                    }}
                                                />

                                                {/* Mention Popover for Excel */}
                                                {mentionOpen && (
                                                    <div className="absolute z-50 w-64 mt-1 bg-white rounded-md border shadow-md animate-in fade-in zoom-in-95 duration-100 p-0 overflow-hidden" style={{ top: '100%', left: 0 }}>
                                                        <Command className="w-full">
                                                            <CommandList>
                                                                <CommandEmpty>No variable found.</CommandEmpty>
                                                                <CommandGroup heading="Variables">
                                                                    {sortedVariables
                                                                        .filter(v =>
                                                                            !mentionQuery ||
                                                                            v.text.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                                                                            (v.alias && v.alias.toLowerCase().includes(mentionQuery.toLowerCase()))
                                                                        )
                                                                        .slice(0, 50) // Limit results
                                                                        .map(variable => (
                                                                            <CommandItem
                                                                                key={variable.id}
                                                                                value={variable.alias || variable.text}
                                                                                onSelect={() => {
                                                                                    // Insert variable WITHOUT brackets
                                                                                    const currentVal = mapping[selectedField] || '';
                                                                                    const beforeTrigger = currentVal.slice(0, cursorPosition!); // Approximate, refined below

                                                                                    // Re-find match
                                                                                    const match = beforeTrigger.match(/(@|\{\{)([\w]*)$/);

                                                                                    if (match) {
                                                                                        const startIdx = match.index!;
                                                                                        const prefix = currentVal.slice(0, startIdx);
                                                                                        const suffix = currentVal.slice(cursorPosition!);

                                                                                        // Raw insert
                                                                                        const insert = variable.alias || variable.text;

                                                                                        const newVal = prefix + insert + suffix;
                                                                                        setMapping(prev => ({ ...prev, [selectedField]: newVal }));

                                                                                        setMentionOpen(false);

                                                                                        setTimeout(() => {
                                                                                            const input = document.getElementById('excel-input') as HTMLTextAreaElement;
                                                                                            if (input) {
                                                                                                input.focus();
                                                                                                const newCursor = prefix.length + insert.length;
                                                                                                input.setSelectionRange(newCursor, newCursor);
                                                                                            }
                                                                                        }, 0);
                                                                                    }
                                                                                }}
                                                                                className="cursor-pointer"
                                                                            >
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-medium">{variable.alias || variable.text}</span>
                                                                                    {variable.alias && <span className="text-[10px] text-muted-foreground">{variable.text}</span>}
                                                                                </div>
                                                                            </CommandItem>
                                                                        ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </div>
                                                )}
                                            </div>
                                        </TabsContent>

                                        {/* 3. Constant Text */}
                                        <TabsContent value="constant" className="pt-2">
                                            <p className="text-[10px] text-muted-foreground mb-2">Value will be saved as text (auto-quoted).</p>
                                            <Input
                                                placeholder="e.g. N/A"
                                                value={getMappingMode(mapping[selectedField]) === 'constant' ? getDisplayValue(mapping[selectedField], 'constant') : ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    // Auto-quote
                                                    setMapping(prev => ({ ...prev, [selectedField]: `'${val.replace(/'/g, "\\'")}'` }));
                                                }}
                                            />
                                        </TabsContent>

                                        {/* 4. Template Interpolation */}
                                        <TabsContent value="template" className="pt-2 relative">
                                            <p className="text-[10px] text-muted-foreground mb-2">Type <code>@</code> or <code>{`{{`}</code> to insert a variable.</p>
                                            <div className="relative">
                                                <Textarea
                                                    id="template-input"
                                                    placeholder="e.g. Dear {{FirstName}},"
                                                    value={templateInput}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setTemplateInput(val);

                                                        // Update mapping immediately
                                                        const expr = convertTemplateToExpression(val);
                                                        setMapping(prev => ({ ...prev, [selectedField]: expr }));

                                                        // Check for trigger
                                                        const cursor = e.target.selectionStart;
                                                        const textBeforeCursor = val.slice(0, cursor);
                                                        const match = textBeforeCursor.match(/(@|\{\{)([\w]*)$/);

                                                        if (match) {
                                                            setMentionOpen(true);
                                                            setMentionQuery(match[2]);
                                                            setCursorPosition(cursor);
                                                        } else {
                                                            setMentionOpen(false);
                                                        }
                                                    }}
                                                    onClick={(e) => {
                                                        setMentionOpen(false);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (mentionOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                                                            e.preventDefault();
                                                            // Logic handled by CommandList mostly, but preventing default textarea behavior
                                                        }
                                                    }}
                                                />

                                                {/* Mention Popover - positioned relative to container for simplicity */}
                                                {mentionOpen && (
                                                    <div className="absolute z-50 w-64 mt-1 bg-white rounded-md border shadow-md animate-in fade-in zoom-in-95 duration-100 p-0 overflow-hidden" style={{ top: '100%', left: 0 }}>
                                                        <Command className="w-full">
                                                            <CommandList>
                                                                <CommandEmpty>No variable found.</CommandEmpty>
                                                                <CommandGroup heading="Variables">
                                                                    {sortedVariables
                                                                        .filter(v =>
                                                                            !mentionQuery ||
                                                                            v.text.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                                                                            (v.alias && v.alias.toLowerCase().includes(mentionQuery.toLowerCase()))
                                                                        )
                                                                        .slice(0, 50) // Limit results
                                                                        .map(variable => (
                                                                            <CommandItem
                                                                                key={variable.id}
                                                                                value={variable.alias || variable.text}
                                                                                onSelect={() => {
                                                                                    // Insert variable
                                                                                    // Re-calculate split point based on last detected trigger
                                                                                    // Actually, safer to use the exact match length logic

                                                                                    // Let's re-find the match to be safe
                                                                                    const textBefore = templateInput.slice(0, cursorPosition!);
                                                                                    const match = textBefore.match(/(@|\{\{)([\w]*)$/);

                                                                                    if (match) {
                                                                                        const trigger = match[1];
                                                                                        const query = match[2];
                                                                                        const startIdx = match.index!;

                                                                                        const prefix = templateInput.slice(0, startIdx);
                                                                                        const suffix = templateInput.slice(cursorPosition!);

                                                                                        // Ensure we wrap in {{ }} if trigger was @, or complete it if {{
                                                                                        const insert = `{{${variable.alias || variable.text}}}`; // Always normalize to {{Var}}

                                                                                        const newVal = prefix + insert + suffix;
                                                                                        setTemplateInput(newVal);

                                                                                        // Update mapping
                                                                                        const expr = convertTemplateToExpression(newVal);
                                                                                        setMapping(prev => ({ ...prev, [selectedField]: expr }));

                                                                                        setMentionOpen(false);
                                                                                        // Focus back?
                                                                                        const input = document.getElementById('template-input') as HTMLTextAreaElement;
                                                                                        if (input) {input.focus();}
                                                                                    }
                                                                                }}
                                                                                className="cursor-pointer"
                                                                            >
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-medium">{variable.alias || variable.text}</span>
                                                                                    {variable.alias && <span className="text-[10px] text-muted-foreground">{variable.text}</span>}
                                                                                </div>
                                                                            </CommandItem>
                                                                        ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-2 p-2 bg-slate-50 rounded border text-[10px] text-muted-foreground font-mono break-all">
                                                Generated: {mapping[selectedField] || '(none)'}
                                            </div>
                                        </TabsContent>

                                    </Tabs>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                Select a field on the PDF to map it to a workflow variable.
                            </div>
                        )}

                        <div className="mt-auto border-t">
                            <div className="p-2 bg-slate-50 text-xs font-medium text-muted-foreground border-b px-4">
                                All Fields
                            </div>
                            <ScrollArea className="h-64">
                                <div className="p-0">
                                    {fields.map(f => (
                                        <div
                                            key={f.name}
                                            className={`px-4 py-2 text-sm border-b cursor-pointer hover:bg-slate-50 ${selectedField === f.name ? 'bg-purple-50' : ''}`}
                                            onClick={() => setSelectedField(f.name)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="truncate max-w-[180px]" title={f.name}>{f.name}</span>
                                                {mapping[f.name] && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
}
