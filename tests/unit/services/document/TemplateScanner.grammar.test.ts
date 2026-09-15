/**
 * Upload validation must use the same grammar the renderer does (TPL D2).
 *
 * TemplateScanner used to compile with docxtemplater's DEFAULT parser, which
 * accepts any tag text as one opaque variable name. So a template written in the
 * deleted prefix grammar — `{{defaultValue x "y"}}` — passed upload and then failed
 * every tag at render: 12 production templates did exactly that and produced no
 * documents (2026-09-14). The scanner now compiles with RenderCore's own parser.
 */
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { templateScanner } from '../../../../server/services/document/TemplateScanner';

/** A minimal but real DOCX whose body is the given text, one run per paragraph. */
function docxWith(...paragraphs: string[]): Buffer {
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
  const paragraph = (text: string): string => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraph).join('')}</w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

describe('TemplateScanner — upload validation uses the renderer grammar', () => {
  it('rejects the deleted prefix grammar, naming the tag', async () => {
    const result = await templateScanner.scanAndFix(docxWith('Client: {{defaultValue client_name "Not provided"}}'));

    expect(result.isValid).toBe(false);
    expect((result.errors ?? []).join(' ')).toMatch(/scope parser|compil|unexpected token/i);
  });

  it('accepts the pipe grammar: filters, arguments, chaining', async () => {
    const result = await templateScanner.scanAndFix(docxWith(
      '{{ client_name | defaultValue:"Not provided" }}',
      '{{ estate_value | formatCurrency:"USD" }}',
      '{{ date_of_death | formatDate:"MMMM DD, YYYY" }}',
      '{{ name | trim | upper }}',
    ));

    expect(result.errors).toBeUndefined();
    expect(result.isValid).toBe(true);
  });

  it('accepts plain variables and sections', async () => {
    const result = await templateScanner.scanAndFix(docxWith('{{client.name}}', '{{#items}}{{title}}{{/items}}', '{{^flag}}none{{/flag}}'));

    expect(result.isValid).toBe(true);
  });

  it('rejects an unknown filter', async () => {
    const result = await templateScanner.scanAndFix(docxWith('{{ client_name | noSuchFilter }}'));

    expect(result.isValid).toBe(false);
  });
});
