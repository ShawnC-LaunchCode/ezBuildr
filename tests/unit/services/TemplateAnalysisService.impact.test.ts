import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWhere = vi.fn();
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

// getActiveWorkflowsForTemplate now reads workflows/pages/steps (all
// RLS-covered) inside one tenant-scoped transaction, so the query chain is
// reached through the transaction handle rather than the pool. With no tenant
// in context and RLS unenforced, `withCurrentTenant` falls through to
// `db.transaction`.
vi.mock('../../../server/db', () => {
  const conn = {
    select: (...args: unknown[]) => mockSelect(...args) as unknown,
  };
  return {
    db: {
      ...conn,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(conn),
    },
  };
});

vi.mock('../../../server/services/storage', () => ({
  storageProvider: {
    getLocalPath: vi.fn().mockResolvedValue('/tmp/dummy.docx')
  }
}));

vi.mock('../../../server/services/document/TemplateScanner', () => ({
  templateScanner: {
    scanDocx: vi.fn()
      .mockResolvedValueOnce({ variables: ['keptVar', 'oldVar'], warnings: [] }) // first call: old template
      .mockResolvedValueOnce({ variables: ['keptVar', 'newVar'], warnings: [] }) // second call: new template
  }
}));

vi.mock('../../../server/services/templatePlaceholders', () => ({
  extractPlaceholdersDetailed: vi.fn()
    .mockResolvedValueOnce([{ name: 'keptVar', raw: 'keptVar' }, { name: 'oldVar', raw: 'oldVar' }])
    .mockResolvedValueOnce([{ name: 'keptVar', raw: 'keptVar' }, { name: 'newVar', raw: 'newVar' }])
}));

import { getActiveWorkflowsForTemplate, analyzeTemplateUpdate } from '../../../server/services/TemplateAnalysisService';

describe('TemplateAnalysisService Impact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveWorkflowsForTemplate', () => {
    it('categorizes workflows into active and pinned based on JSON config', async () => {
      // 1. Usages query
      mockWhere.mockResolvedValueOnce([
        { workflowId: 'wf-1', workflowName: 'Pinned WF' },
        { workflowId: 'wf-2', workflowName: 'Unpinned WF' }
      ]);
      
      // 2. wf-1 pages
      mockWhere.mockResolvedValueOnce([{
        config: { finalBlock: true, templates: [{ templateId: 't-1', pinnedVersionId: 'v-pinned-1' }] }
      }]);
      // 3. wf-1 steps
      mockWhere.mockResolvedValueOnce([]);

      // 4. wf-2 pages
      mockWhere.mockResolvedValueOnce([{
        config: { finalBlock: true, templates: [{ templateId: 't-1' }] }
      }]);
      // 5. wf-2 steps
      mockWhere.mockResolvedValueOnce([]);

      const result = await getActiveWorkflowsForTemplate('t-1');

      expect(result.pinned).toHaveLength(1);
      expect(result.pinned[0].id).toBe('wf-1');
      expect(result.active).toHaveLength(1);
      expect(result.active[0].id).toBe('wf-2');
    });
  });

  describe('analyzeTemplateUpdate', () => {
    it('returns added/removed/unchanged variables and impact', async () => {
      // 1. Mock for template fetch (db.select from templates)
      mockWhere.mockResolvedValueOnce([{
        id: 't-1',
        fileRef: '/tmp/dummy.docx'
      }]);

      // 2. getActiveWorkflowsForTemplate mocks
      mockWhere.mockResolvedValueOnce([
        { workflowId: 'wf-1', workflowName: 'Active WF' }
      ]);
      mockWhere.mockResolvedValueOnce([{
        config: { finalBlock: true, templates: [{ templateId: 't-1' }] }
      }]);
      mockWhere.mockResolvedValueOnce([]);

      const result = await analyzeTemplateUpdate('t-1', 'v-1');

      expect(result.comparison.added).toEqual(['newVar']);
      expect(result.comparison.removed).toEqual(['oldVar']);
      expect(result.comparison.unchanged).toEqual(['keptVar']);
      expect(result.comparison.renamed).toEqual([]);
      expect(result.impact.workflows).toEqual([{ id: 'wf-1', name: 'Active WF' }]);
      expect(result.impact.pinnedWorkflows).toEqual([]);
    });
  });
});
