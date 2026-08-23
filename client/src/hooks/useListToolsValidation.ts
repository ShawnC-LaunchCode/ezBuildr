/**
 * Custom hook for validating List Tools configuration
 * Handles timing checks and column validation
 */

import { useMemo } from 'react';

import { useTableColumns } from '@/hooks/useTableColumns';
import type { ApiBlock } from '@/lib/vault-api';
import { useBlocks, usePages } from '@/lib/vault-hooks';

import type { ChoiceCardState } from './useChoiceConfig';

interface ValidationWarnings {
    timingWarning: string | null;
    labelColumnWarning: string | null;
    valueColumnWarning: string | null;
}

interface UseListToolsValidationParams {
    localConfig: ChoiceCardState | null;
    workflowId: string;
    pageId: string;
}

/**
 * Hook for validating List Tools configuration
 */
export function useListToolsValidation({
    localConfig,
    workflowId,
    pageId
}: UseListToolsValidationParams): ValidationWarnings & {
    sourceBlock: ApiBlock | null;
    sourceTableId: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: any[]; // useTableColumns likely returns any specifically or a complex type we'll genericize later
    loadingColumns: boolean;
    blocks: ApiBlock[];
} {
    const { data: blocks = [] } = useBlocks(workflowId);
    const { data: pages = [] } = usePages(workflowId);

    // Find the source block
    const sourceBlock = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!localConfig?.dynamicOptions.listVariable || !blocks || blocks.length === 0) {
            return null;
        }
        return blocks.find((b) =>
            b.config?.outputKey === localConfig.dynamicOptions.listVariable
        ) ?? null;
    }, [localConfig?.dynamicOptions.listVariable, blocks]);

    // Get table ID from source block
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const sourceTableId = useMemo(() => {
        if (!sourceBlock) {
            return null;
        }
        if (sourceBlock.type === 'read_table') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return sourceBlock.config?.tableId ?? null;
        }
        return null;
    }, [sourceBlock]);

    // Fetch columns
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const { data: columnsResponse, isLoading: loadingColumns } = useTableColumns(sourceTableId ?? undefined);
    const columns = Array.isArray(columnsResponse) ? columnsResponse : [];

    // Timing validation
    const timingWarning = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!sourceBlock || !pages || pages.length === 0) {
            return null;
        }

        const blockPhase = sourceBlock.phase;
        const stepPage = pages.find((s) => s.id === pageId);
        const blockPageId = sourceBlock.pageId;
        const blockPage = blockPageId
            ? pages.find((s) => s.id === blockPageId)
            : null;

        if (!stepPage) {
            return null;
        }

        // Safe phases
        if (blockPhase === 'onRunStart') {
            return null;
        }

        // Page-based checks
        if (blockPhase === 'onPageEnter') {
            if (!blockPage) {
                return null; // Assume safe if global
            }

            if (blockPage.order > stepPage.order) {
                return "Read block runs in a later page.";
            }
            return null;
        }

        if (blockPhase === 'onPageSubmit' || blockPhase === 'onNext') {
            if (!blockPage) {
                return "Block runs on submit but has no page?";
            }
            // Must be strictly previous page
            if (blockPage.order < stepPage.order) {
                return null;
            }
            return "Read block runs after the page is displayed (on Next/Submit).";
        }

        if (blockPhase === 'onRunComplete') {
            return "Read block runs at the end of the workflow.";
        }

        return null;
    }, [sourceBlock, pages, pageId]);

    // Label column validation
    const labelColumnWarning = useMemo(() => {
        const id = localConfig?.dynamicOptions?.labelPath;
        if (!id || !sourceTableId || columns.length === 0) {
            return null;
        }
        if (id.includes('.')) {
            return null; // Dot notation assumed valid
        }
        if (!columns.find((c: { id?: string; name?: string }) => c.id === id || c.name === id)) {
            return "Selected column not found in source table.";
        }
        return null;
    }, [localConfig?.dynamicOptions?.labelPath, columns, sourceTableId]);

    // Value column validation
    const valueColumnWarning = useMemo(() => {
        const id = localConfig?.dynamicOptions?.valuePath;
        if (!id || !sourceTableId || columns.length === 0) {
            return null;
        }
        if (id.includes('.')) {
            return null;
        }
        if (!columns.find((c: { id?: string; name?: string }) => c.id === id || c.name === id)) {
            return "Selected column not found in source table.";
        }
        return null;
    }, [localConfig?.dynamicOptions?.valuePath, columns, sourceTableId]);

    return {
        timingWarning,
        labelColumnWarning,
        valueColumnWarning,
        sourceBlock,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sourceTableId,
        columns,
        loadingColumns,
        blocks
    };
}
