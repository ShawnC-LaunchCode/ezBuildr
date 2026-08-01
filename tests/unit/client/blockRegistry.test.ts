/**
 * LIST-5: List step type registration in BLOCK_REGISTRY
 *
 * Verifies the "list" entry added for the List question type — present in
 * both modes, has a default config with exactly one question field, and
 * that adding the new "structure" category kept the Add Question palette's
 * two-column split balanced (mirrors the split logic in QuestionAddMenu.tsx).
 */
import { describe, it, expect } from 'vitest';

import {
  BLOCK_REGISTRY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getBlockByType,
  getBlocksByCategory,
  getBlocksByMode,
} from '../../../client/src/lib/blockRegistry';

// Mirrors QuestionAddMenu.tsx's column split so a registry change that
// unbalances the palette fails here, not just visually.
function columnBlockCounts(mode: 'easy' | 'advanced'): [number, number] {
  const blocksByCategory = getBlocksByCategory(mode);
  const orderedCategories = CATEGORY_ORDER.filter(
    (category) => (blocksByCategory[category]?.length ?? 0) > 0
  );
  const columns = [
    orderedCategories.filter((_, index) => index % 2 === 0),
    orderedCategories.filter((_, index) => index % 2 === 1),
  ];
  return columns.map((categories) =>
    categories.reduce((sum, category) => sum + (blocksByCategory[category]?.length ?? 0), 0)
  ) as [number, number];
}

describe('BLOCK_REGISTRY: list', () => {
  const listEntry = getBlockByType('list');

  it('registers a "list" entry available in both easy and advanced mode', () => {
    expect(listEntry).toBeDefined();
    expect(listEntry?.label).toBe('List');
    expect(listEntry?.category).toBe('structure');
    expect(listEntry?.modes).toEqual({ easy: true, advanced: true });
  });

  it('creates a default ListConfig with exactly one empty question field', () => {
    const config = listEntry?.createDefaultConfig();
    expect(config).toBeDefined();
    const fields = (config as { fields: unknown[] }).fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'question' });
  });

  it('appears in the easy-mode and advanced-mode block lists', () => {
    expect(getBlocksByMode('easy').some((block) => block.type === 'list')).toBe(true);
    expect(getBlocksByMode('advanced').some((block) => block.type === 'list')).toBe(true);
  });

  it('is the only entry currently registered under the "list" type', () => {
    expect(BLOCK_REGISTRY.filter((block) => block.type === 'list')).toHaveLength(1);
  });
});

describe('CATEGORY_ORDER / CATEGORY_LABELS: structure', () => {
  it('has a label for the new "structure" category', () => {
    expect(CATEGORY_LABELS.structure).toBe('Structure');
  });

  it('lists "structure" in CATEGORY_ORDER', () => {
    expect(CATEGORY_ORDER).toContain('structure');
  });

  it('keeps the Add Question palette columns balanced in easy mode', () => {
    const [left, right] = columnBlockCounts('easy');
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('keeps the Add Question palette columns balanced in advanced mode', () => {
    const [left, right] = columnBlockCounts('advanced');
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });
});
