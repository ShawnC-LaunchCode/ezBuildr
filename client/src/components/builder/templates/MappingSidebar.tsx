import { Check, ChevronsUpDown, FileCode, TableProperties, Type, Variable } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from '@/lib/utils';

import { MappingMode, PdfField, WorkflowVariable } from './PdfMappingEditor.types';

interface MappingSidebarProps {
    selectedField: string | null;
    mapping: Record<string, string>;
    setMapping: (mapping: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    workflowVariables: WorkflowVariable[];
    fields: PdfField[];
    setSelectedField: (field: string | null) => void;
}

export function MappingSidebar({
    selectedField,
    mapping,
    setMapping,
    workflowVariables,
    fields,
    setSelectedField
}: MappingSidebarProps) {
    // Local State
    const [activeTab, setActiveTab] = useState<MappingMode>('variable');
    const [open, setOpen] = useState(false);
    const [templateInput, setTemplateInput] = useState("");

    // Mention State
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);

    // Helpers
    const getMappingMode = (val: string | undefined): MappingMode => {
        if (!val) { return 'variable'; }
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            return 'constant';
        }
        if (val.startsWith('concat(')) {
            return 'template';
        }
        const isVar = workflowVariables.some(v => v.alias === val || v.id === val);
        if (isVar) { return 'variable'; }
        return 'excel';
    };

    const getDisplayValue = (val: string | undefined, mode: MappingMode): string => {
        if (!val) { return ""; }
        if (mode === 'constant') {
            return val.slice(1, -1);
        }
        if (mode === 'template') {
            return "";
        }
        return val;
    };

    const getMappedLabel = (val: string) => {
        if (!val) { return "Select variable..."; }
        const v = workflowVariables.find(wv => wv.alias === val || wv.id === val);
        if (!v) { return val; }
        if (v.alias) { return v.alias; }
        return v.text;
    };

    const convertTemplateToExpression = (templateStr: string): string => {
        const parts = templateStr.split(/(\{\{[^}]+\}\})/g);
        const args = parts.map(part => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                return part.slice(2, -2).trim();
            } else if (part.length > 0) {
                return `'${part.replace(/'/g, "\\'")}'`;
            }
            return null;
        }).filter((p): p is string => p !== null);
        if (args.length === 0) { return "''"; }
        if (args.length === 1) { return args[0]; }
        return `concat(${args.join(', ')})`;
    };

    // Sort variables
    const sortedVariables = useMemo(() => {
        const aliased = workflowVariables.filter(v => !!v.alias).sort((a, b) => (a.alias ?? '').localeCompare(b.alias ?? ''));
        const unaliased = workflowVariables.filter(v => !v.alias).sort((a, b) => a.text.localeCompare(b.text));
        return [...aliased, ...unaliased];
    }, [workflowVariables]);

    // Reset template input and sync active tab
    useEffect(() => {
        setTemplateInput("");
        if (selectedField) {
            setActiveTab(getMappingMode(mapping[selectedField]));
        } else {
            setActiveTab('variable');
        }
    }, [selectedField, mapping]);

    return (
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
                                        value={mapping[selectedField] ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setMapping(prev => ({ ...prev, [selectedField]: val }));
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
                                        onClick={() => {
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
                                                            .slice(0, 50)
                                                            .map(variable => (
                                                                <CommandItem
                                                                    key={variable.id}
                                                                    value={variable.alias || variable.text}
                                                                    onSelect={() => {
                                                                        const currentVal = mapping[selectedField] ?? '';
                                                                        const cursor = cursorPosition ?? 0;
                                                                        const beforeTrigger = currentVal.slice(0, cursor);
                                                                        const match = beforeTrigger.match(/(@|\{\{)([\w]*)$/);
                                                                        if (match) {
                                                                            const startIdx = match.index ?? 0;
                                                                            const prefix = currentVal.slice(0, startIdx);
                                                                            const suffix = currentVal.slice(cursor);
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
                                            const expr = convertTemplateToExpression(val);
                                            setMapping(prev => ({ ...prev, [selectedField]: expr }));
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
                                        onClick={() => {
                                            setMentionOpen(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (mentionOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                                                e.preventDefault();
                                            }
                                        }}
                                    />
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
                                                            .slice(0, 50)
                                                            .map(variable => (
                                                                <CommandItem
                                                                    key={variable.id}
                                                                    value={variable.alias || variable.text}
                                                                    onSelect={() => {
                                                                        const textBefore = templateInput.slice(0, cursorPosition ?? 0);
                                                                        const match = textBefore.match(/(@|\{\{)([\w]*)$/);
                                                                        if (match) {
                                                                            const startIdx = match.index ?? 0;
                                                                            const prefix = templateInput.slice(0, startIdx);
                                                                            const suffix = templateInput.slice(cursorPosition ?? 0);
                                                                            const insert = `{{${variable.alias || variable.text}}}`;
                                                                            const newVal = prefix + insert + suffix;
                                                                            setTemplateInput(newVal);
                                                                            const expr = convertTemplateToExpression(newVal);
                                                                            setMapping(prev => ({ ...prev, [selectedField]: expr }));
                                                                            setMentionOpen(false);
                                                                            setTimeout(() => {
                                                                                const input = document.getElementById('template-input') as HTMLTextAreaElement;
                                                                                if (input) { input.focus(); }
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
                                onClick={() => { setSelectedField(f.name); }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setSelectedField(f.name);
                                    }
                                }}
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
    );
}
