import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import type { UniversalBlock } from "@/components/builder/BlockEditorDialog";
import { useToast } from "@/hooks/use-toast";
import { blockAPI } from "@/lib/vault-api";

import type { ChoiceAdvancedConfig, DynamicOptionsConfig } from "@/../../shared/types/stepConfigs";

interface UseListToolsActionsProps {
    workflowId: string;
    stepId: string;
    sectionId: string;
    localConfig: ChoiceAdvancedConfig | any; // Use specific type if possible
    onUpdate: (updates: Partial<ChoiceAdvancedConfig>) => void;
    blocks?: any[]; // ApiBlock[]
}

export function useListToolsActions({
    workflowId,
    stepId,
    sectionId,
    localConfig,
    onUpdate,
    blocks
}: UseListToolsActionsProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Loading state
    const [isCreatingListTools, setIsCreatingListTools] = useState(false);

    // Block Editor Dialog state
    const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
    const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);

    // Unlink Confirmation Dialog state
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    const [unlinkMode, setUnlinkMode] = useState<"keep" | "remove">("keep");

    // Replace Confirmation Dialog state
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
    const [replaceMode, setReplaceMode] = useState<"migrate" | "reset">("migrate");

    // Link resolution
    const linkedBlock = useMemo(() => {
        if (!localConfig?.dynamicOptions?.linkedListToolsBlockId || !blocks) { return null; }
        return blocks.find((b: any) => b.id === localConfig.dynamicOptions!.linkedListToolsBlockId);
    }, [localConfig?.dynamicOptions?.linkedListToolsBlockId, blocks]);

    // Actions
    const handleCreateListTools = async () => {
        if (!localConfig?.dynamicOptions?.listVariable) {
            toast({
                title: "Error",
                description: "Please select a list variable first",
                variant: "destructive"
            });
            return;
        }

        setIsCreatingListTools(true);
        try {
            const result = await blockAPI.createListToolsFromChoice(workflowId, stepId, {
                sourceListVar: localConfig.dynamicOptions.listVariable,
                transformConfig: localConfig.dynamicOptions.transform,
                sectionId: sectionId
            });

            // Update the question config to link to the new block
            const newDynamic: DynamicOptionsConfig = {
                ...localConfig.dynamicOptions,
                type: 'list', // Ensure type discriminant
                linkedListToolsBlockId: result.block.id,
                baseListVar: localConfig.dynamicOptions.listVariable,
                listVariable: result.outputVar,
                transform: undefined // Clear transform since it's now in the block
            };

            onUpdate({ dynamicOptions: newDynamic });

            // Invalidate blocks query to refresh the list
            queryClient.invalidateQueries({ queryKey: ['blocks', workflowId] });

            toast({
                title: "Success",
                description: `Created List Tools block: ${result.outputVar}`,
            });

            // Auto-open the block editor
            const universalBlock: UniversalBlock = {
                id: result.block.id,
                type: result.block.type,
                phase: result.block.phase || 'onRunStart',
                order: result.block.order || 0,
                enabled: result.block.enabled ?? true,
                raw: result.block,
                source: 'regular',
                title: result.outputVar,
                displayType: 'list_tools'
            };

            setEditingBlock(universalBlock);
            setIsBlockEditorOpen(true);
        } catch (error) {
            console.error("Error creating List Tools block:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create List Tools block",
                variant: "destructive"
            });
        } finally {
            setIsCreatingListTools(false);
        }
    };

    const handleUnlinkListTools = () => {
        setShowUnlinkConfirm(true);
    };

    const confirmUnlinkListTools = () => {
        if (!localConfig?.dynamicOptions?.baseListVar) {
            toast({
                title: "Error",
                description: "No base list variable found",
                variant: "destructive"
            });
            setShowUnlinkConfirm(false);
            return;
        }

        let transform = undefined;

        if (unlinkMode === 'keep') {
            // Attempt to migrate transforms back
            if ((linkedBlock)?.config) {
                const blockConfig = (linkedBlock).config;
                transform = {
                    filters: blockConfig.filters,
                    sort: blockConfig.sort,
                    limit: blockConfig.limit,
                    offset: blockConfig.offset,
                    dedupe: blockConfig.dedupe,
                    select: blockConfig.select
                };
            } else {
                toast({
                    title: "Warning",
                    description: "Linked block not found. Transforms could not be preserved.",
                    variant: "destructive"
                });
            }
        }

        const newDynamic: DynamicOptionsConfig = {
            ...localConfig.dynamicOptions,
            type: 'list',
            linkedListToolsBlockId: undefined,
            listVariable: localConfig.dynamicOptions.baseListVar,
            baseListVar: undefined,
            transform: transform
        };

        onUpdate({ dynamicOptions: newDynamic });

        toast({
            title: "Unlinked",
            description: unlinkMode === 'keep'
                ? "List Tools block unlinked. Transforms have been copied to this question."
                : "List Tools block unlinked. Transforms have been removed.",
        });

        setShowUnlinkConfirm(false);
    };

    const handleReplaceListTools = () => {
        setShowReplaceConfirm(true);
    };

    const confirmReplaceListTools = async () => {
        if (!localConfig?.dynamicOptions?.baseListVar) {
            toast({
                title: "Error",
                description: "No base list variable found",
                variant: "destructive"
            });
            setShowReplaceConfirm(false);
            return;
        }

        setIsCreatingListTools(true);
        try {
            // Determine transform config for new block
            let transformConfig = undefined;
            if (replaceMode === 'migrate' && (linkedBlock)?.config) {
                transformConfig = {
                    filters: (linkedBlock).config.filters,
                    sort: (linkedBlock).config.sort,
                    limit: (linkedBlock).config.limit,
                    offset: (linkedBlock).config.offset,
                    dedupe: (linkedBlock).config.dedupe,
                    select: (linkedBlock).config.select
                };
            }

            const result = await blockAPI.createListToolsFromChoice(workflowId, stepId, {
                sourceListVar: localConfig.dynamicOptions.baseListVar,
                transformConfig: transformConfig,
                sectionId: sectionId
            });

            const newDynamic: DynamicOptionsConfig = {
                ...localConfig.dynamicOptions,
                type: 'list',
                linkedListToolsBlockId: result.block.id,
                listVariable: result.outputVar,
                baseListVar: localConfig.dynamicOptions.baseListVar, // Preserve
                transform: undefined
            };

            onUpdate({ dynamicOptions: newDynamic });

            queryClient.invalidateQueries({ queryKey: ['blocks', workflowId] });

            toast({
                title: "Success",
                description: replaceMode === 'migrate'
                    ? `Replaced List Tools block (transforms maintained): ${result.outputVar}`
                    : `Replaced List Tools block (fresh start): ${result.outputVar}`,
            });

            const universalBlock: UniversalBlock = {
                id: result.block.id,
                type: result.block.type,
                phase: result.block.phase || 'onRunStart',
                order: result.block.order || 0,
                enabled: result.block.enabled ?? true,
                raw: result.block,
                source: 'regular',
                title: result.outputVar,
                displayType: 'list_tools'
            };

            setEditingBlock(universalBlock);
            setIsBlockEditorOpen(true);

        } catch (error) {
            console.error("Error replacing List Tools block:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to replace List Tools block",
                variant: "destructive"
            });
        } finally {
            setIsCreatingListTools(false);
            setShowReplaceConfirm(false);
        }
    };

    const handleOpenLinkedBlock = () => {
        if (!linkedBlock) {
            toast({
                title: "Error",
                description: "Linked block not found",
                variant: "destructive"
            });
            return;
        }

        const universalBlock: UniversalBlock = {
            id: (linkedBlock).id,
            type: (linkedBlock).type,
            phase: (linkedBlock).phase || 'onRunStart',
            order: (linkedBlock).order || 0,
            enabled: (linkedBlock).enabled ?? true,
            raw: linkedBlock,
            source: 'regular',
            title: (linkedBlock).config?.outputListVar || (linkedBlock).config?.outputKey || 'List Tools',
            displayType: 'list_tools'
        };

        setEditingBlock(universalBlock);
        setIsBlockEditorOpen(true);
    };

    const handleCloseBlockEditor = () => {
        setIsBlockEditorOpen(false);
        setEditingBlock(null);
        queryClient.invalidateQueries({ queryKey: ['workflows', workflowId, 'blocks'] });
    };

    return {
        isCreatingListTools,
        isBlockEditorOpen,
        editingBlock,
        showUnlinkConfirm,
        setShowUnlinkConfirm,
        unlinkMode,
        setUnlinkMode,
        showReplaceConfirm,
        setShowReplaceConfirm,
        replaceMode,
        setReplaceMode,
        handleCreateListTools,
        handleUnlinkListTools,
        confirmUnlinkListTools,
        handleReplaceListTools,
        confirmReplaceListTools,
        handleOpenLinkedBlock,
        handleCloseBlockEditor,
        linkedBlock
    };
}
