
import { useEffect } from "react";

import type { DatavaultColumn } from "@/lib/types/datavault";

import type { WriteBlockConfig, ColumnMapping } from "@shared/types/blocks";

interface UseWriteTableMappingProps {
    config: WriteBlockConfig;
    columns?: DatavaultColumn[];
    onChange: (config: WriteBlockConfig) => void;
}

interface UseWriteTableMappingResult {
    duplicateColumns: string[];
    missingRequiredColumns: DatavaultColumn[];
    incompleteRows: ColumnMapping[];
    hasValidMappings: boolean;
}

export function useWriteTableMapping({ config, columns, onChange }: UseWriteTableMappingProps): UseWriteTableMappingResult {
    // Auto-add required columns and clean up duplicates
    useEffect(() => {
        // Only run if we have a table selected
        if (config.tableId && columns && columns.length > 0) {
            const existingMappings = config.columnMappings ?? [];
            const existingMappedColIds = existingMappings.map(m => m.columnId);

            // 1. Identify missing required columns
            // Use Map for deduping by ID, ensuring type safety
            // Filter strictly for required columns
            const requiredCols = columns.filter((c): c is DatavaultColumn => c.required === true);
            const uniqueRequiredColsMap = new Map<string, DatavaultColumn>();
            requiredCols.forEach(c => uniqueRequiredColsMap.set(c.id, c));
            const uniqueRequiredCols = Array.from(uniqueRequiredColsMap.values());

            const missingRequiredCols = uniqueRequiredCols.filter(c => !existingMappedColIds.includes(c.id));

            // 2. Identify duplicates in existing mappings
            const seenIds = new Set<string>();
            const uniqueExistingMappings: ColumnMapping[] = [];
            let hasDuplicates = false;

            for (const m of existingMappings) {
                // If we've seen this column ID before (and it's not empty), skip it
                if (m.columnId && seenIds.has(m.columnId)) {
                    hasDuplicates = true;
                    continue;
                }
                if (m.columnId) { seenIds.add(m.columnId); }
                uniqueExistingMappings.push(m);
            }

            // 3. Update if needed
            if (missingRequiredCols.length > 0 || hasDuplicates) {
                const newMappings = missingRequiredCols.map(col => ({
                    columnId: col.id,
                    value: ''
                }));
                onChange({
                    ...config,
                    columnMappings: [...uniqueExistingMappings, ...newMappings]
                });
            }
        }

    }, [config.tableId, columns, config.columnMappings?.length]);

    // Validation Functions
    const getDuplicateColumns = (): string[] => {
        const mappings = config.columnMappings ?? [];
        const columnCounts = mappings.reduce((acc, m) => {
            if (m.columnId) { acc[m.columnId] = (acc[m.columnId] ?? 0) + 1; }
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(columnCounts)
            .filter(([, count]) => count > 1)
            .map(([colId]) => colId);
    };

    const getMissingRequiredColumns = (): DatavaultColumn[] => {
        if (!columns) { return []; }
        const requiredCols = columns.filter((c): c is DatavaultColumn => c.required === true);
        const mappedColIds = (config.columnMappings ?? []).map(m => m.columnId);
        return requiredCols.filter(c => !mappedColIds.includes(c.id));
    };

    const getIncompleteRows = (): ColumnMapping[] => {
        return (config.columnMappings ?? []).filter(m => !m.columnId || !m.value || m.value.trim() === '');
    };

    const duplicateColumns = getDuplicateColumns();
    const missingRequiredColumns = getMissingRequiredColumns();
    const incompleteRows = getIncompleteRows();

    // Valid if we have mappings, no duplicates, and no missing required columns
    const hasMappings = (config.columnMappings?.length ?? 0) > 0;
    const hasValidMappings = hasMappings && duplicateColumns.length === 0 && missingRequiredColumns.length === 0;

    return {
        duplicateColumns,
        missingRequiredColumns,
        incompleteRows,
        hasValidMappings
    };
}
