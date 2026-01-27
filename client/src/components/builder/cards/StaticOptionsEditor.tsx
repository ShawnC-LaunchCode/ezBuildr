import React from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChoiceOption } from '@/../../shared/types/stepConfigs';

interface StaticOptionsEditorProps {
    options: ChoiceOption[];
    onUpdate: (index: number, field: keyof ChoiceOption, value: string) => void;
    onDelete: (index: number) => void;
    onAdd: () => void;
}

/**
 * Component for editing static choice options
 * Displays a list of options with label/alias inputs and delete buttons
 */
export function StaticOptionsEditor({ options, onUpdate, onDelete, onAdd }: StaticOptionsEditorProps) {
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                {options.map((option, index) => (
                    <div key={option.id} className="flex items-start gap-2 p-3 border rounded-md bg-background">
                        <div className="pt-2 cursor-grab">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 space-y-2">
                            <Input
                                value={option.label}
                                onChange={(e) => onUpdate(index, 'label', e.target.value)}
                                placeholder="Display Value"
                                className="text-sm"
                            />
                            <Input
                                value={option.alias || option.id}
                                onChange={(e) => onUpdate(index, 'alias', e.target.value)}
                                placeholder="Saved Value"
                                className="text-sm font-mono"
                            />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(index)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Option
            </Button>
        </div>
    );
}
