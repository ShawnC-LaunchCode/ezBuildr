import { describe, expect, it } from 'vitest';

import { validateAndNormalizeConfig } from '@server/utils/stepConfigUtils';

import type { ListConfig } from '../../../../shared/types/stepConfigs';

/**
 * LIST2-7 AC8 — round-trip through `validateAndNormalizeConfig('list', ...)`.
 *
 * The authoring UI (`ListFieldSettings`) writes `config`/`description`/
 * `visibleIf` onto a question field exactly the way the standalone editors
 * write them onto a step. This proves the server-side config gate (LIST2-3's
 * `ListConfigSchema`, `field.config: z.unknown().optional()`) does not drop
 * any of it on a save→reload cycle — nothing here is LIST2-7 production code,
 * it is a regression net over an existing gate for a shape this ticket is
 * the first to actually produce.
 */
describe('ListFieldSettings-authored config round-trips through validateAndNormalizeConfig (LIST2-7 AC8)', () => {
  it('preserves scale/number/display/multi_field config, description, and visibleIf on every field', () => {
    const config: ListConfig = {
      fields: [
        {
          kind: 'question',
          id: 'f-scale',
          alias: 'satisfaction',
          type: 'scale',
          title: 'Satisfaction',
          description: 'Rate from 1 to 10.',
          order: 0,
          config: { min: 1, max: 10, step: 1, display: 'slider', showValue: true },
        },
        {
          kind: 'question',
          id: 'f-number',
          alias: 'age',
          type: 'number',
          title: 'Age',
          order: 1,
          config: { min: 18, max: 99, step: 1, allowDecimal: false },
          visibleIf: {
            id: 'g1',
            type: 'group',
            operator: 'AND',
            conditions: [
              { id: 'c1', type: 'condition', variable: 'satisfaction', operator: 'greater_than', valueType: 'constant', value: 5 },
            ],
          },
        },
        {
          kind: 'question',
          id: 'f-display',
          alias: 'intro_text',
          type: 'display',
          title: 'Intro',
          order: 2,
          config: { markdown: '# Welcome' },
        },
        {
          kind: 'question',
          id: 'f-multi',
          alias: 'contact_info',
          type: 'multi_field',
          title: 'Contact',
          order: 3,
          config: {
            layout: 'contact',
            fields: [
              { key: 'email', label: 'Email', type: 'email', required: true },
              { key: 'phone', label: 'Phone', type: 'phone', required: false },
            ],
            storeAs: 'separate',
          },
        },
      ],
    };

    const result = validateAndNormalizeConfig('list', config) as ListConfig;

    expect(result.fields).toHaveLength(4);

    const [scaleField, numberField, displayField, multiField] = result.fields;

    expect(scaleField).toMatchObject({
      id: 'f-scale',
      description: 'Rate from 1 to 10.',
      config: { min: 1, max: 10, step: 1, display: 'slider', showValue: true },
    });

    expect(numberField).toMatchObject({
      id: 'f-number',
      config: { min: 18, max: 99, step: 1, allowDecimal: false },
    });
    expect(numberField.kind).toBe('question');
    if (numberField.kind === 'question') {
      expect(numberField.visibleIf).toMatchObject({
        type: 'group',
        conditions: [{ variable: 'satisfaction', operator: 'greater_than', value: 5 }],
      });
    }

    expect(displayField).toMatchObject({ id: 'f-display', config: { markdown: '# Welcome' } });

    expect(multiField).toMatchObject({
      id: 'f-multi',
      config: {
        layout: 'contact',
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'phone', label: 'Phone', type: 'phone', required: false },
        ],
        storeAs: 'separate',
      },
    });
  });
});
