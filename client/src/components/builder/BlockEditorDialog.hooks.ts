import { useState, useEffect } from "react";

import { useToast } from "@/hooks/use-toast";
import { useCreateBlock, useUpdateBlock, useCreateTransformBlock, useUpdateTransformBlock } from "@/lib/vault-hooks";

import type { BlockKind, BlockPhase } from "@shared/types/blocks";

type BlockType = BlockKind["type"];

// UniversalBlock type definition
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

export function getTitleForBlock(block: UniversalBlock | null): string {
    if (!block) { return "Add New Block"; }

    if (block.type === 'write' || block.type === 'send_table') { return 'Send Data to Table'; }
    if (block.type === 'read_table') { return 'Read from Table'; }
    if (block.type === 'external_send') { return 'Send Data to API'; }
    if (block.type === 'list_tools') { return 'List Tools'; }
    if (block.type === 'query') { return 'Query Data'; }
    if (block.type === 'validate') { return 'Validate'; }
    if (block.type === 'js') { return 'JS Transform'; }

    return `Edit ${block.title ?? block.type}`;
}


function getDefaultPhase(blockType: string): BlockPhase {
    const isReadTable = blockType === 'read_table';
    const isWriteBlock = blockType === 'write' || blockType === 'send_table';
    return isReadTable ? "onPageEnter" : isWriteBlock ? "onPageSubmit" : "onRunStart";
}

function getInitialFormData(block: UniversalBlock | null, source: 'regular' | 'transform'): BlockFormData {
    let blockType = block?.source === 'regular' ? block.type : 'write';
    // MIGRATION: Auto-fix legacy blocks with wrong type
    if (block && source === 'regular') {
        blockType = block.type;
        if (blockType === 'send_table') {
            blockType = 'write';
        }
    }

    const phase = block?.phase ?? getDefaultPhase(blockType);

    return {
        // Common
        phase,

        enabled: block?.enabled ?? true,
        order: block?.order ?? 0,

        // Regular
        type: blockType,
        config: (block?.raw?.config as Record<string, unknown>) ?? {},

        // Transform
        name: (block?.raw?.name as string) ?? "",
        language: (block?.raw?.language as string) ?? "javascript",
        code: (block?.raw?.code as string) ?? "",
        inputKeys: (block?.raw?.inputKeys as string[]) ?? [],
        outputKey: (block?.raw?.outputKey as string) ?? "",
        timeoutMs: (block?.raw?.timeoutMs as number) ?? 1000,
    };
}

export function useBlockEditorState(block: UniversalBlock | null, isOpen: boolean): {
    creationMode: 'regular' | 'transform';
    setCreationMode: (mode: 'regular' | 'transform') => void;
    formData: BlockFormData;
    setFormData: React.Dispatch<React.SetStateAction<BlockFormData>>;
} {
    const [creationMode, setCreationMode] = useState<'regular' | 'transform'>(block?.source ?? 'regular');

    // Initial state based on block prop, but useEffect will sync it when isOpen changes
    const [formData, setFormData] = useState<BlockFormData>(() => getInitialFormData(block, block?.source ?? 'regular'));

    useEffect(() => {
        if (isOpen) {
            const source = block?.source ?? 'regular';
            setCreationMode(source);
            setFormData(getInitialFormData(block, source));
        }
    }, [isOpen, block]);

    return {
        creationMode,
        setCreationMode,
        formData,
        setFormData
    };
}

export function useBlockSave(
    workflowId: string,
    block: UniversalBlock | null,
    onClose: () => void
): { handleSave: (creationMode: 'regular' | 'transform', formData: BlockFormData) => Promise<void> } {
    const createBlockMutation = useCreateBlock();
    const updateBlockMutation = useUpdateBlock();
    const createTransformMutation = useCreateTransformBlock();
    const updateTransformMutation = useUpdateTransformBlock();
    const { toast } = useToast();

    const handleSave = async (creationMode: 'regular' | 'transform', formData: BlockFormData): Promise<void> => {
        try {
            const orderNum = Number(formData.order);
            const order = isNaN(orderNum) ? 0 : orderNum;

            if (creationMode === 'regular') {
                const data = {
                    type: formData.type,
                    phase: formData.phase,
                    config: formData.config,
                    enabled: formData.enabled,
                    order,

                    pageId: (block?.raw?.pageId as string | null) ?? null
                };

                if (block && block.source === 'regular') {
                    await updateBlockMutation.mutateAsync({
                        id: block.id,
                        workflowId,
                        ...data,
                        type: data.type as BlockType,
                        phase: data.phase as BlockPhase,

                        pageId: data.pageId
                    });
                } else {
                    await createBlockMutation.mutateAsync({
                        workflowId,
                        ...data,
                        type: data.type as BlockType,
                        phase: data.phase as BlockPhase,

                        pageId: data.pageId
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
                    enabled: formData.enabled,
                    order,

                    pageId: (block?.raw?.pageId as string | null) ?? null
                };

                if (block && block.source === 'transform') {
                    await updateTransformMutation.mutateAsync({
                        id: block.id,
                        workflowId,
                        ...data,
                        language: data.language as "javascript" | "python",
                        phase: data.phase as BlockPhase
                    });
                } else {
                    await createTransformMutation.mutateAsync({
                        workflowId,
                        ...data,
                        language: data.language as "javascript" | "python",
                        phase: data.phase as BlockPhase
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

    return { handleSave };
}
