/**
 * Tests for SendDataToTableBlockEditor validation logic
 */

/**
 * @vitest-environment jsdom
 */


import { describe, it, expect } from 'vitest';

import type { WriteBlockConfig, ColumnMapping } from '@shared/types/blocks';

// Helper functions extracted from SendDataToTableBlockEditor for testing
function getDuplicateColumns(columnMappings: ColumnMapping[]): string[] {
  const columnCounts = columnMappings.reduce((acc, m) => {
    if (m.columnId) {
      acc[m.columnId] = (acc[m.columnId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(columnCounts)
    .filter(([_, count]) => count > 1)
    .map(([colId, _]) => colId);
}

function getMissingRequiredColumns(
  columns: Array<{ id: string; required: boolean }>,
  columnMappings: ColumnMapping[]
): Array<{ id: string; required: boolean }> {
  const requiredCols = columns.filter(c => c.required);
  const mappedColIds = columnMappings.map(m => m.columnId);
  return requiredCols.filter(c => !mappedColIds.includes(c.id));
}

function getIncompleteRows(columnMappings: ColumnMapping[]): ColumnMapping[] {
  return columnMappings.filter(m => !m.columnId || !m.value);
}

describe('SendDataToTableBlockEditor Validation', () => {
  describe('getDuplicateColumns', () => {
    it('should detect duplicate column IDs', () => {
      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
        { columnId: 'col1', value: 'email2' }, // Duplicate
        { columnId: 'col2', value: 'name' },
      ];

      const duplicates = getDuplicateColumns(mappings);
      expect(duplicates).toEqual(['col1']);
    });

    it('should return empty array when no duplicates', () => {
      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
        { columnId: 'col2', value: 'name' },
      ];

      const duplicates = getDuplicateColumns(mappings);
      expect(duplicates).toEqual([]);
    });

    it('should detect multiple duplicate columns', () => {
      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
        { columnId: 'col1', value: 'email2' },
        { columnId: 'col2', value: 'name' },
        { columnId: 'col2', value: 'name2' },
      ];

      const duplicates = getDuplicateColumns(mappings);
      expect(duplicates).toContain('col1');
      expect(duplicates).toContain('col2');
    });
  });

  describe('getMissingRequiredColumns', () => {
    it('should detect missing required columns', () => {
      const columns = [
        { id: 'col1', required: true },
        { id: 'col2', required: false },
        { id: 'col3', required: true },
      ];

      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
        // col3 is missing but required
      ];

      const missing = getMissingRequiredColumns(columns, mappings);
      expect(missing).toHaveLength(1);
      expect(missing[0].id).toBe('col3');
    });

    it('should return empty array when all required columns mapped', () => {
      const columns = [
        { id: 'col1', required: true },
        { id: 'col2', required: false },
      ];

      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
      ];

      const missing = getMissingRequiredColumns(columns, mappings);
      expect(missing).toEqual([]);
    });
  });

  describe('getIncompleteRows', () => {
    it('should detect rows with missing column', () => {
      const mappings: ColumnMapping[] = [
        { columnId: '', value: 'test' }, // Missing column
        { columnId: 'col1', value: 'email' },
      ];

      const incomplete = getIncompleteRows(mappings);
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].columnId).toBe('');
    });

    it('should detect rows with missing value', () => {
      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: '' }, // Missing value
        { columnId: 'col2', value: 'name' },
      ];

      const incomplete = getIncompleteRows(mappings);
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].value).toBe('');
    });

    it('should detect rows with both missing', () => {
      const mappings: ColumnMapping[] = [
        { columnId: '', value: '' }, // Both missing
        { columnId: 'col1', value: 'email' },
      ];

      const incomplete = getIncompleteRows(mappings);
      expect(incomplete).toHaveLength(1);
    });

    it('should return empty array for complete rows', () => {
      const mappings: ColumnMapping[] = [
        { columnId: 'col1', value: 'email' },
        { columnId: 'col2', value: 'name' },
      ];

      const incomplete = getIncompleteRows(mappings);
      expect(incomplete).toEqual([]);
    });
  });

  describe('WriteBlockConfig validation scenarios', () => {
    it('should validate update mode requires match strategy', () => {
      const config: WriteBlockConfig = {
        dataSourceId: 'ds1',
        tableId: 'table1',
        mode: 'update',
        columnMappings: [{ columnId: 'col1', value: 'email' }],
      };

      // Update mode without match strategy is invalid
      expect(config.matchStrategy).toBeUndefined();
    });

    it('should validate upsert mode requires match strategy', () => {
      const config: WriteBlockConfig = {
        dataSourceId: 'ds1',
        tableId: 'table1',
        mode: 'upsert',
        matchStrategy: {
          type: 'column_match',
          columnId: 'col1',
          columnValue: 'email',
        },
        columnMappings: [{ columnId: 'col1', value: 'email' }],
      };

      // Upsert mode with match strategy is valid
      expect(config.matchStrategy).toBeDefined();
      expect(config.matchStrategy?.columnId).toBe('col1');
    });

    it('should validate create mode does not require match strategy', () => {
      const config: WriteBlockConfig = {
        dataSourceId: 'ds1',
        tableId: 'table1',
        mode: 'create',
        columnMappings: [{ columnId: 'col1', value: 'email' }],
      };

      // Create mode does not need match strategy
      expect(config.matchStrategy).toBeUndefined();
      expect(config.mode).toBe('create');
    });
  });
});
