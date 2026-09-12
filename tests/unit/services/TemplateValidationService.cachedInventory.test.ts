import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls below are hoisted above this import by vitest, so the service
// resolves the mocked db / extractor / VariableService rather than the real ones.
import { templateValidationService } from '../../../server/services/TemplateValidationService';
import { enterTenantContextForTests } from '../../../server/utils/rlsContext';

/**
 * TPL-5 AC3: the template's placeholder inventory is parsed ONCE at upload and
 * stored on `templates.metadata`. Recomputing a validation report — which happens
 * every time an author renames a step alias — must be a set diff against that
 * cached inventory, never a re-parse of the DOCX zip.
 *
 * That is the design decision that makes "recheck on every change" affordable, and
 * nothing else in the suite pins it: a later refactor could quietly reintroduce a
 * parse per read and every other test would stay green.
 *
 * The second test here is deliberate. An assertion that a spy was NOT called passes
 * just as happily when the code path is broken and nothing runs at all, so the
 * fallback case proves the spy is wired to something real.
 */

const findFirstMock = vi.fn();
const extractMock = vi.fn();

// RLS-2e: TemplateValidationService.validate now opens a tenant-scoped
// transaction via withTx -> withCurrentTenant -> db.transaction, and reads
// via `scopedTx.query...` rather than `db.query...`. The stub tx exposes the
// same lazily-wrapped `findFirstMock` as `db.query.templates.findFirst`,
// plus a no-op `execute` (applyTenantToTransaction's GUC set).
vi.mock('../../../server/db', () => {
  const query = { templates: { findFirst: (...args: unknown[]): unknown => findFirstMock(...args) } };
  return {
    db: {
      query,
      transaction: (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
        callback({ query, execute: (): Promise<unknown> => Promise.resolve(undefined) }),
    },
  };
});

vi.mock('../../../server/services/templatePlaceholders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/services/templatePlaceholders')>();
  return {
    ...actual,
    extractPlaceholdersDetailed: (...args: unknown[]): unknown => extractMock(...args),
  };
});

vi.mock('../../../server/services/templates', () => ({
  getTemplateFilePath: (ref: string): Promise<string> => Promise.resolve(`/tmp/${ref}`),
}));

// validate() also resolves the workflow's variables; stub it so this file stays in
// the no-DB unit-fast project. Two aliases, one of which the cached inventory
// references, so the report has something real to diff against.
vi.mock('../../../server/services/VariableService', () => ({
  variableService: {
    listVariables: (): Promise<unknown[]> =>
      Promise.resolve([
        { stepId: 's1', alias: 'client_name', label: 'Client name', type: 'short_text', pageTitle: 'A' },
        { stepId: 's2', alias: 'fee', label: 'Fee', type: 'currency', pageTitle: 'A' },
      ]),
  },
}));


const CACHED_PLACEHOLDERS = [
  { name: 'client_name', raw: '{{client_name}}', kind: 'variable', loopScope: [] },
  { name: 'fee', raw: '{{fee}}', kind: 'variable', loopScope: [] },
];

function templateRow(metadata: unknown): unknown {
  return {
    id: 'tpl-1',
    fileRef: 'stored/template.docx',
    metadata,
    project: { tenantId: 'tenant-1' },
  };
}

describe('TemplateValidationService cached inventory (TPL-5 AC3)', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    extractMock.mockReset();
    extractMock.mockResolvedValue([]);
  });

  it('AC3: reads the stored inventory without re-parsing the DOCX', async () => {
    enterTenantContextForTests('tenant-1');
    findFirstMock.mockResolvedValue(templateRow({ placeholders: CACHED_PLACEHOLDERS }));

    const report = await templateValidationService.validate('tpl-1', 'wf-1', 'tenant-1', 'user-1');

    expect(extractMock).not.toHaveBeenCalled();
    // The report is built from the cached inventory, not from an empty fallback —
    // without this the "not called" assertion above could pass on a no-op.
    expect(report.totalVariableCount).toBe(2);
  });

  it('falls back to parsing when no inventory has been stored yet', async () => {
    enterTenantContextForTests('tenant-1');
    findFirstMock.mockResolvedValue(templateRow({ size: 1234 }));
    extractMock.mockResolvedValue(CACHED_PLACEHOLDERS);

    const report = await templateValidationService.validate('tpl-1', 'wf-1', 'tenant-1', 'user-1');

    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(report.totalVariableCount).toBe(2);
  });

  it('rejects a caller from another tenant before touching the inventory', async () => {
    // The ambient tenant only has to be SOME real value for withTx to open
    // its transaction — TemplateValidationService.withTx (Variant 1, no
    // mismatch guard; see the pilot's known-gap note) doesn't cross-check it
    // against the `tenantId` argument. What this test actually pins is the
    // service's OWN ownership check (`template.project.tenantId !== tenantId`),
    // which only runs once the transaction is open — set ambient to the
    // CALLER's claimed tenant, exactly as a real request would (RLS-1 sets
    // both from the same resolution), so the mismatch is on the business
    // check, not on RLS.
    enterTenantContextForTests('other-tenant');
    findFirstMock.mockResolvedValue(templateRow({ placeholders: CACHED_PLACEHOLDERS }));

    await expect(
      templateValidationService.validate('tpl-1', 'wf-1', 'other-tenant', 'user-1')
    ).rejects.toThrow(/Access denied/i);
    expect(extractMock).not.toHaveBeenCalled();
  });
});
