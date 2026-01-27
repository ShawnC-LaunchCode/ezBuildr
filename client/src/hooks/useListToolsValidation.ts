/**
 * Custom hook for validating List Tools configuration
 * Handles timing checks and column validation
 */

import { useMemo } from 'react';

import { useTableColumns } from '@/hooks/useTableColumns';
import { useBlocks, useSections } from '@/lib/vault-hooks';

import type { ChoiceCardState } from './useChoiceConfig';

interface ValidationWarnings {
    timingWarning: string | null;
    labelColumnWarning: string | null;
    valueColumnWarning: string | null;
}

interface UseListToolsValidationParams {
    localConfig: ChoiceCardState | null;
    workflowId: string;
    sectionId: string;
}

/**
 * Hook for validating List Tools configuration
 */
export function useListToolsValidation({
    localConfig,
    workflowId,
    sectionId
}: UseListToolsValidationParams): ValidationWarnings & {
    sourceBlock: unknown | null;
    sourceTableId: string | null;
    columns: unknown[];
    loadingColumns: boolean;
    blocks: unknown[];
} {
    const { data: blocks = [] } = useBlocks(workflowId);
    const { data: sections = [] } = useSections(workflowId);

    // Find the source block
    const sourceBlock = useMemo(() => {
        if (!localConfig?.dynamicOptions.listVariable || !blocks || blocks.length === 0) {
            return null;
        }
        return blocks.find((b: { config?: { outputKey?: string } }) =>
            b.config?.outputKey === localConfig.dynamicOptions.listVariable
        );
    }, [localConfig?.dynamicOptions.listVariable, blocks]);

    // Get table ID from source block
    const sourceTableId = useMemo(() => {
        if (!sourceBlock) {
            return null;
        }
        if ((sourceBlock as { type?: string }).type === 'read_table') {
            return (sourceBlock as { config?: { tableId?: string } }).config?.tableId || null;
        }
        return null;
    }, [sourceBlock]);

    // Fetch columns
    const { data: columnsResponse, isLoading: loadingColumns } = useTableColumns(sourceTableId ?? undefined);
    const columns = Array.isArray(columnsResponse) ? columnsResponse : [];

    // Timing validation
    const timingWarning = useMemo(() => {
        if (!sourceBlock || !sections || sections.length === 0) {
            return null;
        }

        const blockPhase = (sourceBlock as { phase?: string }).phase;
        const stepSection = sections.find((s: { id: string }) => s.id === sectionId);
        const blockSectionId = (sourceBlock as { sectionId?: string }).sectionId;
        const blockSection = blockSectionId
            ? sections.find((s: { id: string }) => s.id === blockSectionId)
            : null;

        if (!stepSection) {
            return null;
        }

        // Safe phases
        if (blockPhase === 'onRunStart') {
            return null;
        }

        // Section-based checks
        if (blockPhase === 'onSectionEnter') {
            if (!blockSection) {
                return null; // Assume safe if global
            }

            if ((blockSection as { order: number }).order > (stepSection as { order: number }).order) {
                return "Read block runs in a later section.";
            }
            return null;
        }

        if (blockPhase === 'onSectionSubmit' || blockPhase === 'onNext') {
            if (!blockSection) {
                return "Block runs on submit but has no section?";
            }
            // Must be strictly previous section
            if ((blockSection as { order: number }).order < (stepSection as { order: number }).order) {
                return null;
            }
            return "Read block runs after the page is displayed (on Next/Submit).";
        }

        if (blockPhase === 'onRunComplete') {
            return "Read block runs at the end of the workflow.";
        }

        return null;
    }, [sourceBlock, sections, sectionId]);

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
        sourceTableId,
        columns,
        loadingColumns,
        blocks
    };
}
