import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { TemplateParser } from '../../../server/services/document/TemplateParser';
import {
  getChoiceListBindingsByAlias,
  getListConfigsByAlias,
  normalizeVariables,
  type ListStepConfigSource,
} from '../../../server/services/document/VariableNormalizer';
import type {
  ChoiceAdvancedConfig,
  ListConfig,
  ListValue,
} from '../../../shared/types/stepConfigs';

function createDocxFixture(content: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function extractText(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  return (zip.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
}

const residentConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'resident-name', alias: 'residentName', type: 'short_text', title: 'Name', order: 0 },
  ],
};

const addressConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'street', alias: 'street', type: 'short_text', title: 'Street', order: 0 },
    { kind: 'list', id: 'residents', alias: 'residents', title: 'Residents', order: 1, list: residentConfig },
  ],
};

const childrenConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    { kind: 'list', id: 'addresses', alias: 'addresses', title: 'Addresses', order: 1, list: addressConfig },
  ],
};

const listConfigs = getListConfigsByAlias([
  { id: 'children-step', alias: 'children', type: 'list', config: childrenConfig },
]);

async function render(template: string, children: ListValue): Promise<{ data: Record<string, unknown>; text: string }> {
  const data = normalizeVariables({ children }, { listConfigs });
  const output = await new TemplateParser().render({
    templatePath: 'list-loop-fixture.docx',
    templateBuffer: createDocxFixture(template),
    data,
  });
  return { data, text: extractText(output) };
}

describe('List values in document templates', () => {
  it('projects storage envelopes and renders one entry per item', async () => {
    const { data, text } = await render('{{#children}}{{name}};{{/children}}', {
      items: [
        { itemId: 'child-1', values: { name: 'Ava', ignored: 'not configured' } },
        { itemId: 'child-2', values: { name: 'Noah' } },
      ],
    });

    expect(data.children).toEqual([
      { name: 'Ava', addresses: [] },
      { name: 'Noah', addresses: [] },
    ]);
    expect(data.children).not.toHaveProperty('itemId');
    expect(text).toContain('Ava;Noah;');
  });

  it('renders nested list loops to three levels', async () => {
    const { text } = await render(
      '{{#children}}{{name}}:{{#addresses}}{{street}}[{{#residents}}{{residentName}};{{/residents}}]{{/addresses}}{{/children}}',
      {
        items: [{
          itemId: 'child-1',
          values: {
            name: 'Ava',
            addresses: {
              items: [{
                itemId: 'address-1',
                values: {
                  street: '12 Oak St',
                  residents: {
                    items: [{ itemId: 'resident-1', values: { residentName: 'Mia' } }],
                  },
                },
              }],
            },
          },
        }],
      }
    );

    expect(text).toContain('Ava:12 Oak St[Mia;]');
  });

  it('renders an empty top-level list zero times', async () => {
    const { text } = await render('Before{{#children}}{{name}}{{/children}}After', { items: [] });

    expect(text).toContain('BeforeAfter');
    expect(text).not.toContain('{{#children}}');
  });

  it('renders an outer item once and an empty nested list zero times', async () => {
    const { text } = await render(
      '{{#children}}Child={{name}};{{#addresses}}Address={{street}};{{/addresses}}{{/children}}',
      { items: [{ itemId: 'child-1', values: { name: 'Ava', addresses: { items: [] } } }] }
    );

    expect(text).toContain('Child=Ava;');
    expect(text).not.toContain('Address=');
  });
});

// ============================================================================
// LIST2-6: list-bound choice values resolve to their item's label
// ============================================================================

const ownersConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'owner-name', alias: 'ownerName', type: 'short_text', title: 'Name', order: 0 },
  ],
  labelTemplate: '{ownerName}',
};

function dynamicListChoiceConfig(listVariable: string): ChoiceAdvancedConfig {
  return {
    display: 'dropdown',
    allowMultiple: false,
    options: {
      type: 'list',
      listVariable,
      labelPath: 'ownerName',
      valuePath: 'itemId',
    },
  };
}

async function renderVars(
  template: string,
  stepValues: Record<string, unknown>,
  steps: ListStepConfigSource[]
): Promise<{ data: Record<string, unknown>; text: string }> {
  const data = normalizeVariables(stepValues, {
    listConfigs: getListConfigsByAlias(steps),
    listBoundChoices: getChoiceListBindingsByAlias(steps),
  });
  const output = await new TemplateParser().render({
    templatePath: 'list-choice-fixture.docx',
    templateBuffer: createDocxFixture(template),
    data,
  });
  return { data, text: extractText(output) };
}

describe('List-bound choice values in document templates (LIST2-6)', () => {
  const ownersStep: ListStepConfigSource = { id: 'owners-step', alias: 'owners', type: 'list', config: ownersConfig };
  const favoriteOwnerStep: ListStepConfigSource = {
    id: 'favorite-owner-step',
    alias: 'favoriteOwner',
    type: 'choice',
    config: dynamicListChoiceConfig('owners'),
  };

  const owners: ListValue = {
    items: [
      { itemId: 'owner-1', values: { ownerName: 'Ava Whitmore' } },
      { itemId: 'owner-2', values: { ownerName: 'Noah Blake' } },
    ],
  };

  it('resolves the selected itemId to the source list item\'s label (AC1, AC2)', async () => {
    const { text } = await renderVars(
      '{{favoriteOwner}}',
      { owners, favoriteOwner: 'owner-1' },
      [ownersStep, favoriteOwnerStep]
    );

    expect(text.trim()).toBe('Ava Whitmore');
    expect(text).not.toContain('owner-1');
  });

  it('falls back to the raw stored value when the item no longer exists (AC3)', async () => {
    const { text } = await renderVars(
      '{{favoriteOwner}}',
      { owners, favoriteOwner: 'deleted-owner-id' },
      [ownersStep, favoriteOwnerStep]
    );

    expect(text.trim()).toBe('deleted-owner-id');
  });

  it('resolves every selected id for a multi-select list-bound choice (AC4)', async () => {
    const multiSelectStep: ListStepConfigSource = {
      ...favoriteOwnerStep,
      config: { ...dynamicListChoiceConfig('owners'), display: 'multiple', allowMultiple: true },
    };

    const data = normalizeVariables(
      { owners, favoriteOwner: ['owner-1', 'owner-2'] },
      {
        listConfigs: getListConfigsByAlias([ownersStep, multiSelectStep]),
        listBoundChoices: getChoiceListBindingsByAlias([ownersStep, multiSelectStep]),
      }
    );

    expect(data.favoriteOwner).toEqual(['Ava Whitmore', 'Noah Blake']);
  });

  it('leaves a non-list-bound (static options) choice step completely unaffected (AC6)', async () => {
    const staticChoiceStep: ListStepConfigSource = {
      id: 'plan-step',
      alias: 'plan',
      type: 'choice',
      config: {
        display: 'dropdown',
        allowMultiple: false,
        options: { type: 'static', options: [{ id: 'basic', alias: 'basic', label: 'Basic' }] },
      } satisfies ChoiceAdvancedConfig,
    };

    const bindings = getChoiceListBindingsByAlias([staticChoiceStep]);
    expect(bindings.plan).toBeUndefined();

    const { text } = await renderVars('{{plan}}', { plan: 'basic' }, [staticChoiceStep]);
    expect(text.trim()).toBe('basic');
  });
});
