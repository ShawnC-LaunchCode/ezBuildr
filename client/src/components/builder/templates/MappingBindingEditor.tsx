/**
 * MappingBindingEditor — the per-field binding UI for the Document Mapping
 * Workbench (GH-156). Binds ONE document field/placeholder to one of four
 * source kinds: a workflow step variable, a DataVault table/column/row, a
 * `{{alias}}` formula string, or a fixed constant.
 *
 * Shared between `MappingSidebar` (PDF form-field mapping) and the DOCX
 * placeholder panel in `DocumentTemplateEditor` — one binding editor, two
 * hosts, so both surfaces stay in lockstep instead of drifting apart.
 */
import { Check, ChevronsUpDown, Database, FileCode, Type, Variable } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useDatavaultColumns, useDatavaultRows, useDatavaultTables } from '@/lib/datavault-hooks';
import { cn } from '@/lib/utils';

import { type MappingMode, type WorkflowVariable } from './PdfMappingEditor.types';

import type { MappingBinding } from '@shared/types/documentMapping';

interface MappingBindingEditorProps {
    binding: MappingBinding | undefined;
    onChange: (binding: MappingBinding | undefined) => void;
    workflowVariables: WorkflowVariable[];
}

function modeOf(binding: MappingBinding | undefined): MappingMode {
    return binding?.type ?? 'unmapped';
}

export function MappingBindingEditor({ binding, onChange, workflowVariables }: MappingBindingEditorProps) {
    const [activeTab, setActiveTab] = useState<MappingMode>(modeOf(binding));
    const [variablePickerOpen, setVariablePickerOpen] = useState(false);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [cursorPosition, setCursorPosition] = useState<number | null>(null);

    // Reset to the binding's own mode whenever the selected field changes.
    useEffect(() => {
        setActiveTab(modeOf(binding));
        setMentionOpen(false);
    }, [binding]);

    const sortedVariables = useMemo(() => {
        const aliased = workflowVariables.filter(v => !!v.alias).sort((a, b) => (a.alias ?? '').localeCompare(b.alias ?? ''));
        const unaliased = workflowVariables.filter(v => !v.alias).sort((a, b) => a.text.localeCompare(b.text));
        return [...aliased, ...unaliased];
    }, [workflowVariables]);

    const getVariableLabel = (source: string): string => {
        const v = workflowVariables.find(wv => wv.alias === source || wv.id === source);
        if (!v) { return source; }
        return v.alias ?? v.text;
    };

    const formulaExpression = binding?.type === 'formula' ? binding.expression : '';

    const insertMentionAt = (currentValue: string, insertText: string, cursor: number): { next: string; nextCursor: number } => {
        const before = currentValue.slice(0, cursor);
        const match = before.match(/(@|\{\{)([\w.]*)$/);
        if (!match) { return { next: currentValue, nextCursor: cursor }; }
        const startIdx = match.index ?? 0;
        const prefix = currentValue.slice(0, startIdx);
        const suffix = currentValue.slice(cursor);
        const next = prefix + insertText + suffix;
        return { next, nextCursor: prefix.length + insertText.length };
    };

    return (
        <div className="space-y-2">
            <Tabs
                value={activeTab}
                onValueChange={(val) => {
                    const mode = val as MappingMode;
                    setActiveTab(mode);
                    // Switching tabs starts a fresh binding of that kind — the
                    // previous binding's value doesn't carry over across kinds.
                    if (mode === 'variable') { onChange(undefined); }
                    else if (mode === 'constant') { onChange({ type: 'constant', value: '' }); }
                    else if (mode === 'formula') { onChange({ type: 'formula', expression: '' }); }
                    else if (mode === 'datavault') { onChange(undefined); }
                }}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="variable" title="Step variable"><Variable className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="datavault" title="DataVault"><Database className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="constant" title="Constant text"><Type className="w-4 h-4" /></TabsTrigger>
                    <TabsTrigger value="formula" title="Formula"><FileCode className="w-4 h-4" /></TabsTrigger>
                </TabsList>

                {/* 1. Variable Picker */}
                <TabsContent value="variable" className="pt-2">
                    <p className="text-[10px] text-muted-foreground mb-2">Map directly to a workflow step variable.</p>
                    <Popover open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={variablePickerOpen} className="w-full justify-between font-normal text-left">
                                {binding?.type === 'variable'
                                    ? <span className="truncate">{getVariableLabel(binding.source)}</span>
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
                                        <CommandItem value="unmapped" onSelect={() => { onChange(undefined); setVariablePickerOpen(false); }}>
                                            <Check className={cn('mr-2 h-4 w-4', binding === undefined ? 'opacity-100' : 'opacity-0')} />
                                            -- Unmapped --
                                        </CommandItem>
                                        {sortedVariables.map((variable) => {
                                            const valueToStore = variable.alias ?? variable.id;
                                            const isCurrent = binding?.type === 'variable' && binding.source === valueToStore;
                                            return (
                                                <CommandItem
                                                    key={variable.id}
                                                    value={variable.alias ? `${variable.alias} ${variable.text}` : `${variable.text} ${variable.id}`}
                                                    onSelect={() => {
                                                        onChange({ type: 'variable', source: valueToStore });
                                                        setVariablePickerOpen(false);
                                                    }}
                                                >
                                                    <Check className={cn('mr-2 h-4 w-4', isCurrent ? 'opacity-100' : 'opacity-0')} />
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

                {/* 2. DataVault Picker */}
                <TabsContent value="datavault" className="pt-2">
                    <DatavaultBindingPicker
                        binding={binding?.type === 'datavault' ? binding : undefined}
                        onChange={onChange}
                    />
                </TabsContent>

                {/* 3. Constant Text */}
                <TabsContent value="constant" className="pt-2">
                    <p className="text-[10px] text-muted-foreground mb-2">A fixed value, saved as-is (e.g. &quot;N/A&quot;).</p>
                    <Input
                        placeholder="e.g. N/A"
                        value={binding?.type === 'constant' ? binding.value : ''}
                        onChange={(e) => { onChange({ type: 'constant', value: e.target.value }); }}
                    />
                </TabsContent>

                {/* 4. Formula (template-string interpolation) */}
                <TabsContent value="formula" className="pt-2 relative">
                    <p className="text-[10px] text-muted-foreground mb-2">
                        Type <code>@</code> or <code>{'{{'}</code> to insert a variable, e.g. Dear {'{{'}FirstName{'}}'},
                    </p>
                    <div className="relative">
                        <Textarea
                            id="formula-input"
                            placeholder="e.g. Dear {{FirstName}},"
                            value={formulaExpression}
                            onChange={(e) => {
                                const val = e.target.value;
                                onChange({ type: 'formula', expression: val });
                                const cursor = e.target.selectionStart;
                                const textBeforeCursor = val.slice(0, cursor);
                                const match = textBeforeCursor.match(/(@|\{\{)([\w.]*)$/);
                                if (match) {
                                    setMentionOpen(true);
                                    setMentionQuery(match[2]);
                                    setCursorPosition(cursor);
                                } else {
                                    setMentionOpen(false);
                                }
                            }}
                            onClick={() => { setMentionOpen(false); }}
                            onKeyDown={(e) => {
                                if (mentionOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                                    e.preventDefault();
                                }
                            }}
                        />
                        {mentionOpen && (
                            <div className="absolute z-50 w-64 mt-1 bg-popover rounded-md border shadow-md animate-in fade-in zoom-in-95 duration-100 p-0 overflow-hidden" style={{ top: '100%', left: 0 }}>
                                <Command className="w-full">
                                    <CommandList>
                                        <CommandEmpty>No variable found.</CommandEmpty>
                                        <CommandGroup heading="Variables">
                                            {sortedVariables
                                                .filter(v =>
                                                    !mentionQuery ||
                                                    v.text.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                                                    v.alias?.toLowerCase().includes(mentionQuery.toLowerCase())
                                                )
                                                .slice(0, 50)
                                                .map(variable => (
                                                    <CommandItem
                                                        key={variable.id}
                                                        value={variable.alias ?? variable.text}
                                                        onSelect={() => {
                                                            const insert = `{{${variable.alias ?? variable.text}}}`;
                                                            const { next, nextCursor } = insertMentionAt(formulaExpression, insert, cursorPosition ?? formulaExpression.length);
                                                            onChange({ type: 'formula', expression: next });
                                                            setMentionOpen(false);
                                                            setTimeout(() => {
                                                                const input = document.getElementById('formula-input') as HTMLTextAreaElement | null;
                                                                if (input) {
                                                                    input.focus();
                                                                    input.setSelectionRange(nextCursor, nextCursor);
                                                                }
                                                            }, 0);
                                                        }}
                                                        className="cursor-pointer"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{variable.alias ?? variable.text}</span>
                                                            {variable.alias != null && <span className="text-[10px] text-muted-foreground">{variable.text}</span>}
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
            </Tabs>
        </div>
    );
}

// ============================================================================
// DataVault sub-picker (table -> column -> row)
// ============================================================================

interface DatavaultBindingPickerProps {
    binding: Extract<MappingBinding, { type: 'datavault' }> | undefined;
    onChange: (binding: MappingBinding | undefined) => void;
}

function rowLabel(row: { row: { id: string }; values: Record<string, unknown> }): string {
    const firstValue = Object.values(row.values).find(v => v !== null && v !== undefined && v !== '');
    return firstValue !== undefined ? String(firstValue) : row.row.id.slice(0, 8);
}

function DatavaultBindingPicker({ binding, onChange }: DatavaultBindingPickerProps) {
    const { data: tables } = useDatavaultTables();
    const { data: columns } = useDatavaultColumns(binding?.tableId);
    const { data: rowsResult } = useDatavaultRows(binding?.tableId, { limit: 100 });

    return (
        <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground mb-2">Pull a value from a specific DataVault row.</p>
            <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">Table</label>
                <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={binding?.tableId ?? ''}
                    onChange={(e) => {
                        const tableId = e.target.value;
                        if (!tableId) { onChange(undefined); return; }
                        onChange({ type: 'datavault', tableId, columnId: '', rowId: '' });
                    }}
                >
                    <option value="">-- Select table --</option>
                    {(tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </div>
            {binding?.tableId && (
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Column</label>
                    <select
                        className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                        value={binding.columnId}
                        onChange={(e) => { onChange({ ...binding, columnId: e.target.value }); }}
                    >
                        <option value="">-- Select column --</option>
                        {(columns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            )}
            {binding?.tableId && binding.columnId && (
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">Row</label>
                    <select
                        className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                        value={binding.rowId}
                        onChange={(e) => { onChange({ ...binding, rowId: e.target.value }); }}
                    >
                        <option value="">-- Select row --</option>
                        {(rowsResult?.rows ?? []).map(r => <option key={r.row.id} value={r.row.id}>{rowLabel(r)}</option>)}
                    </select>
                </div>
            )}
        </div>
    );
}
