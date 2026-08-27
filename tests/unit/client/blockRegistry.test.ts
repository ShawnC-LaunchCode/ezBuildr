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
  QUESTION_PRESETS,
  getBlockByType,
  getBlocksByCategory,
  getBlocksByMode,
} from '../../../client/src/lib/blockRegistry';
import { CANONICAL_STEP_TYPES } from '../../../shared/types/stepConfigs';
import {
  BooleanAdvancedConfigSchema,
  ChoiceAdvancedConfigSchema,
  DateTimeUnifiedConfigSchema,
  FileUploadConfigSchema,
  NumberAdvancedConfigSchema,
  TextAdvancedConfigSchema,
} from '../../../shared/validation/stepConfigSchemas';

const canonicalPresetConfigSchemas = {
  text: TextAdvancedConfigSchema,
  boolean: BooleanAdvancedConfigSchema,
  date_time: DateTimeUnifiedConfigSchema,
  choice: ChoiceAdvancedConfigSchema,
  number: NumberAdvancedConfigSchema,
  file_upload: FileUploadConfigSchema,
} as const;

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

describe('QUESTION_PRESETS canonical contract', () => {
  it('uses unique stable IDs and canonical identities', () => {
    const ids = QUESTION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of QUESTION_PRESETS) {
      expect(CANONICAL_STEP_TYPES).toContain(preset.canonicalType);
      expect(preset).toHaveProperty('persistedType');
      expect(preset.id).not.toBe(preset.persistedType);
    }
  });

  it('declares usable mode metadata for every preset', () => {
    for (const preset of QUESTION_PRESETS) {
      expect(typeof preset.modes.easy).toBe('boolean');
      expect(typeof preset.modes.advanced).toBe('boolean');
      expect(preset.modes.easy || preset.modes.advanced).toBe(true);
    }
  });

  it('produces defaults accepted by the canonical type schemas', () => {
    for (const preset of QUESTION_PRESETS) {
      const defaultConfig = preset.createDefaultConfig();
      const result = canonicalPresetConfigSchemas[preset.canonicalType].safeParse(defaultConfig);
      expect(result.success, `${preset.id} has an invalid canonical default config`).toBe(true);
      if (result.success) {
        expect(result.data, `${preset.id} default fields were stripped by validation`).toEqual(
          defaultConfig,
        );
      }
    }
  });

  it('defines every binding Easy preset', () => {
    expect(QUESTION_PRESETS.map((preset) => preset.label)).toEqual([
      'Short Text',
      'Long Text',
      'Yes/No',
      'True/False',
      'Date',
      'Time',
      'Date/Time',
      'Single Select',
      'Multiple Choice',
      'Number',
      'Currency',
      'File Upload',
    ]);
  });

  it('can expose several Easy presets for one canonical type', () => {
    const easyTextPresets = QUESTION_PRESETS.filter(
      (preset) => preset.modes.easy && preset.canonicalType === 'text',
    );
    expect(easyTextPresets.map((preset) => preset.label)).toEqual([
      'Short Text',
      'Long Text',
    ]);
    expect(new Set(easyTextPresets.map((preset) => preset.persistedType))).toEqual(
      new Set(['short_text', 'long_text']),
    );
  });

  it('does not change the existing registry creation path', () => {
    expect(getBlockByType('short_text')?.createDefaultConfig()).toEqual({});
    expect(getBlockByType('long_text')?.createDefaultConfig()).toEqual({});
    expect(getBlockByType('radio')?.type).toBe('radio');
    expect(getBlockByType('multiple_choice')?.type).toBe('multiple_choice');
    expect(getBlockByType('currency')?.type).toBe('currency');
    expect(getBlockByType('file_upload')).toBeUndefined();
  });
});
