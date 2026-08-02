import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Block, DatavaultColumn } from '@shared/schema';
import type { ListVariable, ReadTableConfig } from '@shared/types/blocks';

const mocks = vi.hoisted(() => ({
  findColumns: vi.fn(),
  findWorkflow: vi.fn(),
  findProject: vi.fn(),
  verifyTable: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: {} }));

vi.mock('../../../server/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mocks.warn,
  },
}));

vi.mock('../../../server/repositories', () => ({
  datavaultColumnsRepository: { findByTableId: mocks.findColumns },
  projectRepository: { findById: mocks.findProject },
  stepValueRepository: { upsert: vi.fn() },
  userRepository: { findById: vi.fn() },
  workflowRepository: { findById: mocks.findWorkflow },
}));

vi.mock('../../../server/services/DatavaultTablesService', () => ({
  datavaultTablesService: { verifyTenantOwnership: mocks.verifyTable },
}));

import { ReadTableBlockRunner } from '../../../server/services/blockRunners/ReadTableBlockRunner';

describe('ReadTableBlockRunner', () => {
  const knownColumn = {
    id: 'known-column',
    tableId: 'table-1',
    name: 'Known column',
    slug: 'known-column',
    type: 'text',
  } as DatavaultColumn;

  beforeEach(() => {
    mocks.findWorkflow.mockResolvedValue({ id: 'workflow-1', projectId: 'project-1' });
    mocks.findProject.mockResolvedValue({ id: 'project-1', tenantId: 'tenant-1' });
    mocks.verifyTable.mockResolvedValue({ id: 'table-1', name: 'Test table' });
    mocks.findColumns.mockResolvedValue([knownColumn]);
  });

  it('warns and skips a filter whose column does not belong to the table', async () => {
    const queryTableRows = vi.fn().mockResolvedValue([
      { id: 'row-1', values: { [knownColumn.id]: 'Actual cell value' } },
    ]);
    const runner = new ReadTableBlockRunner();
    Reflect.set(runner, 'queryTableRows', queryTableRows);
    const config: ReadTableConfig = {
      dataSourceId: 'database-1',
      tableId: 'table-1',
      outputKey: 'rows',
      filters: [{ columnId: 'unknown-column', operator: 'equals', value: 'anything' }],
    };
    const block = {
      id: 'block-1',
      workflowId: 'workflow-1',
      type: 'read_table',
      phase: 'onSectionEnter',
      config,
      enabled: true,
      virtualStepId: null,
    } as unknown as Block;

    const result = await runner.execute(config, {
      workflowId: 'workflow-1',
      phase: 'onSectionEnter',
      data: {},
    }, block);

    expect(mocks.warn).toHaveBeenCalledWith(
      { columnId: 'unknown-column' },
      'Filter references unknown column'
    );
    expect(queryTableRows).toHaveBeenCalledWith(expect.objectContaining({ filters: [] }));
    expect(result.success).toBe(true);
    const list = result.data?.rows as ListVariable;
    expect(list.rows[0]?.[knownColumn.id]).toBe('Actual cell value');
  });
});
