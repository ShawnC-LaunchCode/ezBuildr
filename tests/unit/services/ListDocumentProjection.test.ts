import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { TemplateParser } from '../../../server/services/document/TemplateParser';
import {
  getListConfigsByAlias,
  normalizeVariables,
} from '../../../server/services/document/VariableNormalizer';
import type {
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
