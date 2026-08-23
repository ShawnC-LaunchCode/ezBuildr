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

// RLS-5: WorkflowTenantResolver's bootstrap reads (migrations 0028/0033) open
// their own transaction when the caller passes no `tx` — which is exactly how
// this runner calls it — so the `db` stub needs a working `transaction` whose
// `tx` exposes `execute` (that is what pins the GUC). Without it resolution
// throws, the runner bails before its filter validation, and the assertion
// below fails with "0 calls" rather than anything that names the real cause.
vi.mock('../../../server/db', () => {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  return {
    db: {
      ...tx,
      transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    },
  };
});

vi.mock('../../../server/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mocks.warn,
  },
  // WorkflowTenantResolver (reached via the runner's tenant lookup) builds its
  // own child logger. Without this the module import throws, the delegator
  // swallows it, and tenant resolution silently returns null.
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../server/repositories', () => ({
  datavaultColumnsRepository: { findByTableId: mocks.findColumns },
  organizationRepository: { findById: vi.fn() },
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
  // Must be a real UUID: tenant_id is a Postgres `uuid` column, and
  // WorkflowTenantResolver fails closed on anything that isn't one.
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  const knownColumn = {
    id: 'known-column',
    tableId: 'table-1',
    name: 'Known column',
    slug: 'known-column',
    type: 'text',
  } as DatavaultColumn;

  beforeEach(() => {
    mocks.findWorkflow.mockResolvedValue({ id: 'workflow-1', projectId: 'project-1' });
    mocks.findProject.mockResolvedValue({ id: 'project-1', tenantId: TENANT_ID });
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
      phase: 'onPageEnter',
      config,
      enabled: true,
      virtualStepId: null,
    } as unknown as Block;

    const result = await runner.execute(config, {
      workflowId: 'workflow-1',
      phase: 'onPageEnter',
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
