/**
 * MappingValidator — GH-156 binding kinds.
 *
 * `validateStructure`'s per-entry checks used to assume every binding was
 * `{ type: 'variable', source }`. These tests exercise the widened
 * `constant`/`formula`/`datavault` structural checks through the public
 * `validateWithTestData` entry point.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { db } from '../../../../server/db';
import { MappingValidator } from '../../../../server/services/document/MappingValidator';

import type { DocumentMapping } from '../../../../server/services/document/MappingInterpreter';

vi.mock('../../../../server/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('../../../../server/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockTemplate(overrides: Record<string, unknown> = {}): void {
  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'template-1', metadata: {}, ...overrides }]),
  };
  vi.mocked(db.select).mockReturnValue(mockSelect as unknown as ReturnType<typeof db.select>);
}

describe('MappingValidator.validateWithTestData — GH-156 binding kinds', () => {
  let validator: MappingValidator;

  beforeEach(() => {
    validator = new MappingValidator();
    vi.mocked(db.select).mockReset();
  });

  it('is valid for a constant binding with no error', async () => {
    mockTemplate();
    const report = await validator.validateWithTestData(
      'template-1',
      { firm_name: { type: 'constant', value: 'Acme Legal' } },
      {}
    );
    expect(report.errors).toEqual([]);
  });

  it('errors when a constant binding has no value', async () => {
    mockTemplate();
    const mapping = { firm_name: { type: 'constant' } } as unknown as DocumentMapping;
    const report = await validator.validateWithTestData('template-1', mapping, {});
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.type === 'missing_value')).toBe(true);
  });

  it('errors when a formula binding has no expression', async () => {
    mockTemplate();
    const mapping = { greeting: { type: 'formula' } } as unknown as DocumentMapping;
    const report = await validator.validateWithTestData('template-1', mapping, {});
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.type === 'missing_expression')).toBe(true);
  });

  it('passes a well-formed formula binding through structural validation', async () => {
    mockTemplate();
    const report = await validator.validateWithTestData(
      'template-1',
      { greeting: { type: 'formula', expression: 'Hi {{firstName}}' } },
      { firstName: 'Ada' }
    );
    expect(report.errors).toEqual([]);
  });

  it('errors on an incomplete datavault binding', async () => {
    mockTemplate();
    const report = await validator.validateWithTestData(
      'template-1',
      { firm_name: { type: 'datavault', tableId: 't1', columnId: '', rowId: 'r1' } },
      {}
    );
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.type === 'incomplete_datavault_binding')).toBe(true);
  });

  it('passes a complete datavault binding through structural validation', async () => {
    mockTemplate();
    const report = await validator.validateWithTestData(
      'template-1',
      { firm_name: { type: 'datavault', tableId: 't1', columnId: 'c1', rowId: 'r1' } },
      {}
    );
    expect(report.errors).toEqual([]);
  });

  it('still errors on a variable binding with a missing source (backward compatibility)', async () => {
    mockTemplate();
    const mapping = { client_name: { type: 'variable' } } as unknown as DocumentMapping;
    const report = await validator.validateWithTestData('template-1', mapping, {});
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.type === 'missing_source')).toBe(true);
  });

  it('rejects an unrecognized binding type', async () => {
    mockTemplate();
    const mapping = { field: { type: 'not-a-real-kind' } } as unknown as DocumentMapping;
    const report = await validator.validateWithTestData('template-1', mapping, {});
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => e.type === 'invalid_type')).toBe(true);
  });
});
