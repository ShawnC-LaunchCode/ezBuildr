/**
 * Custom hook for validating List Tools configuration
 * Handles timing checks and column validation
 */

import { useMemo } from 'react';

import { useTableColumns } from '@/hooks/useTableColumns';
import type { ApiBlock, _ApiSection, _ApiCollectionField } from '@/lib/vault-api';
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
    sourceBlock: ApiBlock | null;
    sourceTableId: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: any[]; // useTableColumns likely returns any specifically or a complex type we'll genericize later
    loadingColumns: boolean;
    blocks: ApiBlock[];
} {
    const { data: blocks = [] } = useBlocks(workflowId);
    const { data: sections = [] } = useSections(workflowId);

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
        if (!sourceBlock || !sections || sections.length === 0) {
            return null;
        }

        const blockPhase = sourceBlock.phase;
        const stepSection = sections.find((s) => s.id === sectionId);
        const blockSectionId = sourceBlock.sectionId;
        const blockSection = blockSectionId
            ? sections.find((s) => s.id === blockSectionId)
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

            if (blockSection.order > stepSection.order) {
                return "Read block runs in a later section.";
            }
            return null;
        }

        if (blockPhase === 'onSectionSubmit' || blockPhase === 'onNext') {
            if (!blockSection) {
                return "Block runs on submit but has no section?";
            }
            // Must be strictly previous section
            if (blockSection.order < stepSection.order) {
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sourceTableId,
        columns,
        loadingColumns,
        blocks
    };
}
