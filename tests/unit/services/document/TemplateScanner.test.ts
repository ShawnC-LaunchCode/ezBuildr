import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';

import { templateScanner } from '../../../../server/services/document/TemplateScanner';

/**
 * TPL-4: TemplateScanner has never had a unit test, despite running on every
 * single template upload (`templateScanner.scanAndFix()`, two call sites in
 * `server/routes/templates.routes.ts`). This file is the first coverage.
 *
 * Two things are under test:
 *  - AC1/AC2: curly-quote normalisation is scoped to `{{ }}` placeholder
 *    bodies, never to ordinary document prose.
 *  - AC3/AC4/AC5: `repairXml()` strips inline (run/paragraph) tags from
 *    inside a placeholder but leaves a structural (table cell/row) boundary
 *    alone and reports it as an error, per Decision D2 (loud failures for
 *    objectively broken templates).
 *
 * TPL-2 shipped a real bug in this exact area (a raw-XML scan that compared
 * markup instead of text, so it hard-failed templates Word had validly split
 * across runs). Every split-tag case here is therefore built as genuinely
 * split XML -- never pre-merged -- and, where the ticket claims something
 * "still renders", it is proven by an actual Docxtemplater render, not just
 * a successful `compile()`.
 */

/** Build a minimal valid DOCX buffer whose body is the given raw XML. */
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

/** Extract the raw word/document.xml text from a DOCX buffer. */
function documentXmlOf(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return zip.file('word/document.xml')?.asText() ?? '';
}

/** Render a DOCX buffer with docxtemplater's default (no-filter) parser and return plain text. */
function renderPlain(buffer: Buffer, data: Record<string, unknown>): string {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    // Trim the tag before lookup. Spaces inside the braces are normal in the
    // shipped grammar ({{ client_name | upper }}), but docxtemplater's DEFAULT
    // parser looks up the raw tag text -- so ' client_name ' misses and renders
    // "undefined". This is only about the harness resolving a variable; the
    // scanner behaviour under test is unaffected either way.
    parser: (tag: string) => ({
      get: (scope: Record<string, unknown>): unknown => scope[tag.trim()],
    }),
  });
  doc.render(data);
  const xml = doc.getZip().file('word/document.xml')?.asText() ?? '';
  // The fixture wraps <w:body> in newlines and indentation for readability, so
  // strip surrounding whitespace -- we are asserting rendered text, not layout.
  return xml.replace(/<[^>]+>/g, '').trim();
}

describe('TemplateScanner (TPL-4)', () => {
  describe('AC1/AC2: curly-quote normalisation is scoped to placeholder bodies', () => {
    it('AC1: straightens curly quotes inside a placeholder before validation and storage', async () => {
      const bodyXml =
        '<w:p><w:r><w:t>{{ effective_date | formatDate:“MM/DD/YYYY” }}</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      const outXml = documentXmlOf(result.buffer);
      expect(outXml).toContain('formatDate:"MM/DD/YYYY"');
      expect(outXml).not.toContain('“');
      expect(outXml).not.toContain('”');
    });

    it('AC1: straightens curly single quotes (apostrophes) inside a placeholder', async () => {
      const bodyXml = '<w:p><w:r><w:t>{{ note | default:‘n/a’ }}</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      const outXml = documentXmlOf(result.buffer);
      expect(outXml).toContain("default:'n/a'");
      expect(outXml).not.toContain('‘');
      expect(outXml).not.toContain('’');
    });

    it('AC1: normalises a curly-quoted placeholder argument even when Word has split the tag across runs', async () => {
      // Word's autocorrect fires mid-typing, so the quote character and the
      // rest of the tag routinely land in different <w:t> runs. The
      // placeholder-matching regex must still see this as one span.
      const bodyXml =
        '<w:p>' +
        '<w:r><w:t>{{ effective_date | formatDate:</w:t></w:r>' +
        '<w:r><w:t>“MM/DD/YYYY” }}</w:t></w:r>' +
        '</w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      const outXml = documentXmlOf(result.buffer);
      expect(outXml).toContain('formatDate:"MM/DD/YYYY"');
      expect(outXml).not.toContain('“');
      expect(outXml).not.toContain('”');
    });

    it('AC2: leaves curly quotes in ordinary document prose untouched', async () => {
      const bodyXml =
        '<w:p><w:r><w:t>The parties agree to the “Settlement Amount” defined below, ' +
        "and the client’s obligations survive termination.</w:t></w:r></w:p>";
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      const outXml = documentXmlOf(result.buffer);
      expect(outXml).toContain('“Settlement Amount”');
      expect(outXml).toContain('client’s obligations');
    });

    it('AC2: normalises quotes inside a placeholder while leaving nearby prose quotes alone in the same document', async () => {
      const bodyXml =
        '<w:p><w:r><w:t>Per the “Agreement”, the due date is ' +
        '{{ due_date | formatDate:“MM/DD/YYYY” }}.</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      const outXml = documentXmlOf(result.buffer);
      // Prose quote around "Agreement" survives.
      expect(outXml).toContain('“Agreement”');
      // Placeholder quote is straightened.
      expect(outXml).toContain('formatDate:"MM/DD/YYYY"');
    });
  });

  describe('AC3: a placeholder split across <w:t>/<w:r> boundaries still repairs and renders', () => {
    it('repairXml() strips the inline run tags and reports the repair', () => {
      const xml =
        '<w:p><w:r><w:t>{{ client_name </w:t></w:r><w:r><w:t> }}</w:t></w:r></w:p>';

      const { xml: repaired, repairs, errors } = templateScanner.repairXml(xml);

      expect(errors).toEqual([]);
      expect(repairs.some((r) => /hidden XML formatting tags/i.test(r))).toBe(true);
      expect(repaired).toContain('{{ client_name  }}');
      expect(repaired).not.toMatch(/\{\{[^}]*<[^}]*\}\}/);
    });

    it('scanAndFix() repairs a run-split placeholder end to end and the result still renders', async () => {
      // No internal whitespace in the tag body: docxtemplater's default
      // (no custom parser) get() does a literal, untrimmed property lookup,
      // so this exercises the repair path without also depending on the
      // app's angular-expressions parser trimming the tag for us.
      const bodyXml =
        '<w:p><w:r><w:t>Dear {{client_na</w:t></w:r><w:r><w:t>me}}, welcome.</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.errors).toBeUndefined();

      const text = renderPlain(result.buffer, { client_name: 'Ada Lovelace' });
      expect(text).toBe('Dear Ada Lovelace, welcome.');
    });
  });

  describe('AC4: a placeholder split across </w:p><w:p> still repairs and renders', () => {
    it('repairXml() strips the paragraph-boundary tags and reports the repair', () => {
      const xml =
        '<w:p><w:r><w:t>{{ client_name </w:t></w:r></w:p><w:p><w:r><w:t> }}</w:t></w:r></w:p>';

      const { xml: repaired, repairs, errors } = templateScanner.repairXml(xml);

      expect(errors).toEqual([]);
      expect(repairs.some((r) => /hidden XML formatting tags/i.test(r))).toBe(true);
      expect(repaired).toContain('{{ client_name  }}');
      // The two paragraphs are merged into one balanced <w:p>...</w:p>.
      expect((repaired.match(/<w:p>/g) ?? []).length).toBe(1);
      expect((repaired.match(/<\/w:p>/g) ?? []).length).toBe(1);
    });

    it('scanAndFix() repairs a paragraph-split placeholder end to end and the result still renders', async () => {
      const bodyXml =
        '<w:p><w:r><w:t>Dear {{client_name</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>}}, welcome.</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.errors).toBeUndefined();

      const text = renderPlain(result.buffer, { client_name: 'Ada Lovelace' });
      expect(text).toBe('Dear Ada Lovelace, welcome.');
    });
  });

  describe('AC5: a placeholder spanning a table-cell/row boundary is not silently repaired', () => {
    it('repairXml() leaves a cell-spanning placeholder untouched and reports a structural error', () => {
      const xml =
        '<w:tbl><w:tr>' +
        '<w:tc><w:p><w:r><w:t>{{ guardian_name </w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t> }}</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>';

      const { xml: repaired, errors } = templateScanner.repairXml(xml);

      // Nothing was rewritten -- the two cells are still two cells.
      expect(repaired).toBe(xml);
      expect(repaired).toContain('</w:tc><w:tc>');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/structural/i);
      expect(errors[0]).toContain('w:tc');
    });

    it('scanAndFix() hard-fails the upload for a cell-spanning placeholder and leaves the buffer untouched', async () => {
      const bodyXml =
        '<w:tbl><w:tr>' +
        '<w:tc><w:p><w:r><w:t>{{ guardian_name </w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t> }}</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(false);
      expect(result.fixed).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0]).toMatch(/structural/i);

      // The two cells genuinely survive intact -- the returned buffer is
      // the original, unmodified input.
      const outXml = documentXmlOf(result.buffer);
      expect(outXml).toContain('</w:tc><w:tc>');
    });

    it('repairXml() leaves a row-spanning placeholder untouched and reports a structural error', () => {
      const xml =
        '<w:tbl>' +
        '<w:tr><w:tc><w:p><w:r><w:t>{{ row_marker </w:t></w:r></w:p></w:tc></w:tr>' +
        '<w:tr><w:tc><w:p><w:r><w:t> }}</w:t></w:r></w:p></w:tc></w:tr>' +
        '</w:tbl>';

      const { xml: repaired, errors } = templateScanner.repairXml(xml);

      expect(repaired).toBe(xml);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('AC6 support: normal (non-split, non-curly) placeholders are unaffected', () => {
    it('repairXml() is a no-op for an intact placeholder with no repairs or errors', () => {
      const xml = '<w:p><w:r><w:t>{{ client_name }}</w:t></w:r></w:p>';

      const { xml: repaired, repairs, errors } = templateScanner.repairXml(xml);

      expect(repaired).toBe(xml);
      expect(repairs).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('scanAndFix() validates a clean template with no repairs needed', async () => {
      const bodyXml = '<w:p><w:r><w:t>Dear {{ client_name }}, welcome.</w:t></w:r></w:p>';
      const buffer = createDocxBuffer(bodyXml);

      const result = await templateScanner.scanAndFix(buffer);

      expect(result.isValid).toBe(true);
      expect(result.fixed).toBe(false);
      expect(result.repairs).toEqual([]);

      const text = renderPlain(result.buffer, { client_name: 'Ada' });
      expect(text).toBe('Dear Ada, welcome.');
    });
  });
});
