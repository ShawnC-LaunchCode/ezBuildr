import { useState, useEffect } from "react";

import { useToast } from "@/hooks/use-toast";
import { useCreateBlock, useUpdateBlock } from "@/lib/vault-hooks";

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
    title?: string;
    displayType?: string;
};

export interface BlockFormData {
    phase: string;
    enabled: boolean;
    order: number | string;
    type: string;
    config: Record<string, unknown>;
}

export function getTitleForBlock(block: UniversalBlock | null): string {
    if (!block) { return "Add New Block"; }

    if (block.type === 'write' || block.type === 'send_table') { return 'Send Data to Table'; }
    if (block.type === 'read_table') { return 'Read from Table'; }
    if (block.type === 'external_send') { return 'Send Data to API'; }
    if (block.type === 'list_tools') { return 'List Tools'; }
    if (block.type === 'query') { return 'Query Data'; }
    if (block.type === 'validate') { return 'Validate'; }

    return `Edit ${block.title ?? block.type}`;
}


function getDefaultPhase(blockType: string): BlockPhase {
    const isReadTable = blockType === 'read_table';
    const isWriteBlock = blockType === 'write' || blockType === 'send_table';
    return isReadTable ? "onPageEnter" : isWriteBlock ? "onPageSubmit" : "onRunStart";
}

function getInitialFormData(block: UniversalBlock | null): BlockFormData {
    let blockType = block?.type ?? 'write';
    // MIGRATION: Auto-fix legacy blocks with wrong type
    if (block) {
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
    };
}

export function useBlockEditorState(block: UniversalBlock | null, isOpen: boolean): {
    formData: BlockFormData;
    setFormData: React.Dispatch<React.SetStateAction<BlockFormData>>;
} {
    // Initial state based on block prop, but useEffect will sync it when isOpen changes
    const [formData, setFormData] = useState<BlockFormData>(() => getInitialFormData(block));

    useEffect(() => {
        if (isOpen) {
            setFormData(getInitialFormData(block));
        }
    }, [isOpen, block]);

    return {
        formData,
        setFormData
    };
}

export function useBlockSave(
    workflowId: string,
    block: UniversalBlock | null,
    onClose: () => void
): { handleSave: (formData: BlockFormData) => Promise<void> } {
    const createBlockMutation = useCreateBlock();
    const updateBlockMutation = useUpdateBlock();
    const { toast } = useToast();

    const handleSave = async (formData: BlockFormData): Promise<void> => {
        try {
            const orderNum = Number(formData.order);
            const order = isNaN(orderNum) ? 0 : orderNum;

            const data = {
                type: formData.type,
                phase: formData.phase,
                config: formData.config,
                enabled: formData.enabled,
                order,

                pageId: (block?.raw?.pageId as string | null) ?? null
            };

            if (block) {
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

            toast({ title: "Success", description: "Block saved successfully." });
            onClose();
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to save block.", variant: "destructive" });
        }
    };

    return { handleSave };
}
