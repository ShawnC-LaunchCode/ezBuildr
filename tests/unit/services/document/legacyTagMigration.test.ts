/**
 * The prefix-grammar conversion that repairs the AI-built estate templates.
 *
 * The three tag forms below are exactly the three found in production's 12
 * files (144 tags: 108 defaultValue, 24 formatCurrency, 12 formatDate). The
 * decisive check is behavioural: the original fixture must FAIL to render with
 * the real renderer (reproducing production), and the converted one must render
 * the values the old helpers would have produced.
 */
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { docxHelpers } from '../../../../server/services/docxHelpers';
import { convertLegacyPrefixTags } from '../../../../server/services/document/legacyTagMigration';
import { renderDocxBuffer } from '../../../../server/services/document/RenderCore';

const FILTERS = new Set(Object.keys(docxHelpers));

/** A minimal but real DOCX: one paragraph run per entry in `runs`. */
function docxWith(paragraphs: string[][]): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  const run = (text: string): string => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
  const paragraph = (runs: string[]): string => `<w:p>${runs.map(run).join('')}</w:p>`;
  const body = paragraphs.map(paragraph).join('');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

const textOf = (docx: Buffer): string =>
  (new PizZip(docx).file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');

const PRODUCTION_FORMS = docxWith([
  ['Decedent: {{defaultValue decedent_name "Not provided"}}'],
  ['Assets: {{formatCurrency estimated_probate_assets "USD"}}'],
  ['Died: {{formatDate date_of_death "MMMM DD, YYYY"}}'],
]);
const DATA = { decedent_name: '', estimated_probate_assets: 1234.5, date_of_death: '2026-03-05' };

describe('convertLegacyPrefixTags', () => {
  it('the original fails to render — the fixture reproduces production', async () => {
    await expect(renderDocxBuffer({ templatePath: '', templateBuffer: PRODUCTION_FORMS, data: DATA }))
      .rejects.toThrow(/Scope parser|Template syntax|compil/i);
  });

  it('rewrites the three production forms and the result renders the same values', async () => {
    const result = convertLegacyPrefixTags(PRODUCTION_FORMS, FILTERS);

    expect(result.unconvertible).toEqual([]);
    expect(result.converted.map((c) => c.to)).toEqual([
      '{{ decedent_name | defaultValue:"Not provided" }}',
      '{{ estimated_probate_assets | formatCurrency:"USD" }}',
      '{{ date_of_death | formatDate:"MMMM DD, YYYY" }}',
    ]);

    const rendered = textOf(await renderDocxBuffer({ templatePath: '', templateBuffer: result.buffer, data: DATA }));
    expect(rendered).toContain('Decedent: Not provided');
    expect(rendered).toContain('Assets: $1,234.50');
    expect(rendered).toContain('Died: March 05, 2026');
  });

  it("accepts Word's curly quotes and XML-escaped quotes", () => {
    const result = convertLegacyPrefixTags(docxWith([
      ['{{defaultValue a “None”}}'],
      ['{{defaultValue b &quot;None&quot;}}'],
    ]), FILTERS);
    expect(result.converted.map((c) => c.to)).toEqual([
      '{{ a | defaultValue:"None" }}',
      '{{ b | defaultValue:"None" }}',
    ]);
  });

  it('leaves pipe, plain and section tags untouched, and returns the input unchanged when nothing converts', () => {
    const doc = docxWith([['{{ a | upper }} {{b}} {{#items}}{{name}}{{/items}} {{First Name}}']]);
    const result = convertLegacyPrefixTags(doc, FILTERS);
    expect(result.converted).toEqual([]);
    expect(result.unconvertible).toEqual([]);
    expect(result.buffer).toBe(doc);
  });

  it('reports — and does not touch — a prefix tag split across Word runs or a section helper', () => {
    const result = convertLegacyPrefixTags(docxWith([
      ['{{defaultValue ', 'client "x"}}'],
      ['{{#isEmpty addOns}}none{{/isEmpty}}'],
    ]), FILTERS);
    expect(result.converted).toEqual([]);
    expect(result.unconvertible.map((u) => u.reason)).toEqual([
      'split across Word runs',
      'section helper — its meaning differs in the pipe grammar',
    ]);
  });
});
