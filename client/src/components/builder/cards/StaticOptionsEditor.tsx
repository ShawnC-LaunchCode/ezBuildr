import { GripVertical, Trash2, Plus, Link, Unlink } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { ChoiceOption } from '@shared/types/stepConfigs';

interface StaticOptionsEditorProps {
    options: ChoiceOption[];
    onUpdate: (index: number, updates: Partial<ChoiceOption>) => void;
    onDelete: (index: number) => void;
    onAdd: () => void;
    duplicateAliases?: Set<string>;
}

/**
 * Component for editing static choice options
 * Displays a list of options with label/alias inputs and delete buttons
 */
export function StaticOptionsEditor({ options, onUpdate, onDelete, onAdd, duplicateAliases = new Set() }: StaticOptionsEditorProps): JSX.Element {
    const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});

    const isOverridden = (option: ChoiceOption) => {
        if (manualOverrides[option.id] !== undefined) {
            return manualOverrides[option.id];
        }
        return option.alias !== option.label;
    };

    const handleLabelChange = (index: number, option: ChoiceOption, newLabel: string) => {
        const updates: Partial<ChoiceOption> = { label: newLabel };
        if (!isOverridden(option)) {
            updates.alias = newLabel;
        }
        onUpdate(index, updates);
    };

    const handleAliasChange = (index: number, option: ChoiceOption, newAlias: string) => {
        setManualOverrides(prev => ({ ...prev, [option.id]: true }));
        onUpdate(index, { alias: newAlias });
    };

    const toggleLink = (index: number, option: ChoiceOption) => {
        const isNowOverridden = !isOverridden(option);
        setManualOverrides(prev => ({ ...prev, [option.id]: isNowOverridden }));
        if (!isNowOverridden) {
            onUpdate(index, { alias: option.label });
        }
    };

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                {options.map((option, index) => {
                    const currentAlias = option.alias ?? option.id;
                    const isDuplicate = duplicateAliases.has(currentAlias);
                    const isLinked = !isOverridden(option);
                    
                    return (
                        <div key={option.id} className="flex items-start gap-2 p-3 border rounded-md bg-background">
                            <div className="pt-2 cursor-grab">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <Input
                                    value={option.label}
                                    onChange={(e) => handleLabelChange(index, option, e.target.value)}
                                    placeholder="Display Value"
                                    className="text-sm"
                                />
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            value={currentAlias}
                                            onChange={(e) => handleAliasChange(index, option, e.target.value)}
                                            placeholder="Saved Value"
                                            className={`text-sm font-mono pr-8 ${isDuplicate ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-0 top-0 h-full px-2 text-muted-foreground hover:text-foreground"
                                            onClick={() => toggleLink(index, option)}
                                            title={isLinked ? "Unlink from Display Value" : "Link to Display Value"}
                                        >
                                            {isLinked ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4 opacity-50" />}
                                        </Button>
                                    </div>
                                    {isDuplicate && (
                                        <span className="text-xs text-destructive whitespace-nowrap">Duplicate</span>
                                    )}
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => onDelete(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Option
            </Button>
        </div>
    );
}
