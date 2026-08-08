import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComparisonOperator, ConditionExpression } from '@shared/types/conditions';

import { EnhancedDocumentEngine } from '../../../server/services/document/EnhancedDocumentEngine.js';

// Mock DocumentEngine to avoid real rendering
vi.mock('../../../server/services/document/DocumentEngine.js', () => {
  return {
    DocumentEngine: class {
      generate = vi.fn().mockResolvedValue({
        docxPath: 'mock/path.docx',
        pdfPath: 'mock/path.pdf'
      });
    }
  };
});

// Mock templateAnalytics
vi.mock('../../../server/services/TemplateAnalyticsService.js', () => ({
  templateAnalytics: {
    trackGeneration: vi.fn().mockResolvedValue(undefined)
  }
}));

/**
 * LU-5: `doc.conditions` is a `ConditionExpression` (the same nested
 * AND/OR-group language steps.visible_if / sections.visible_if use),
 * evaluated directly by shared/conditionEvaluator.ts -- not the flat
 * `{ key, op }` LogicExpression this superseded. `condition(...)` below
 * builds a minimal single-condition group so each scenario stays
 * one-to-one with what it replaced.
 */
function condition(
  variable: string,
  operator: ComparisonOperator,
  value?: unknown
): ConditionExpression {
  return {
    type: 'group',
    id: 'root',
    operator: 'AND',
    conditions: [
      {
        type: 'condition',
        id: 'c1',
        variable,
        operator,
        value,
        valueType: 'constant',
      },
    ],
  };
}

describe('EnhancedDocumentEngine - Conditions', () => {
  let engine: EnhancedDocumentEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new EnhancedDocumentEngine();
  });

  const generateWithConditions = async (
    conditions: ConditionExpression,
    stepValues: Record<string, unknown>
  ) => {
    return engine.renderFinalBlock({
      documents: [{
        documentId: 'doc1',
        templatePath: 'test.docx',
        alias: 'testDoc',
        conditions
      }],
      stepValues
    });
  };

  it('generates if no conditions are provided', async () => {
    const res = await generateWithConditions(null, {});
    expect(res.skipped).toHaveLength(0);
    expect(res.documents).toHaveLength(1);
  });

  it('supports operator: equals', async () => {
    const conditions = condition('status', 'equals', 'approved');

    let res = await generateWithConditions(conditions, { status: 'approved' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { status: 'pending' });
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toEqual({ alias: 'testDoc', reason: 'Conditions not met' });
  });

  it('supports operator: not_equals', async () => {
    const conditions = condition('status', 'not_equals', 'rejected');

    let res = await generateWithConditions(conditions, { status: 'approved' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { status: 'rejected' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports operator: contains', async () => {
    const conditions = condition('notes', 'contains', 'urgent');

    let res = await generateWithConditions(conditions, { notes: 'this is urgent work' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { notes: 'this is normal' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports operator: greater_than', async () => {
    const conditions = condition('amount', 'greater_than', 100);

    let res = await generateWithConditions(conditions, { amount: 150 });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { amount: 50 });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports operator: less_than', async () => {
    const conditions = condition('amount', 'less_than', 100);

    let res = await generateWithConditions(conditions, { amount: 50 });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { amount: 150 });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports operator: is_empty', async () => {
    const conditions = condition('field', 'is_empty');

    let res = await generateWithConditions(conditions, { field: '' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { field: 'value' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports operator: is_not_empty', async () => {
    const conditions = condition('field', 'is_not_empty');

    let res = await generateWithConditions(conditions, { field: 'value' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { field: '' });
    expect(res.skipped).toHaveLength(1);
  });

  // Alias-based (testing hook-enhanced alias values, assuming normalization handles aliases)
  it('supports alias-based conditions', async () => {
    const conditions = condition('userEmail', 'equals', 'test@example.com');
    // Even if userEmail is an alias created by normalization, because we evaluate against normalizedStepValues, it should work.
    // In this test, we just provide it directly, which simulates the normalized output.
    const res = await generateWithConditions(conditions, { userEmail: 'test@example.com' });
    expect(res.skipped).toHaveLength(0);
  });

  // Nested-path condition
  it('supports nested-path conditions (dot notation)', async () => {
    const conditions = condition('address.city', 'equals', 'New York');

    // stepValues usually has nested objects before normalization
    const stepValues = {
      address: {
        city: 'New York',
        state: 'NY'
      }
    };

    const res = await generateWithConditions(conditions, stepValues);
    expect(res.skipped).toHaveLength(0);

    const stepValuesFail = {
      address: {
        city: 'Boston'
      }
    };
    const resFail = await generateWithConditions(conditions, stepValuesFail);
    expect(resFail.skipped).toHaveLength(1);
  });

  // New coverage (LU-5): nested AND/OR groups are the whole point of
  // moving off the old flat { key, op } shape -- prove they actually work
  // for a document condition, not just single flat comparisons.
  it('supports nested AND/OR groups', async () => {
    const conditions: ConditionExpression = {
      type: 'group',
      id: 'root',
      operator: 'OR',
      conditions: [
        {
          type: 'group',
          id: 'g1',
          operator: 'AND',
          conditions: [
            { type: 'condition', id: 'c1', variable: 'status', operator: 'equals', value: 'approved', valueType: 'constant' },
            { type: 'condition', id: 'c2', variable: 'amount', operator: 'greater_than', value: 1000, valueType: 'constant' },
          ],
        },
        { type: 'condition', id: 'c3', variable: 'expedited', operator: 'is_true', valueType: 'constant' },
      ],
    };

    // First branch satisfied
    let res = await generateWithConditions(conditions, { status: 'approved', amount: 5000, expedited: false });
    expect(res.skipped).toHaveLength(0);

    // Second branch satisfied
    res = await generateWithConditions(conditions, { status: 'pending', amount: 0, expedited: true });
    expect(res.skipped).toHaveLength(0);

    // Neither branch satisfied
    res = await generateWithConditions(conditions, { status: 'pending', amount: 0, expedited: false });
    expect(res.skipped).toHaveLength(1);
  });

  it('reports a skipped document as skipped, not failed, and does not block other documents', async () => {
    const res = await engine.renderFinalBlock({
      documents: [
        {
          documentId: 'doc1',
          templatePath: 'test.docx',
          alias: 'skippedDoc',
          conditions: condition('status', 'equals', 'approved'),
        },
        {
          documentId: 'doc2',
          templatePath: 'test.docx',
          alias: 'generatedDoc',
          conditions: null,
        },
      ],
      stepValues: { status: 'pending' },
    });

    expect(res.skipped).toEqual([{ alias: 'skippedDoc', reason: 'Conditions not met' }]);
    expect(res.failed).toHaveLength(0);
    expect(res.documents.map((d) => d.alias)).toEqual(['generatedDoc']);
    expect(res.totalAttempted).toBe(2);
    expect(res.totalGenerated).toBe(1);
  });
});
