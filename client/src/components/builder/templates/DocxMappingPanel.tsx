/**
 * DocxMappingPanel — the DOCX side of the Document Mapping Workbench
 * (GH-156). Extracts `{{placeholder}}` names from the saved template, lets
 * the author bind each one via `MappingSidebar`/`MappingBindingEditor`, and
 * persists the result to `templates.mapping`.
 *
 * Replaces the previous `AIAssistPanel`, whose "apply mapping" action only
 * logged to the console (`DocumentTemplateEditor`'s old `handleApplyMapping`
 * TODO) — nothing was ever saved. AI-assisted suggestions are folded in here
 * as a "Suggest with AI" action that pre-fills unmapped placeholders instead
 * of a separate always-on panel.
 */
import axios from 'axios';
import { AlertTriangle, Loader2, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

import { MappingSidebar } from './MappingSidebar';
import { type MappableField, type WorkflowVariable } from './PdfMappingEditor.types';

import type { DocumentFieldMapping, MappingBinding } from '@shared/types/documentMapping';

interface PlaceholderInfo {
    name: string;
    type: 'text' | 'image' | 'list';
    example?: string;
}

interface MappingSuggestion {
    templateVariable: string;
    workflowVariableId?: string;
    confidence?: number;
}

interface DocxMappingPanelProps {
    templateId: string;
    workflowId?: string;
    workflowVariables: WorkflowVariable[];
}

export function DocxMappingPanel({ templateId, workflowId, workflowVariables }: DocxMappingPanelProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([]);
    const [mapping, setMapping] = useState<DocumentFieldMapping>({});
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [unmatchedPlaceholders, setUnmatchedPlaceholders] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [templateRes, placeholdersRes] = await Promise.all([
                    axios.get<{ mapping?: DocumentFieldMapping }>(`/api/templates/${templateId}`),
                    axios.get<{ placeholders: PlaceholderInfo[] }>(`/api/templates/${templateId}/placeholders`),
                ]);
                if (cancelled) { return; }
                setMapping(templateRes.data.mapping ?? {});
                setPlaceholders(placeholdersRes.data.placeholders);
            } catch (error) {
                console.error('Failed to load template mapping data', error);
                toast({ title: 'Could not load placeholders', variant: 'destructive' });
            } finally {
                if (!cancelled) { setLoading(false); }
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [templateId]);

    // Workflow-aware coverage check (AC4): which placeholders don't match any
    // known step alias AND have no manual binding at all — reuses the
    // existing /validate comparison when a workflow context is available.
    useEffect(() => {
        if (workflowId === undefined) { return; }
        let cancelled = false;
        axios.get<{ missing?: Array<{ name: string }> }>(`/api/templates/${templateId}/validate`, { params: { workflowId } })
            .then((res) => {
                if (cancelled) { return; }
                const missingNames = (res.data.missing ?? []).map(m => m.name);
                setUnmatchedPlaceholders(missingNames.filter(name => mapping[name] === undefined));
            })
            .catch(() => { /* best-effort — the sidebar's own unmapped indicator still works without it */ });
        return () => { cancelled = true; };
    }, [templateId, workflowId, mapping]);

    const unmappedCount = placeholders.filter(p => mapping[p.name] === undefined).length;

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/templates/${templateId}`, { mapping });
            toast({ title: 'Mapping saved', description: 'Template field mappings have been updated.' });
        } catch (error) {
            console.error('Failed to save mapping', error);
            toast({ title: 'Save failed', description: 'Could not save mappings.', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleSuggest = async () => {
        setSuggesting(true);
        try {
            const unmapped = placeholders.filter(p => mapping[p.name] === undefined);
            if (unmapped.length === 0) {
                toast({ title: 'Nothing to suggest', description: 'Every placeholder is already mapped.' });
                return;
            }
            const res = await axios.post<{ data: MappingSuggestion[] }>('/api/ai/doc/suggest-mappings', {
                templateVariables: unmapped.map(p => ({ name: p.name })),
                workflowVariables: workflowVariables.map(v => ({ id: v.id, name: v.alias ?? v.text, label: v.text })),
            });
            const suggestions = res.data.data ?? [];
            let applied = 0;
            setMapping(prev => {
                const next = { ...prev };
                for (const s of suggestions) {
                    if (!s.workflowVariableId) { continue; }
                    const variable = workflowVariables.find(v => v.id === s.workflowVariableId);
                    if (!variable) { continue; }
                    const binding: MappingBinding = { type: 'variable', source: variable.alias ?? variable.id };
                    next[s.templateVariable] = binding;
                    applied++;
                }
                return next;
            });
            toast({
                title: applied > 0 ? `Applied ${applied} suggestion${applied === 1 ? '' : 's'}` : 'No confident matches found',
                description: applied > 0 ? 'Review the mapping below, then Save.' : undefined,
            });
        } catch (error) {
            console.error('AI suggestion failed', error);
            toast({ title: 'AI suggestion failed', variant: 'destructive' });
        } finally {
            setSuggesting(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center border-l bg-background w-80">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const fields: MappableField[] = placeholders.map(p => ({ name: p.name }));

    // No outer width/border here — `MappingSidebar` below already sets w-80
    // border-l bg-background on its own root; this just stacks the toolbar
    // and warnings above it inside the same column.
    return (
        <div className="h-full flex flex-col">
            <div className="w-80 border-l bg-background p-3 border-b flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="font-semibold text-sm">Field Mapping</h3>
                    <p className="text-xs text-muted-foreground">
                        {placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'}
                        {unmappedCount > 0 && <span className="text-amber-600"> · {unmappedCount} unmapped</span>}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { void handleSuggest(); }} disabled={suggesting} title="Suggest mappings with AI">
                        {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" onClick={() => { void handleSave(); }} disabled={saving} title="Save mapping">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
            {unmatchedPlaceholders.length > 0 && (
                <div className="w-80 border-l bg-amber-50 dark:bg-amber-950/30 px-3 py-2 border-b text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                        {unmatchedPlaceholders.length} placeholder{unmatchedPlaceholders.length === 1 ? '' : 's'} don&apos;t match a known step alias:{' '}
                        <Badge variant="outline" className="text-[10px]">{unmatchedPlaceholders.slice(0, 3).join(', ')}{unmatchedPlaceholders.length > 3 ? '…' : ''}</Badge>
                    </span>
                </div>
            )}
            <div className="flex-1 min-h-0">
                <MappingSidebar
                    selectedField={selectedField}
                    mapping={mapping}
                    setMapping={setMapping}
                    workflowVariables={workflowVariables}
                    fields={fields}
                    setSelectedField={setSelectedField}
                />
            </div>
        </div>
    );
}
