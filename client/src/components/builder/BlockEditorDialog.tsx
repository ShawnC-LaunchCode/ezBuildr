import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getAvailableBlockTypes, type Mode } from "@/lib/mode";
import { useCreateBlock, useUpdateBlock, useCreateTransformBlock, useUpdateTransformBlock } from "@/lib/vault-hooks";

import type { BlockPhase, WriteBlockConfig, ReadTableConfig, ExternalSendBlockConfig, ValidateConfig, QueryBlockConfig } from "@shared/types/blocks";

import { RegularBlockForm } from "./forms/RegularBlockForm";
import { TransformBlockForm } from "./forms/TransformBlockForm";

// UniversalBlock type definition (matching what was in BlocksPanel)
export type UniversalBlock = {
    id: string;
    type: string;
    phase: string;
    order: number;
    enabled: boolean;
    raw: Record<string, unknown> | null;
    source: 'regular' | 'transform';
    title?: string;
    displayType?: string;
};


export interface BlockFormData {
    phase: string;
    enabled: boolean;
    order: number | string;
    type: string;
    config: Record<string, unknown>;
    name: string;
    language: string;
    code: string;
    inputKeys: string[];
    outputKey: string;
    timeoutMs: number;
}

export function BlockEditorDialog({
    workflowId,
    block,
    mode,
    isOpen,
    onClose,
}: {
    workflowId: string;
    block: UniversalBlock | null;
    mode: Mode;
    isOpen: boolean;
    onClose: () => void;
}) {
    const createBlockMutation = useCreateBlock();
    const updateBlockMutation = useUpdateBlock();
    const createTransformMutation = useCreateTransformBlock();
    const updateTransformMutation = useUpdateTransformBlock();
    const { toast } = useToast();

    // Determine initial state
    // If block is null, we are creating. Default to 'regular'.
    const [creationMode, setCreationMode] = useState<'regular' | 'transform'>(block?.source || 'regular');

    const [formData, setFormData] = useState<BlockFormData>({
        // Common
        phase: block?.phase || "onRunStart",
        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,

        // Regular Block
        type: block?.source === 'regular' ? block.type : 'write', // Default to write for new blocks
        config: (block?.raw?.config as Record<string, unknown>) || ({} as Record<string, unknown>),

        // Transform Block
        name: (block?.raw?.name as string) ?? "",
        language: (block?.raw?.language as string) || "javascript",
        code: (block?.raw?.code as string) ?? "",
        inputKeys: (block?.raw?.inputKeys as string[]) ?? [],
        outputKey: (block?.raw?.outputKey as string) ?? "",
        timeoutMs: (block?.raw?.timeoutMs as number) || 1000,
    });

    useEffect(() => {
        if (isOpen) {
            const source = block?.source || 'regular';
            setCreationMode(source);

            // Determine block type correctly
            // If block exists, use its type. 
            // If it's a new block (block is null), DO NOT overwrite the type set by useState unless we want to reset it?
            // Actually, for new blocks, useState sets the default. We should only override if block exists.
            let blockType = formData.type; // Keep existing defaults for new blocks

            if (block) {
                // MIGRATION: Auto-fix legacy blocks with wrong type
                blockType = source === 'regular' ? block.type : 'write';
                if (source === 'regular') {
                    // Normalize send_table to write for routing
                    if (blockType === 'send_table') {
                        blockType = 'write';
                    }
                }
            }

            const isReadTable = blockType === 'read_table';
            const isWriteBlock = blockType === 'write' || blockType === 'send_table';

            setFormData({
                phase: block?.phase || (isReadTable ? "onSectionEnter" : isWriteBlock ? "onSectionSubmit" : "onRunStart"),
                enabled: block?.enabled ?? true,
                order: block?.order ?? 0,
                type: blockType, // Use derived type
                config: (block?.raw?.config as Record<string, unknown>) || ({} as Record<string, unknown>),
                name: (block?.raw?.name as string) ?? "",
                language: (block?.raw?.language as string) || "javascript",
                code: (block?.raw?.code as string) ?? "",
                inputKeys: (block?.raw?.inputKeys as string[]) ?? [],
                outputKey: (block?.raw?.outputKey as string) ?? "",
                timeoutMs: (block?.raw?.timeoutMs as number) || 1000,
            });
        }
    }, [isOpen, block]);

    const handleSave = async () => {
        try {
            if (creationMode === 'regular') {
                const data = {
                    type: formData.type,
                    phase: formData.phase,
                    config: formData.config,
                    enabled: formData.enabled === undefined ? true : formData.enabled,
                    order: Number(formData.order) || 0,
                    // Preserve existing sectionId if updating, otherwise null (or handled by caller for create)
                    sectionId: (block?.raw?.sectionId as string | null) ?? null
                };

                if (block && block.source === 'regular') {
                    await updateBlockMutation.mutateAsync({
                        id: block.id,
                        workflowId,
                        ...data,
                        type: data.type as any,
                        phase: data.phase as any,
                        sectionId: (block?.raw?.sectionId as string | null) ?? null
                    });
                } else {
                    await createBlockMutation.mutateAsync({
                        workflowId,
                        ...data,
                        type: data.type as any,
                        phase: data.phase as any,
                        sectionId: (block?.raw?.sectionId as string | null) ?? null
                    });
                }
            } else {
                // Transform
                const data = {
                    name: formData.name,
                    language: formData.language,
                    phase: formData.phase,
                    code: formData.code,
                    inputKeys: formData.inputKeys,
                    outputKey: formData.outputKey,
                    timeoutMs: formData.timeoutMs,
                    enabled: formData.enabled === undefined ? true : formData.enabled,
                    order: Number(formData.order) || 0,
                    // Preserve existing sectionId for transforms too
                    sectionId: (block?.raw?.sectionId as string | null) ?? null
                };

                if (block && block.source === 'transform') {
                    await updateTransformMutation.mutateAsync({
                        id: block.id,
                        workflowId,
                        ...data,
                        language: data.language as any,
                        phase: data.phase as any
                    });
                } else {
                    await createTransformMutation.mutateAsync({
                        workflowId,
                        ...data,
                        language: data.language as any,
                        phase: data.phase as any
                    });
                }
            }

            toast({ title: "Success", description: "Block saved successfully." });
            onClose();
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to save block.", variant: "destructive" });
        }
    };

    const availableBlockTypes = getAvailableBlockTypes(mode);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {block ? (
                            // Use block.type for title (direct from database, not formData)
                            (block.type === 'write' || block.type === 'send_table') ? 'Send Data to Table' :
                                block.type === 'read_table' ? 'Read from Table' :
                                    block.type === 'external_send' ? 'Send Data to API' :
                                        block.type === 'list_tools' ? 'List Tools' :
                                            block.type === 'query' ? 'Query Data' :
                                                block.type === 'validate' ? 'Validate' :
                                                    block.type === 'js' ? 'JS Transform' :
                                                        `Edit ${block.title || block.type}`
                        ) : "Add New Block"}
                    </DialogTitle>
                    <DialogDescription>
                        {creationMode === 'regular' ? "Configure a standard workflow block." : "Configure a custom code transformation."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {/* Top Controls: Type Selection (Only if creating new) */}
                    {!block && (
                        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
                            <Label>Block Category:</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant={creationMode === 'regular' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => { void setCreationMode('regular'); }}
                                >
                                    Standard Block
                                </Button>
                                <Button
                                    variant={creationMode === 'transform' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => { void setCreationMode('transform'); }}
                                    disabled={mode === 'easy'}
                                >
                                    Code Transform
                                </Button>
                            </div>
                            {mode === 'easy' && creationMode === 'regular' && (
                                <span className="text-xs text-muted-foreground ml-2">Code transforms are an Advanced Mode feature.</span>
                            )}
                        </div>
                    )}

                    {/* Configuration Form */}
                    {creationMode === 'regular' ? (
                        <RegularBlockForm
                            formData={formData}
                            setFormData={setFormData}
                            mode={mode}
                            block={block}
                            workflowId={workflowId}
                        />
                    ) : (
                        <TransformBlockForm
                            formData={formData}
                            setFormData={setFormData}
                            workflowId={workflowId}
                        />
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => { void onClose(); }}>Cancel</Button>
                    <Button onClick={() => { void handleSave(); }}>Save Block</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
