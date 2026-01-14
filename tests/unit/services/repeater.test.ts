/**
 * Tests for RepeaterService (Stage 20 PR 4)
 *
 * Tests repeater functionality including:
 * - Validation (instance count, required fields)
 * - Instance management (add, remove, reorder)
 * - Data flattening for variable resolution
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { RepeaterService } from '../../../server/services/RepeaterService';

import type { RepeaterConfig, RepeaterValue } from '../../../shared/types/repeater';

describe('RepeaterService', () => {
  let service: RepeaterService;

  beforeEach(() => {
    service = new RepeaterService();
  });

  // ========================================================================
  // VALIDATION
  // ========================================================================

  describe('Validation', () => {
    const config: RepeaterConfig = {
      fields: [
        { id: 'name', type: 'short_text', title: 'Name', required: true, order: 0 },
        { id: 'age', type: 'short_text', title: 'Age', required: false, order: 1 },
      ],
      minInstances: 1,
      maxInstances: 5,
    };

    it('should validate min instances constraint', () => {
      const value: RepeaterValue = { instances: [] };
      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(false);
      expect(result.globalErrors).toContain('At least 1 item(s) required');
    });

    it('should validate max instances constraint', () => {
      const value: RepeaterValue = {
        instances: Array.from({ length: 6 }, (_, i) => ({
          instanceId: `inst-${i}`,
          index: i,
          values: { name: `Name ${i}` },
        })),
      };
      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(false);
      expect(result.globalErrors).toContain('Maximum 5 item(s) allowed');
    });

    it('should validate required fields in instances', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { name: 'John' } },
          { instanceId: 'inst-2', index: 1, values: {} }, // Missing required 'name'
        ],
      };
      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(false);
      expect(result.instanceErrors.has('inst-2')).toBe(true);
      expect(result.instanceErrors.get('inst-2')).toContain('Name is required');
    });

    it('should pass validation for valid repeater', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { name: 'John', age: '30' } },
          { instanceId: 'inst-2', index: 1, values: { name: 'Jane' } },
        ],
      };
      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(true);
      expect(result.globalErrors).toHaveLength(0);
      expect(result.instanceErrors.size).toBe(0);
    });

    it('should handle null value as empty instances', () => {
      const result = service.validateRepeater(null, config);

      expect(result.valid).toBe(false);
      expect(result.globalErrors).toContain('At least 1 item(s) required');
    });
  });

  // ========================================================================
  // INSTANCE MANAGEMENT
  // ========================================================================

  describe('Instance management', () => {
    const config: RepeaterConfig = {
      fields: [
        { id: 'name', type: 'short_text', title: 'Name', required: true, order: 0 },
      ],
      minInstances: 1,
      maxInstances: 3,
    };

    it('should create empty repeater with min instances', () => {
      const value = service.createEmptyRepeater(config);

      expect(value.instances).toHaveLength(1);
      expect(value.instances[0].values).toEqual({});
    });

    it('should add instance to repeater', () => {
      const value: RepeaterValue = {
        instances: [{ instanceId: 'inst-1', index: 0, values: { name: 'John' } }],
      };

      const updated = service.addInstance(value, config);

      expect(updated).not.toBeNull();
      expect(updated!.instances).toHaveLength(2);
      expect(updated!.instances[1].index).toBe(1);
    });

    it('should not add instance if max reached', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: {} },
          { instanceId: 'inst-2', index: 1, values: {} },
          { instanceId: 'inst-3', index: 2, values: {} },
        ],
      };

      const updated = service.addInstance(value, config);

      expect(updated).toBeNull(); // Max 3 instances
    });

    it('should remove instance from repeater', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { name: 'John' } },
          { instanceId: 'inst-2', index: 1, values: { name: 'Jane' } },
        ],
      };

      const updated = service.removeInstance(value, 'inst-1', config);

      expect(updated).not.toBeNull();
      expect(updated!.instances).toHaveLength(1);
      expect(updated!.instances[0].instanceId).toBe('inst-2');
      expect(updated!.instances[0].index).toBe(0); // Re-indexed
    });

    it('should not remove instance if min would be violated', () => {
      const value: RepeaterValue = {
        instances: [{ instanceId: 'inst-1', index: 0, values: { name: 'John' } }],
      };

      const updated = service.removeInstance(value, 'inst-1', config);

      expect(updated).toBeNull(); // Min 1 instance
    });

    it('should reorder instances', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { name: 'A' } },
          { instanceId: 'inst-2', index: 1, values: { name: 'B' } },
          { instanceId: 'inst-3', index: 2, values: { name: 'C' } },
        ],
      };

      const updated = service.reorderInstance(value, 2, 0); // Move C to front

      expect(updated.instances[0].instanceId).toBe('inst-3');
      expect(updated.instances[1].instanceId).toBe('inst-1');
      expect(updated.instances[2].instanceId).toBe('inst-2');
      expect(updated.instances[0].index).toBe(0);
      expect(updated.instances[1].index).toBe(1);
      expect(updated.instances[2].index).toBe(2);
    });
  });

  // ========================================================================
  // DATA FLATTENING
  // ========================================================================

  describe('Data flattening', () => {
    it('should flatten repeater data for variable resolution', () => {
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { name: 'John', age: '30' } },
          { instanceId: 'inst-2', index: 1, values: { name: 'Jane', age: '25' } },
        ],
      };

      const flattened = service.flattenRepeaterData('dependents', value);

      expect(flattened.repeaterKey).toBe('dependents');
      expect(flattened.instances).toHaveLength(2);
      expect(flattened.instances[0].index).toBe(0);
      expect(flattened.instances[0].fields).toEqual({ name: 'John', age: '30' });
      expect(flattened.instances[1].index).toBe(1);
      expect(flattened.instances[1].fields).toEqual({ name: 'Jane', age: '25' });
    });

    it('should handle empty instances', () => {
      const value: RepeaterValue = { instances: [] };

      const flattened = service.flattenRepeaterData('items', value);

      expect(flattened.instances).toHaveLength(0);
    });
  });

  // ========================================================================
  // INSTANCE TITLE
  // ========================================================================

  describe('Instance title', () => {
    it('should generate instance title from template', () => {
      const config: RepeaterConfig = {
        fields: [],
        showInstanceTitle: true,
        instanceTitleTemplate: 'Dependent #{index}',
      };

      const instance = { instanceId: 'inst-1', index: 0, values: {} };
      const title = service.getInstanceTitle(instance, config);

      expect(title).toBe('Dependent #1'); // index + 1
    });

    it('should use default template if not provided', () => {
      const config: RepeaterConfig = {
        fields: [],
        showInstanceTitle: true,
      };

      const instance = { instanceId: 'inst-1', index: 2, values: {} };
      const title = service.getInstanceTitle(instance, config);

      expect(title).toBe('Item #3');
    });

    it('should return empty string if showInstanceTitle is false', () => {
      const config: RepeaterConfig = {
        fields: [],
        showInstanceTitle: false,
      };

      const instance = { instanceId: 'inst-1', index: 0, values: {} };
      const title = service.getInstanceTitle(instance, config);

      expect(title).toBe('');
    });
  });

  // ========================================================================
  // FIELD VISIBILITY WITHIN INSTANCES
  // ========================================================================

  describe('Field visibility within instances', () => {
    it('should skip validation for hidden fields', () => {
      const config: RepeaterConfig = {
        fields: [
          { id: 'hasSpouse', type: 'yes_no', title: 'Has Spouse', required: true, order: 0 },
          {
            id: 'spouseName',
            type: 'short_text',
            title: 'Spouse Name',
            required: true,
            order: 1,
            visibleIf: {
              op: 'equals',
              left: { type: 'variable', path: 'hasSpouse' },
              right: { type: 'value', value: true },
            },
          },
        ],
      };

      // hasSpouse = false, so spouseName is hidden and not required
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { hasSpouse: false } },
        ],
      };

      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(true); // spouseName not required when hidden
    });

    it('should require visible fields based on condition', () => {
      const config: RepeaterConfig = {
        fields: [
          { id: 'hasSpouse', type: 'yes_no', title: 'Has Spouse', required: true, order: 0 },
          {
            id: 'spouseName',
            type: 'short_text',
            title: 'Spouse Name',
            required: true,
            order: 1,
            visibleIf: {
              op: 'equals',
              left: { type: 'variable', path: 'hasSpouse' },
              right: { type: 'value', value: true },
            },
          },
        ],
      };

      // hasSpouse = true, so spouseName is visible and required
      const value: RepeaterValue = {
        instances: [
          { instanceId: 'inst-1', index: 0, values: { hasSpouse: true } }, // Missing spouseName
        ],
      };

      const result = service.validateRepeater(value, config);

      expect(result.valid).toBe(false);
      expect(result.instanceErrors.get('inst-1')).toContain('Spouse Name is required');
    });
  });
});
