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
  getQuestionTypePresentation,
} from '../../../client/src/lib/blockRegistry';
import { CANONICAL_STEP_TYPES } from '../../../shared/types/stepConfigs';
import {
  BooleanAdvancedConfigSchema,
  ChoiceAdvancedConfigSchema,
  DateTimeConfigSchema,
  FileUploadConfigSchema,
  NumberAdvancedConfigSchema,
  TextAdvancedConfigSchema,
} from '../../../shared/validation/stepConfigSchemas';

const canonicalPresetConfigSchemas = {
  text: TextAdvancedConfigSchema,
  boolean: BooleanAdvancedConfigSchema,
  date_time: DateTimeConfigSchema,
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
      new Set(['text']),
    );
  });

  it('keeps every canonicalized family free of retired registry actions', () => {
    expect(getBlockByType('short_text')).toBeUndefined();
    expect(getBlockByType('long_text')).toBeUndefined();
    expect(getBlockByType('text')?.createDefaultConfig()).toEqual({ variant: 'short' });
    expect(getBlocksByMode('easy').filter((block) => block.type === 'text')).toEqual([
      expect.objectContaining({ id: 'easy.short-text', label: 'Short Text' }),
      expect.objectContaining({ id: 'easy.long-text', label: 'Long Text' }),
    ]);
    expect(getBlockByType('yes_no')).toBeUndefined();
    expect(getBlockByType('true_false')).toBeUndefined();
    expect(getBlocksByMode('easy').filter((block) => block.type === 'boolean')).toEqual([
      expect.objectContaining({ id: 'easy.yes-no', label: 'Yes/No' }),
      expect.objectContaining({ id: 'easy.true-false', label: 'True/False' }),
    ]);
    expect(getBlockByType('date')).toBeUndefined();
    expect(getBlockByType('time')).toBeUndefined();
    expect(getBlocksByMode('easy').filter((block) => block.type === 'date_time')).toEqual([
      expect.objectContaining({ id: 'easy.date', label: 'Date', createDefaultConfig: expect.any(Function) }),
      expect.objectContaining({ id: 'easy.time', label: 'Time', createDefaultConfig: expect.any(Function) }),
      expect.objectContaining({ id: 'easy.date-time', label: 'Date/Time', createDefaultConfig: expect.any(Function) }),
    ]);
    expect(getBlockByType('radio')?.type).toBe('radio');
    expect(getBlockByType('multiple_choice')?.type).toBe('multiple_choice');
    expect(getBlockByType('currency')).toBeUndefined();
  });

  it('keeps retired text aliases display-only with friendly presentation', () => {
    expect(getBlockByType('short_text')).toBeUndefined();
    expect(getBlockByType('long_text')).toBeUndefined();
    expect(getQuestionTypePresentation('short_text')).toMatchObject({
      label: 'Short Text', glyph: 'T', category: 'text',
    });
    expect(getQuestionTypePresentation('long_text')).toMatchObject({
      label: 'Long Text', glyph: '¶', category: 'text',
    });
  });

  it('drives the Easy palette from preset data, naming no type or preset id (STB-3C)', () => {
    // The whole point of STB-3C: a family joins the palette by setting
    // `canonicalized` on its own presets, so STB-4..STB-10 never edit
    // getBlocksByMode and cannot collide there.
    const easy = getBlocksByMode('easy');
    const canonicalized = QUESTION_PRESETS.filter((preset) => preset.canonicalized === true);

    for (const preset of canonicalized) {
      if (!preset.modes.easy) { continue; }
      expect(easy).toContainEqual(expect.objectContaining({
        id: preset.id,
        type: preset.persistedType,
        label: preset.label,
        description: preset.description,
      }));
    }

    const fileUpload = QUESTION_PRESETS.find((preset) => preset.id === 'easy.file-upload');
    expect(fileUpload?.persistedType).toBe(fileUpload?.canonicalType);
    expect(fileUpload?.canonicalized).toBe(true);
    expect(easy.some((block) => block.id === 'easy.file-upload')).toBe(true);
    expect(easy.some((block) => block.type === 'file_upload')).toBe(true);
  });

  it('keeps canonicalized presets consistent with their persisted identity', () => {
    for (const preset of QUESTION_PRESETS) {
      expect(typeof preset.description).toBe('string');
      expect(preset.description.length).toBeGreaterThan(0);
      if (preset.canonicalized === true) {
        expect(preset.persistedType).toBe(preset.canonicalType);
      }
    }
  });

  it('activates Number and Currency as canonical Number presets without retired writes (STB-9/STB-10)', () => {
    const easy = getBlocksByMode('easy');
    const numberEntries = easy.filter((block) => block.type === 'number');

    expect(numberEntries).toEqual([
      expect.objectContaining({ id: 'easy.number', label: 'Number' }),
      expect.objectContaining({ id: 'easy.currency', label: 'Currency' }),
    ]);
    expect(numberEntries[0].createDefaultConfig()).toEqual({
      mode: 'number', validation: { step: 1 },
    });
    expect(numberEntries[1].createDefaultConfig()).toEqual({
      mode: 'currency_decimal', currency: 'USD', thousandsSeparator: true,
    });
    expect(getBlocksByMode('easy').some((block) => block.type === 'currency')).toBe(false);
    expect(getBlocksByMode('advanced').some((b) => b.type === 'number' && b.id === undefined)).toBe(true);
  });

  it('keeps retired currency rows display-only with Currency presentation', () => {
    expect(getQuestionTypePresentation('currency')).toMatchObject({
      label: 'Currency', glyph: '$', category: 'numeric',
    });
    expect(getQuestionTypePresentation('number', { mode: 'currency_decimal' })).toMatchObject({
      label: 'Currency', glyph: '$', category: 'numeric',
    });
  });

  it('derives canonical text presentation from the preset config discriminator', () => {
    expect(getQuestionTypePresentation('text', { variant: 'short' })).toMatchObject({
      label: 'Short Text', glyph: 'T', category: 'text',
    });
    expect(getQuestionTypePresentation('text', { variant: 'long' })).toMatchObject({
      label: 'Long Text', glyph: '¶', category: 'text',
    });
  });

  it('derives canonical Boolean presentation from the configured labels', () => {
    expect(getQuestionTypePresentation('boolean', {
      trueLabel: 'Yes', falseLabel: 'No', storeAsBoolean: true, displayStyle: 'buttons',
    })).toMatchObject({ label: 'Yes/No', glyph: 'Y/N', category: 'boolean' });
    expect(getQuestionTypePresentation('boolean', {
      trueLabel: 'True', falseLabel: 'False', storeAsBoolean: true, displayStyle: 'buttons',
    })).toMatchObject({ label: 'True/False', glyph: 'T/F', category: 'boolean' });
  });

  it('derives distinct Date, Time, and Date/Time presentation from kind', () => {
    expect(getQuestionTypePresentation('date_time', { kind: 'date' })?.label).toBe('Date');
    expect(getQuestionTypePresentation('date_time', { kind: 'time' })?.label).toBe('Time');
    expect(getQuestionTypePresentation('date_time', { kind: 'datetime' })?.label).toBe('Date/Time');
    expect(getQuestionTypePresentation('date')?.label).toBe('Date');
    expect(getQuestionTypePresentation('time')?.label).toBe('Time');
  });

  it('keeps bare canonical and retired-alias presentation behavior unchanged', () => {
    expect(getQuestionTypePresentation('text')).toMatchObject({
      label: 'Text', glyph: 'T', category: 'text',
    });
    expect(getQuestionTypePresentation('email', { allowMultiple: true })).toMatchObject({
      label: 'Email', glyph: '@', category: 'validated',
    });
    expect(getQuestionTypePresentation('long_text', { variant: 'short' })).toMatchObject({
      label: 'Long Text', glyph: '¶', category: 'text',
    });
  });
});
