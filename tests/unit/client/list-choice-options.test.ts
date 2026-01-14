/**
 * Test suite for list-backed choice options
 * Tests the integration of the shared list pipeline with choice questions
 */

import { describe, it, expect } from 'vitest';

import { generateOptionsFromList } from '../../../client/src/lib/choice-utils';
import { transformList, arrayToListVariable } from '../../../shared/listPipeline';

import type { ListVariable } from '../../../shared/types/blocks';
import type { DynamicOptionsConfig } from '../../../shared/types/stepConfigs';

describe('List-Backed Choice Options', () => {
  const sampleData = [
    { id: '1', name: 'Alice', age: 30, city: 'NYC', active: true },
    { id: '2', name: 'Bob', age: 25, city: 'LA', active: false },
    { id: '3', name: 'Charlie', age: 35, city: 'NYC', active: true },
    { id: '4', name: 'Diana', age: 28, city: 'SF', active: true },
    { id: '5', name: 'Eve', age: 32, city: 'NYC', active: false },
  ];

  describe('Basic option generation', () => {
    it('should generate options from a list with label and value paths', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id'
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options).toHaveLength(5);
      expect(options[0]).toEqual({
        id: '1',
        label: 'Alice',
        alias: '1'
      });
    });

    it('should use labelTemplate to combine fields', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        labelTemplate: '{name} ({age})'
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options[0].label).toBe('Alice (30)');
      expect(options[1].label).toBe('Bob (25)');
    });

    it('should add blank option when configured', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        includeBlankOption: true,
        blankLabel: '-- Select --'
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options).toHaveLength(6);
      expect(options[0]).toEqual({
        id: 'blank',
        label: '-- Select --',
        alias: ''
      });
    });
  });

  describe('Filtering', () => {
    it('should filter options before mapping', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          filters: {
            combinator: 'and',
            rules: [
              { fieldPath: 'active', op: 'equals', valueSource: 'const', value: true }
            ]
          }
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      // Only 3 active users
      expect(options).toHaveLength(3);
      expect(options.map(o => o.label)).toEqual(['Alice', 'Charlie', 'Diana']);
    });

    it('should support multi-condition filters', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          filters: {
            combinator: 'and',
            rules: [
              { fieldPath: 'city', op: 'equals', valueSource: 'const', value: 'NYC' },
              { fieldPath: 'active', op: 'equals', valueSource: 'const', value: true }
            ]
          }
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      // Alice and Charlie (both in NYC and active)
      expect(options).toHaveLength(2);
      expect(options.map(o => o.label)).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('Sorting', () => {
    it('should sort options by a field', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          sort: [
            { fieldPath: 'age', direction: 'asc' }
          ]
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options.map(o => o.label)).toEqual(['Bob', 'Diana', 'Alice', 'Eve', 'Charlie']);
    });

    it('should support multi-key sorting', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          sort: [
            { fieldPath: 'city', direction: 'asc' },
            { fieldPath: 'age', direction: 'desc' }
          ]
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      // LA (Bob), NYC (Eve 32, Charlie 35, Alice 30), SF (Diana)
      const labels = options.map(o => o.label);
      expect(labels[0]).toBe('Bob'); // LA
      expect(labels[labels.length - 1]).toBe('Diana'); // SF
    });
  });

  describe('Limiting', () => {
    it('should limit the number of options', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          limit: 3
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options).toHaveLength(3);
    });

    it('should apply offset and limit together', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        transform: {
          offset: 1,
          limit: 2
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      expect(options).toHaveLength(2);
      expect(options.map(o => o.label)).toEqual(['Bob', 'Charlie']);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate options by a field', () => {
      const dataWithDupes = [
        ...sampleData,
        { id: '6', name: 'Frank', age: 40, city: 'NYC', active: true }
      ];

      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'city', // Use city as value - will have duplicates
        transform: {
          dedupe: {
            fieldPath: 'city'
          }
        }
      };

      const options = generateOptionsFromList(dataWithDupes, config);

      // 3 unique cities: NYC, LA, SF
      expect(options).toHaveLength(3);
      const cities = options.map(o => o.alias);
      expect([...new Set(cities)].length).toBe(3);
    });
  });

  describe('Comprehensive pipeline', () => {
    it('should apply multiple transformations in sequence', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id',
        labelTemplate: '{name} - {city}',
        transform: {
          filters: {
            combinator: 'and',
            rules: [
              { fieldPath: 'age', op: 'greater_than', valueSource: 'const', value: 26 }
            ]
          },
          sort: [
            { fieldPath: 'age', direction: 'desc' }
          ],
          limit: 2
        }
      };

      const options = generateOptionsFromList(sampleData, config);

      // Filter: age > 26 → Alice, Charlie, Diana, Eve
      // Sort: by age desc → Charlie (35), Eve (32), Alice (30), Diana (28)
      // Limit: 2 → Charlie, Eve
      expect(options).toHaveLength(2);
      expect(options[0].label).toBe('Charlie - NYC');
      expect(options[1].label).toBe('Eve - NYC');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty lists gracefully', () => {
      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id'
      };

      const options = generateOptionsFromList([], config);

      expect(options).toHaveLength(0);
    });

    it('should handle missing fields in rows', () => {
      const dataWithMissing = [
        { id: '1', name: 'Alice' },
        { id: '2' }, // Missing name
        { id: '3', name: 'Charlie' }
      ];

      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id'
      };

      const options = generateOptionsFromList(dataWithMissing, config);

      expect(options).toHaveLength(3);
      expect(options[1].label).toBe('2'); // Falls back to value
    });

    it('should work with ListVariable format', () => {
      const listVar: ListVariable = {
        metadata: { source: 'read_table' },
        rows: sampleData,
        count: sampleData.length,
        columns: [
          { id: 'id', name: 'ID', type: 'text' },
          { id: 'name', name: 'Name', type: 'text' },
          { id: 'age', name: 'Age', type: 'number' }
        ]
      };

      const config: DynamicOptionsConfig = {
        type: 'list',
        listVariable: 'users',
        labelPath: 'name',
        valuePath: 'id'
      };

      const options = generateOptionsFromList(listVar, config);

      expect(options).toHaveLength(5);
      expect(options[0].label).toBe('Alice');
    });
  });
});
