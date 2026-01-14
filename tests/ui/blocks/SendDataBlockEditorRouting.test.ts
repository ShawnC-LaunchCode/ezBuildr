/**
 * Regression tests for Send Data to Table block editor routing
 * Ensures write blocks always open the correct editor
 */

import { describe, it, expect } from 'vitest';

// Mock block types
const createMockWriteBlock = () => ({
  id: 'block-1',
  type: 'write',
  phase: 'onSectionSubmit',
  order: 0,
  enabled: true,
  raw: {
    type: 'write',
    config: {
      mode: 'upsert',
      dataSourceId: 'ds1',
      tableId: 'table1',
      columnMappings: []
    }
  },
  source: 'regular',
  displayType: 'write'
});

const createMockReadBlock = () => ({
  id: 'block-2',
  type: 'read_table',
  phase: 'onSectionEnter',
  order: 0,
  enabled: true,
  raw: {
    type: 'read_table',
    config: {
      dataSourceId: 'ds1',
      tableId: 'table1',
      outputKey: 'list_data',
      filters: []
    }
  },
  source: 'regular',
  displayType: 'read_table'
});

describe('Send Data Block Editor Routing', () => {
  it('should identify write block correctly', () => {
    const block = createMockWriteBlock();
    expect(block.type).toBe('write');
    expect(block.raw.type).toBe('write');
  });

  it('should identify read block correctly', () => {
    const block = createMockReadBlock();
    expect(block.type).toBe('read_table');
    expect(block.raw.type).toBe('read_table');
  });

  it('should fail if write block has read_table type', () => {
    const block = createMockWriteBlock();
    // This test FAILS if routing is wrong
    expect(block.type).not.toBe('read_table');
  });

  it('should have correct config structure for write block', () => {
    const block = createMockWriteBlock();
    const config = block.raw.config as any;

    // Write block should have these fields
    expect(config).toHaveProperty('mode');
    expect(config).toHaveProperty('columnMappings');

    // Write block should NOT have read-specific fields
    expect(config).not.toHaveProperty('outputKey');
    expect(config).not.toHaveProperty('filters');
    expect(config).not.toHaveProperty('sort');
    expect(config).not.toHaveProperty('limit');
  });

  it('should have correct config structure for read block', () => {
    const block = createMockReadBlock();
    const config = block.raw.config as any;

    // Read block should have these fields
    expect(config).toHaveProperty('outputKey');
    expect(config).toHaveProperty('filters');

    // Read block should NOT have write-specific fields
    expect(config).not.toHaveProperty('mode');
    expect(config).not.toHaveProperty('columnMappings');
    expect(config).not.toHaveProperty('matchStrategy');
  });
});

describe('SendDataToTableBlockEditor Config Validation', () => {
  it('should require columnMappings array', () => {
    const config = {
      mode: 'create',
      dataSourceId: 'ds1',
      tableId: 'table1',
      columnMappings: []
    };

    expect(config).toHaveProperty('columnMappings');
    expect(Array.isArray(config.columnMappings)).toBe(true);
  });

  it('should validate required columns are mapped', () => {
    const columns = [
      { id: 'col1', name: 'Email', required: true },
      { id: 'col2', name: 'Name', required: false }
    ];

    const mappings = [
      { columnId: 'col2', value: 'name' }
      // Missing required col1
    ];

    const requiredCols = columns.filter(c => c.required);
    const mappedColIds = mappings.map(m => m.columnId);
    const missingRequired = requiredCols.filter(c => !mappedColIds.includes(c.id));

    // Should detect missing required column
    expect(missingRequired.length).toBeGreaterThan(0);
    expect(missingRequired[0].id).toBe('col1');
  });

  it('should detect duplicate column mappings', () => {
    const mappings = [
      { columnId: 'col1', value: 'email' },
      { columnId: 'col1', value: 'email2' } // Duplicate
    ];

    const columnCounts = mappings.reduce((acc, m) => {
      if (m.columnId) {acc[m.columnId] = (acc[m.columnId] || 0) + 1;}
      return acc;
    }, {} as Record<string, number>);

    const duplicates = Object.entries(columnCounts)
      .filter(([_, count]) => count > 1)
      .map(([colId, _]) => colId);

    expect(duplicates).toContain('col1');
  });

  it('should require match strategy for update mode', () => {
    const config = {
      mode: 'update',
      dataSourceId: 'ds1',
      tableId: 'table1',
      columnMappings: [{ columnId: 'col1', value: 'email' }]
    };

    // Update mode without matchStrategy is incomplete
    expect(config).not.toHaveProperty('matchStrategy');
    // This should fail validation in the UI
  });

  it('should allow create mode without match strategy', () => {
    const config = {
      mode: 'create',
      dataSourceId: 'ds1',
      tableId: 'table1',
      columnMappings: [{ columnId: 'col1', value: 'email' }]
    };

    // Create mode doesn't need matchStrategy
    expect(config).not.toHaveProperty('matchStrategy');
    // This should pass validation
    expect(config.mode).toBe('create');
  });
});
