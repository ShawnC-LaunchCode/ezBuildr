import { ExternalLink, Edit, Unlink, RefreshCw , AlertCircle } from 'lucide-react';
import React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


import type { DynamicOptionsConfig } from '@/../../shared/types/stepConfigs';

interface DynamicOptionsEditorProps {
    config: Extract<DynamicOptionsConfig, { type: 'list' }>;
    listVariables: Array<{ alias?: string | null; type: string }>;
    sourceBlock: any;
    sourceTableId: string | null;
    columns: any[];
    loadingColumns: boolean;
    timingWarning: string | null;
    labelColumnWarning: string | null;
    valueColumnWarning: string | null;
    onUpdate: (updates: Partial<Extract<DynamicOptionsConfig, { type: 'list' }>>) => void;
    onCreateListTools: () => void;
    onEditBlock: (block: any) => void;
    onUnlinkBlock: () => void;
    onReplaceBlock: () => void;
}

/**
 * Component for editing dynamic choice options from a table/list
 * Displays list variable selection, column mapping, and List Tools management
 */
export function DynamicOptionsEditor({
    config,
    listVariables,
    sourceBlock,
    sourceTableId,
    columns,
    loadingColumns,
    timingWarning,
    labelColumnWarning,
    valueColumnWarning,
    onUpdate,
    onCreateListTools,
    onEditBlock,
    onUnlinkBlock,
    onReplaceBlock
}: DynamicOptionsEditorProps) {
    return (
        <div className="p-3 bg-background border rounded-md space-y-4">
            {/* List Variable Selection */}
            <div className="space-y-1.5">
                <Label className="text-xs">List Variable (from Read Block)</Label>
                <Select
                    value={config.listVariable}
                    onValueChange={(val) => {
                        onUpdate({ listVariable: val, labelPath: '', valuePath: '' });
                    }}
                >
                    <SelectTrigger><SelectValue placeholder="Select a list variable..." /></SelectTrigger>
                    <SelectContent>
                        {listVariables.length === 0 ? (
                            <div className="p-2 text-xs text-muted-foreground text-center">
                                No list variables found. Add a Read Table block first.
                            </div>
                        ) : (
                            listVariables.map(v => (
                                <SelectItem key={v.alias} value={v.alias || ''} className="flex items-center">
                                    <span className="font-mono">{v.alias}</span>
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Timing Warning */}
            {timingWarning && (
                <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{timingWarning}</AlertDescription>
                </Alert>
            )}

            {/* List Tools Management */}
            {config.listVariable && sourceBlock && (
                <div className="space-y-2 p-2 bg-muted/30 rounded border">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">List Tools Block</span>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => onEditBlock(sourceBlock)}
                            >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={onUnlinkBlock}
                            >
                                <Unlink className="h-3 w-3 mr-1" />
                                Unlink
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={onReplaceBlock}
                            >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Replace
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create List Tools Button */}
            {config.listVariable && !sourceBlock && (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onCreateListTools}
                >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Create List Tools Block
                </Button>
            )}

            {/* Column Selection */}
            {sourceTableId && (
                <>
                    {/* Label Column */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Label Column (Display)</Label>
                        <Select
                            value={config.labelPath}
                            onValueChange={(val) => onUpdate({ labelPath: val })}
                            disabled={!sourceTableId || loadingColumns}
                        >
                            <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
                            <SelectContent>
                                {loadingColumns ? (
                                    <div className="p-2 text-xs text-muted-foreground text-center">Loading columns...</div>
                                ) : columns.length === 0 ? (
                                    <div className="p-2 text-xs text-muted-foreground text-center">No columns found</div>
                                ) : (
                                    columns.map((col: any) => (
                                        <SelectItem key={col.id || col.name} value={col.id || col.name}>
                                            {col.name || col.id}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        {labelColumnWarning && (
                            <p className="text-[10px] text-destructive">{labelColumnWarning}</p>
                        )}
                    </div>

                    {/* Value Column */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Value Column (Saved)</Label>
                        <Select
                            value={config.valuePath}
                            onValueChange={(val) => onUpdate({ valuePath: val })}
                            disabled={!sourceTableId || loadingColumns}
                        >
                            <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
                            <SelectContent>
                                {loadingColumns ? (
                                    <div className="p-2 text-xs text-muted-foreground text-center">Loading columns...</div>
                                ) : columns.length === 0 ? (
                                    <div className="p-2 text-xs text-muted-foreground text-center">No columns found</div>
                                ) : (
                                    columns.map((col: any) => (
                                        <SelectItem key={col.id || col.name} value={col.id || col.name}>
                                            {col.name || col.id}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        {valueColumnWarning && (
                            <p className="text-[10px] text-destructive">{valueColumnWarning}</p>
                        )}
                    </div>

                    {/* Label Template */}
                    <div className="space-y-1.5">
                        <Label className="text-xs">Label Template (Optional)</Label>
                        <Input
                            placeholder="{FirstName} {LastName}"
                            value={config.labelTemplate || ''}
                            onChange={(e) => onUpdate({ labelTemplate: e.target.value })}
                            className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Use column names in braces to combine fields.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
