import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocxBuffer } from '../../../../server/services/document/RenderCore';

/**
 * Executable examples for docs/guides/VARIABLES_IN_DOCUMENTS.md.
 *
 * Each sample renders an in-memory DOCX through the production entry point.
 * Structural samples assert the resulting Word rows/cells so a flattened-text
 * assertion cannot hide an empty marker row.
 */

function createDocxBuffer(bodyXml: string): Buffer {
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
  <w:body>${bodyXml}</w:body>
</w:document>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function cell(text: string): string {
  return `<w:tc>${paragraph(text)}</w:tc>`;
}

function row(...cells: string[]): string {
  return `<w:tr>${cells.map(cell).join('')}</w:tr>`;
}

function table(...rows: string[]): string {
  return `<w:tbl>${rows.join('')}</w:tbl>`;
}

function plainText(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

interface RenderedDocx {
  text: string;
  rowCells: string[][];
}

function extractElements(xml: string, tagName: string): string[] {
  const elements: string[] = [];
  const opening = `<${tagName}`;
  const closing = `</${tagName}>`;
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf(opening, cursor);
    if (start === -1) { break; }

    const openingEnd = xml.indexOf('>', start + opening.length);
    const end = xml.indexOf(closing, openingEnd + 1);
    if (openingEnd === -1 || end === -1) { break; }

    const afterEnd = end + closing.length;
    elements.push(xml.slice(start, afterEnd));
    cursor = afterEnd;
  }

  return elements;
}

async function render(
  bodyXml: string,
  data: Record<string, unknown>,
  workflowSettings?: unknown
): Promise<RenderedDocx> {
  const buffer = await renderDocxBuffer({
    templatePath: 'documented-sample.docx',
    templateBuffer: createDocxBuffer(bodyXml),
    data,
    workflowSettings,
  });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  const renderedRows = extractElements(xml, 'w:tr');
  const rowCells = renderedRows.map((renderedRow) => {
    const cells = extractElements(renderedRow, 'w:tc');
    return cells.map(plainText);
  });

  return { text: plainText(xml), rowCells };
}

async function renderTag(
  tag: string,
  data: Record<string, unknown>,
  workflowSettings?: unknown
): Promise<string> {
  return (await render(paragraph(tag), data, workflowSettings)).text;
}

describe('documented template-language samples', () => {
  describe('variables and expressions', () => {
    it.each([
      {
        sample: 'V1 simple variable',
        tag: '{{client_name}}',
        data: { client_name: 'Ada Lovelace' },
        expected: 'Ada Lovelace',
      },
      {
        sample: 'V2 nested path',
        tag: '{{client.address.city}}',
        data: { client: { address: { city: 'Chicago' } } },
        expected: 'Chicago',
      },
      {
        sample: 'V3 array index',
        tag: '{{Children[0].name}}',
        data: { Children: [{ name: 'Ada' }, { name: 'Alan' }] },
        expected: 'Ada',
      },
      {
        sample: 'V4 chained filters',
        tag: '{{client_name | trim | upper}}',
        data: { client_name: '  Ada Lovelace  ' },
        expected: 'ADA LOVELACE',
      },
    ])('$sample renders $expected', async ({ tag, data, expected }) => {
      await expect(renderTag(tag, data)).resolves.toBe(expected);
    });

    it('V5 comparison sections render only when the expression is true', async () => {
      const template = '{{#count > 9}}Additional schedule attached.{{/count > 9}}';

      await expect(renderTag(template, { count: 10 })).resolves.toBe('Additional schedule attached.');
      await expect(renderTag(template, { count: 9 })).resolves.toBe('');
    });
  });

  describe('documented filter vocabulary', () => {
    it.each([
      { filter: 'longdate', value: '2026-01-05', expected: 'January 5, 2026' },
      { filter: 'shortdate', value: '2026-01-05', expected: '01/05/2026' },
      { filter: 'usd', value: 1234.5, expected: '$1,234.50' },
      { filter: 'currency:"USD"', value: 1234.5, expected: '$1,234.50' },
      { filter: 'number', value: 1234.5, expected: '1,235' },
      { filter: 'percent', value: 42.345, expected: '42%' },
      { filter: 'upper', value: 'Ada Lovelace', expected: 'ADA LOVELACE' },
      { filter: 'lower', value: 'ADA@EXAMPLE.COM', expected: 'ada@example.com' },
      { filter: 'titlecase', value: 'ada lovelace', expected: 'Ada Lovelace' },
      { filter: 'yesno', value: true, expected: 'Yes' },
      { filter: 'trim', value: '  signed  ', expected: 'signed' },
      { filter: 'default:"N/A"', value: '', expected: 'N/A' },
    ])('{{value | $filter}} renders $expected', async ({ filter, value, expected }) => {
      await expect(renderTag(`{{value | ${filter}}}`, { value })).resolves.toBe(expected);
    });

    it('F13 filter arguments use colon syntax and can reference another variable', async () => {
      await expect(renderTag('{{amount | add:tax}}', { amount: 100, tax: 8 })).resolves.toBe('108');
    });

    it('F14 parenthesised filter arguments do not parse', async () => {
      await expect(renderTag('{{name | default("N/A")}}', { name: '' })).rejects.toThrow(
        /Template syntax error/i
      );
    });

    it('F15 Word smart quotes around a filter argument are normalised', async () => {
      await expect(
        renderTag('{{date_of_birth | formatDate:“MM/DD/YYYY”}}', { date_of_birth: '2026-01-05' })
      ).resolves.toBe('01/05/2026');
    });
  });

  describe('dates, missing values, and reserved delimiters', () => {
    it('D1 addMonths clamps a month-end date to the destination month end', async () => {
      await expect(renderTag('{{start_date | addMonths:1}}', { start_date: '2026-01-31' })).resolves.toBe(
        '02/28/2026'
      );
    });

    it('D2 addBusinessDays uses the workflow calendar', async () => {
      await expect(
        renderTag(
          '{{signing | addBusinessDays:1}}',
          { signing: '2026-01-16' },
          { businessDayCalendar: 'us-federal' }
        )
      ).resolves.toBe('01/20/2026');
    });

    it('D3 nextBusinessDay rolls forward over non-business days', async () => {
      await expect(renderTag('{{deadline | nextBusinessDay}}', { deadline: '2026-01-04' })).resolves.toBe(
        '01/05/2026'
      );
    });

    it('D4 businessDaysBetween excludes non-business dates', async () => {
      await expect(
        renderTag('{{start | businessDaysBetween:end}}', { start: '2026-01-03', end: '2026-01-11' })
      ).resolves.toBe('5');
    });

    it('D5 addWeekdays is the weekends-only escape hatch', async () => {
      await expect(
        renderTag(
          '{{signing | addWeekdays:1}}',
          { signing: '2026-07-02' },
          { businessDayCalendar: 'us-federal' }
        )
      ).resolves.toBe('07/03/2026');
    });

    it('U1 a present but empty value renders blank', async () => {
      await expect(renderTag('Phone: [{{phone}}]', { phone: '' })).resolves.toBe('Phone: []');
    });

    it('U2 a missing top-level variable raises and names itself', async () => {
      await expect(renderTag('Phone: [{{phone}}]', {})).rejects.toThrow(/undefined variable "phone"/);
    });

    it('U3 default opts a missing variable out of strict-undefined', async () => {
      await expect(renderTag('{{phone | default:"Not provided"}}', {})).resolves.toBe('Not provided');
    });

    it.each([
      {
        sample: 'R1 docxtpl statement delimiter',
        template: '{% if approved %}Approved{% endif %}',
        tag: '{% if approved %}',
      },
      {
        sample: 'R2 Jinja comment delimiter',
        template: '{# drafting note #}',
        tag: '{# drafting note #}',
      },
    ])('$sample raises the documented reserved-syntax error', async ({ template, tag }) => {
      await expect(renderTag(template, { approved: true })).rejects.toThrow(
        `Template syntax error: statement syntax is reserved and not yet supported: ${tag}`
      );
    });
  });

  describe('structural Word recipes', () => {
    it('S1 repeats a table row and exposes the zero-based row index', async () => {
      const template = table(
        row('Child', 'Number'),
        row('{{#Children}}{{name}}', '{{$index}}{{/Children}}')
      );
      const result = await render(template, { Children: [{ name: 'Ada' }, { name: 'Alan' }] });

      expect(result.rowCells).toEqual([
        ['Child', 'Number'],
        ['Ada', '0'],
        ['Alan', '1'],
      ]);
    });

    it('S2 removes or keeps one conditional table row', async () => {
      const template = table(
        row('Role', 'Name'),
        row('{{#include_guardian}}Guardian', '{{guardian_name}}{{/include_guardian}}')
      );

      await expect(render(template, { include_guardian: false, guardian_name: 'Grace' })).resolves.toMatchObject({
        rowCells: [['Role', 'Name']],
      });
      await expect(render(template, { include_guardian: true, guardian_name: 'Grace' })).resolves.toMatchObject({
        rowCells: [
          ['Role', 'Name'],
          ['Guardian', 'Grace'],
        ],
      });
    });

    it('S3 supported multi-row conditional tags in content rows work in both directions', async () => {
      const template = table(
        row('Field', 'Value'),
        row('{{#show_details}}Address', '{{address}}'),
        row('Phone', '{{phone}}{{/show_details}}')
      );
      const data = { address: '1 Main St', phone: '312-555-0100' };

      await expect(render(template, { ...data, show_details: false })).resolves.toMatchObject({
        rowCells: [['Field', 'Value']],
      });
      await expect(render(template, { ...data, show_details: true })).resolves.toMatchObject({
        rowCells: [
          ['Field', 'Value'],
          ['Address', '1 Main St'],
          ['Phone', '312-555-0100'],
        ],
      });
    });

    it('S4 dedicated marker rows leave empty rows when true but disappear when false', async () => {
      const template = table(
        row('Field', 'Value'),
        row('{{#show_details}}', ''),
        row('Address', '{{address}}'),
        row('Phone', '{{phone}}'),
        row('', '{{/show_details}}')
      );
      const data = { address: '1 Main St', phone: '312-555-0100' };

      await expect(render(template, { ...data, show_details: false })).resolves.toMatchObject({
        rowCells: [['Field', 'Value']],
      });
      await expect(render(template, { ...data, show_details: true })).resolves.toMatchObject({
        rowCells: [
          ['Field', 'Value'],
          ['', ''],
          ['Address', '1 Main St'],
          ['Phone', '312-555-0100'],
          ['', ''],
        ],
      });
    });

    it('S5 nested loops repeat outer rows and inner values', async () => {
      const template = table(
        row('Person', 'Assets'),
        row('{{#people}}{{name}}', '{{#assets}}{{asset}} {{/assets}}{{/people}}')
      );
      const result = await render(template, {
        people: [
          { name: 'Ada Lovelace', assets: [{ asset: 'House' }, { asset: 'Car' }] },
          { name: 'Grace Hopper', assets: [{ asset: 'Boat' }] },
        ],
      });

      expect(result.rowCells).toEqual([
        ['Person', 'Assets'],
        ['Ada Lovelace', 'House Car'],
        ['Grace Hopper', 'Boat'],
      ]);
    });

    it('S6 a conditional section can sit mid-sentence', async () => {
      const template = 'Contingent Gift{{#has_children}} to My Children{{/has_children}}.';

      await expect(renderTag(template, { has_children: true })).resolves.toBe(
        'Contingent Gift to My Children.'
      );
      await expect(renderTag(template, { has_children: false })).resolves.toBe('Contingent Gift.');
    });

    it('S7 an object section pushes that object into scope', async () => {
      const template = table(row('{{#fees}}Filing fee', '{{filing | usd}}{{/fees}}'));

      await expect(render(template, { fees: { filing: 350 } })).resolves.toMatchObject({
        rowCells: [['Filing fee', '$350.00']],
      });
    });
  });
});
