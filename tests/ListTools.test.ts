/**
 * List Tools Block Tests
 * Tests for comprehensive list transformation operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { BlockContext, ListVariable, ListToolsConfig } from '@shared/types/blocks';

import { blockRunner } from '../server/services/BlockRunner';

// Mock the stepValueRepository to avoid actual database calls
vi.mock('../server/repositories/stepValues', () => ({
  stepValueRepository: {
    upsert: vi.fn().mockResolvedValue({ id: 'mock-step-value-id' }),
  }
}));

/**
 * NOTE: These tests access the private executeListToolsBlock method directly
 * because it contains complex business logic that benefits from isolated unit testing.
 * The method is called via (blockRunner as any) to bypass TypeScript private access.
 * Database operations are mocked to ensure test isolation.
 */
describe('List Tools Block', () => {
  let sampleList: ListVariable;
  let context: BlockContext;

  beforeEach(() => {
    // Sample list data
    sampleList = {
      metadata: { source: 'read_table' as const, sourceId: 'test-table' },
      rows: [
        { id: '1', name: 'Alice', age: 30, city: 'NYC', active: true },
        { id: '2', name: 'Bob', age: 25, city: 'LA', active: false },
        { id: '3', name: 'Charlie', age: 35, city: 'NYC', active: true },
        { id: '4', name: 'Diana', age: 28, city: 'SF', active: true },
        { id: '5', name: 'Eve', age: 32, city: 'NYC', active: false },
      ],
      count: 5,
      columns: [
        { id: 'name', name: 'Name', type: 'text' },
        { id: 'age', name: 'Age', type: 'number' },
        { id: 'city', name: 'City', type: 'text' },
        { id: 'active', name: 'Active', type: 'boolean' },
      ]
    };

    context = {
      workflowId: 'test-workflow',
      runId: 'test-run',
      phase: 'onNext' as const,
      data: {
        users_list: sampleList
      },
      aliasMap: {},
    };
  });

  describe('Filter Operations', () => {
    it('should filter rows by equals condition', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'filtered_users',
        filters: {
          combinator: 'and',
          rules: [
            { fieldPath: 'city', op: 'equals', valueSource: 'const', value: 'NYC' }
          ]
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.filtered_users.count).toBe(3);
      expect(result.data?.filtered_users.rows.every((r: any) => r.city === 'NYC')).toBe(true);
    });

    it('should filter with greater_than operator', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'senior_users',
        filters: {
          combinator: 'and',
          rules: [
            { fieldPath: 'age', op: 'greater_than', valueSource: 'const', value: 30 }
          ]
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.senior_users.count).toBe(2);
      expect(result.data?.senior_users.rows.every((r: any) => r.age > 30)).toBe(true);
    });

    it('should filter with AND combinator', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'active_nyc',
        filters: {
          combinator: 'and',
          rules: [
            { fieldPath: 'city', op: 'equals', valueSource: 'const', value: 'NYC' },
            { fieldPath: 'active', op: 'equals', valueSource: 'const', value: true }
          ]
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.active_nyc.count).toBe(2);
    });

    it('should filter with OR combinator', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'young_or_sf',
        filters: {
          combinator: 'or',
          rules: [
            { fieldPath: 'age', op: 'less_than', valueSource: 'const', value: 28 },
            { fieldPath: 'city', op: 'equals', valueSource: 'const', value: 'SF' }
          ]
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.young_or_sf.count).toBe(2); // Bob (25) and Diana (SF)
    });
  });

  describe('Sort Operations', () => {
    it('should sort by single key ascending', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'sorted_users',
        sort: [
          { fieldPath: 'age', direction: 'asc' }
        ]
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      const ages = result.data?.sorted_users.rows.map((r: any) => r.age);
      expect(ages).toEqual([25, 28, 30, 32, 35]);
    });

    it('should sort by single key descending', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'sorted_users',
        sort: [
          { fieldPath: 'name', direction: 'desc' }
        ]
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      const names = result.data?.sorted_users.rows.map((r: any) => r.name);
      expect(names).toEqual(['Eve', 'Diana', 'Charlie', 'Bob', 'Alice']);
    });

    it('should sort by multiple keys', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'sorted_users',
        sort: [
          { fieldPath: 'city', direction: 'asc' },
          { fieldPath: 'age', direction: 'desc' }
        ]
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      const rows = result.data?.sorted_users.rows;
      expect(rows[0].city).toBe('LA');
      expect(rows[1].city).toBe('NYC');
      expect(rows[1].age).toBe(35); // Charlie (oldest NYC)
    });
  });

  describe('Range Operations', () => {
    it('should apply limit', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'limited_users',
        limit: 3
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.limited_users.count).toBe(3);
    });

    it('should apply offset', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'offset_users',
        offset: 2
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.offset_users.count).toBe(3);
      expect(result.data?.offset_users.rows[0].name).toBe('Charlie');
    });

    it('should apply offset and limit together', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'paged_users',
        offset: 1,
        limit: 2
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.paged_users.count).toBe(2);
      expect(result.data?.paged_users.rows[0].name).toBe('Bob');
      expect(result.data?.paged_users.rows[1].name).toBe('Charlie');
    });
  });

  describe('Select Operations', () => {
    it('should select specific columns', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'name_age_only',
        select: ['name', 'age']
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      const row = result.data?.name_age_only.rows[0];
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('age');
      expect(row).toHaveProperty('id'); // ID always preserved
      expect(row).not.toHaveProperty('city');
      expect(row).not.toHaveProperty('active');
    });
  });

  describe('Dedupe Operations', () => {
    it('should deduplicate by field', async () => {
      // Add duplicate city values
      context.data.users_list.rows.push(
        { id: '6', name: 'Frank', age: 40, city: 'NYC', active: true }
      );
      context.data.users_list.count = 6;

      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'unique_cities',
        dedupe: { fieldPath: 'city' }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      // NYC, LA, SF = 3 unique cities
      expect(result.data?.unique_cities.count).toBe(3);

      const cities = result.data?.unique_cities.rows.map((r: any) => r.city);
      expect([...new Set(cities)].length).toBe(3);
    });
  });

  describe('Derived Outputs', () => {
    it('should output count variable', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'all_users',
        outputs: {
          countVar: 'user_count'
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.user_count).toBe(5);
    });

    it('should output first row variable', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'all_users',
        sort: [{ fieldPath: 'age', direction: 'asc' }],
        outputs: {
          firstVar: 'youngest_user'
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.youngest_user).toBeDefined();
      expect(result.data?.youngest_user.name).toBe('Bob');
      expect(result.data?.youngest_user.age).toBe(25);
    });
  });

  describe('Comprehensive Pipeline', () => {
    it('should apply all operations in sequence', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'processed_users',
        filters: {
          combinator: 'and',
          rules: [
            { fieldPath: 'active', op: 'equals', valueSource: 'const', value: true }
          ]
        },
        sort: [
          { fieldPath: 'age', direction: 'desc' }
        ],
        offset: 0,
        limit: 2,
        select: ['name', 'age'],
        outputs: {
          countVar: 'active_count',
          firstVar: 'oldest_active'
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.processed_users.count).toBe(2); // Limit of 2
      expect(result.data?.active_count).toBe(2);
      expect(result.data?.oldest_active).toBeDefined();
      expect(result.data?.oldest_active.name).toBe('Charlie'); // Oldest active user

      // Check column projection
      const row = result.data?.processed_users.rows[0];
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('age');
      expect(row).not.toHaveProperty('city');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input list', async () => {
      context.data.users_list = {
        metadata: { source: 'read_table' as const },
        rows: [],
        count: 0,
        columns: []
      };

      const config: ListToolsConfig = {
        sourceListVar: 'users_list',
        outputListVar: 'filtered_users',
        filters: {
          combinator: 'and',
          rules: [
            { fieldPath: 'age', op: 'greater_than', valueSource: 'const', value: 30 }
          ]
        }
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.filtered_users.count).toBe(0);
    });

    it('should handle missing source list', async () => {
      const config: ListToolsConfig = {
        sourceListVar: 'nonexistent_list',
        outputListVar: 'output'
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.output.count).toBe(0);
    });

    it('should handle plain arrays', async () => {
      context.data.simple_array = [
        { name: 'Alice', score: 90 },
        { name: 'Bob', score: 85 }
      ];

      const config: ListToolsConfig = {
        sourceListVar: 'simple_array',
        outputListVar: 'sorted_array',
        sort: [{ fieldPath: 'score', direction: 'desc' }]
      };

      const block = {
        id: 'test-block',
        workflowId: 'test-workflow',
        type: 'list_tools' as const,
        phase: 'onNext' as const,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
        enabled: true,
        order: 0,
      };

      const result = await (blockRunner as any).executeListToolsBlock(config, context, block);

      expect(result.success).toBe(true);
      expect(result.data?.sorted_array.rows[0].score).toBe(90);
    });
  });
});
