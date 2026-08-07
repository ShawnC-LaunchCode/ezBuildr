import { ScrollArea } from '@/components/ui/scroll-area';

import { MappingBindingEditor } from './MappingBindingEditor';
import { type MappableField, type WorkflowVariable } from './PdfMappingEditor.types';

import type { DocumentFieldMapping } from '@shared/types/documentMapping';

interface MappingSidebarProps {
    selectedField: string | null;
    mapping: DocumentFieldMapping;
    setMapping: (mapping: DocumentFieldMapping | ((prev: DocumentFieldMapping) => DocumentFieldMapping)) => void;
    workflowVariables: WorkflowVariable[];
    fields: MappableField[];
    setSelectedField: (field: string | null) => void;
}

/**
 * Field list + selection shell around `MappingBindingEditor`. Shared by the
 * PDF form-field mapper and the DOCX placeholder panel — both just supply a
 * different `fields` list (PDF form fields vs. extracted `{{placeholder}}`
 * names) and this renders the same binding UI for whichever field is
 * selected.
 */
export function MappingSidebar({
    selectedField,
    mapping,
    setMapping,
    workflowVariables,
    fields,
    setSelectedField
}: MappingSidebarProps) {
    return (
        <div className="w-80 h-full border-l bg-background flex flex-col">
            <div className="p-4 border-b bg-muted/40">
                <h3 className="font-semibold text-sm">Field Properties</h3>
            </div>
            {selectedField ? (
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Field Name</label>
                        <div className="text-sm font-mono bg-muted p-2 rounded break-all">
                            {selectedField}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Value Mapping</label>
                        <MappingBindingEditor
                            binding={mapping[selectedField]}
                            onChange={(binding) => {
                                setMapping(prev => {
                                    const next = { ...prev };
                                    if (binding === undefined) {
                                        delete next[selectedField];
                                    } else {
                                        next[selectedField] = binding;
                                    }
                                    return next;
                                });
                            }}
                            workflowVariables={workflowVariables}
                        />
                    </div>
                </div>
            ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                    Select a field to map it to a workflow variable, DataVault value, or formula.
                </div>
            )}
            <div className="mt-auto border-t">
                <div className="p-2 bg-muted/40 text-xs font-medium text-muted-foreground border-b px-4">
                    All Fields
                </div>
                <ScrollArea className="h-64">
                    <div className="p-0">
                        {fields.map(f => (
                            <div
                                key={f.name}
                                className={`px-4 py-2 text-sm border-b cursor-pointer hover:bg-muted/50 ${selectedField === f.name ? 'bg-primary/10' : ''}`}
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
                                    {mapping[f.name] !== undefined && <span className="w-2 h-2 rounded-full bg-yellow-500" title="Mapped" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
