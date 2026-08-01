import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LogicExpression } from '@shared/types/stepConfigs';

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

describe('EnhancedDocumentEngine - Conditions', () => {
  let engine: EnhancedDocumentEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new EnhancedDocumentEngine();
  });

  const generateWithConditions = async (
    conditions: unknown,
    stepValues: Record<string, unknown>
  ) => {
    return engine.renderFinalBlock({
      documents: [{
        documentId: 'doc1',
        templatePath: 'test.docx',
        alias: 'testDoc',
        conditions: conditions as LogicExpression | null
      }],
      stepValues
    });
  };

  it('generates if no conditions are provided', async () => {
    const res = await generateWithConditions(null, {});
    expect(res.skipped).toHaveLength(0);
    expect(res.documents).toHaveLength(1);
  });

  // Legacy Operators
  it('supports legacy operator: equals', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'status', op: 'equals', value: 'approved' }]
    };
    
    let res = await generateWithConditions(conditions, { status: 'approved' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { status: 'pending' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: not_equals', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'status', op: 'not_equals', value: 'rejected' }]
    };
    
    let res = await generateWithConditions(conditions, { status: 'approved' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { status: 'rejected' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: contains', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'notes', op: 'contains', value: 'urgent' }]
    };
    
    let res = await generateWithConditions(conditions, { notes: 'this is urgent work' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { notes: 'this is normal' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: greater_than', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'amount', op: 'greater_than', value: 100 }]
    };
    
    let res = await generateWithConditions(conditions, { amount: 150 });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { amount: 50 });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: less_than', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'amount', op: 'less_than', value: 100 }]
    };
    
    let res = await generateWithConditions(conditions, { amount: 50 });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { amount: 150 });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: is_empty', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'field', op: 'is_empty', value: '' }]
    };
    
    let res = await generateWithConditions(conditions, { field: '' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { field: 'value' });
    expect(res.skipped).toHaveLength(1);
  });

  it('supports legacy operator: is_not_empty', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'field', op: 'is_not_empty', value: '' }]
    };
    
    let res = await generateWithConditions(conditions, { field: 'value' });
    expect(res.skipped).toHaveLength(0);

    res = await generateWithConditions(conditions, { field: '' });
    expect(res.skipped).toHaveLength(1);
  });

  // Alias-based (testing hook-enhanced alias values, assuming normalization handles aliases)
  it('supports alias-based conditions', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'userEmail', op: 'equals', value: 'test@example.com' }]
    };
    // Even if userEmail is an alias created by normalization, because we evaluate against normalizedStepValues, it should work.
    // In this test, we just provide it directly, which simulates the normalized output.
    const res = await generateWithConditions(conditions, { userEmail: 'test@example.com' });
    expect(res.skipped).toHaveLength(0);
  });

  // Nested-path condition
  it('supports nested-path conditions (dot notation)', async () => {
    const conditions = {
      operator: 'AND',
      conditions: [{ key: 'address.city', op: 'equals', value: 'New York' }]
    };
    
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
});
