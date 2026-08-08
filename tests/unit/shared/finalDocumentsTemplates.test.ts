import { describe, it, expect } from 'vitest';

import { normalizeFinalDocumentsTemplateEntry } from '../../../shared/finalDocumentsTemplates';
import type { ConditionExpression } from '../../../shared/types/conditions';

/**
 * LU-5 AC3: legacy `templates: string[]` entries (the only shape any real
 * row has ever stored) must keep normalizing exactly as before, and the
 * widened `{ templateId, conditions? }` object form must round-trip its
 * ConditionExpression untouched -- no `as` cast across a different shape.
 */
describe('normalizeFinalDocumentsTemplateEntry', () => {
  it('normalizes the legacy bare-string form with no conditions', () => {
    expect(normalizeFinalDocumentsTemplateEntry('template-123')).toEqual({
      templateId: 'template-123',
      conditions: null,
    });
  });

  it('normalizes the widened object form without conditions', () => {
    expect(normalizeFinalDocumentsTemplateEntry({ templateId: 'template-123' })).toEqual({
      templateId: 'template-123',
      conditions: null,
    });
  });

  it('normalizes the widened object form with a ConditionExpression, unchanged', () => {
    const conditions: ConditionExpression = {
      type: 'group',
      id: 'g1',
      operator: 'AND',
      conditions: [
        { type: 'condition', id: 'c1', variable: 'status', operator: 'equals', value: 'approved', valueType: 'constant' },
      ],
    };

    expect(normalizeFinalDocumentsTemplateEntry({ templateId: 'template-123', conditions })).toEqual({
      templateId: 'template-123',
      conditions,
    });
  });

  it('treats an explicit null conditions field as no condition', () => {
    expect(normalizeFinalDocumentsTemplateEntry({ templateId: 'template-123', conditions: null })).toEqual({
      templateId: 'template-123',
      conditions: null,
    });
  });

  it('returns null for a malformed entry (neither string nor { templateId })', () => {
    expect(normalizeFinalDocumentsTemplateEntry(42)).toBeNull();
    expect(normalizeFinalDocumentsTemplateEntry(null)).toBeNull();
    expect(normalizeFinalDocumentsTemplateEntry(undefined)).toBeNull();
    expect(normalizeFinalDocumentsTemplateEntry({})).toBeNull();
    expect(normalizeFinalDocumentsTemplateEntry({ templateId: 42 })).toBeNull();
  });
});
