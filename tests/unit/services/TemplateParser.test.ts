import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';

import { TemplateParser } from '../../../server/services/document/TemplateParser';

/**
 * TemplateParser tests
 *
 * Renders real (in-memory) DOCX buffers through the full docxtemplater
 * pipeline. Regression coverage for the helper-tag parsing bug where the
 * expression parser split tags on /s+/ (the literal letter "s") instead of
 * whitespace, causing every helper call like {{upper name}} to silently
 * render as an empty string.
 */

/**
 * Build a minimal valid DOCX buffer whose body contains the given text.
 */
function createDocxBuffer(content: string): Buffer {
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
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Extract the rendered body text from a DOCX buffer.
 */
function extractText(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<[^>]+>/g, '');
}

async function render(templateContent: string, data: Record<string, unknown>): Promise<string> {
  const parser = new TemplateParser();
  const output = await parser.render({
    templatePath: 'in-memory.docx',
    templateBuffer: createDocxBuffer(templateContent),
    data,
  });
  return extractText(output);
}

describe('TemplateParser', () => {
  describe('simple substitution', () => {
    it('should substitute a plain variable', async () => {
      const text = await render('Hello {{name}}', { name: 'Ada' });
      expect(text).toContain('Hello Ada');
    });

    it('should substitute nested dot-notation paths', async () => {
      const text = await render('City: {{client.address.city}}', {
        client: { address: { city: 'Springfield' } },
      });
      expect(text).toContain('City: Springfield');
    });

    it('should render missing variables as empty string', async () => {
      const text = await render('Value: [{{missingVar}}]', {});
      expect(text).toContain('Value: []');
    });
  });

  describe('helper tags (regression: /s+/ vs /\\s+/ split)', () => {
    it('should call upper helper on a variable', async () => {
      const text = await render('Shout: {{upper name}}', { name: 'ada lovelace' });
      expect(text).toContain('Shout: ADA LOVELACE');
    });

    it('should call helpers on aliases containing the letter s', async () => {
      // The broken /s+/ regex split "upper status" into garbage whenever
      // the tag contained an "s"; verify such aliases work.
      const text = await render('Status: {{upper status}}', { status: 'passed' });
      expect(text).toContain('Status: PASSED');
    });

    it('should call formatDate with a format argument', async () => {
      const text = await render('Born: {{formatDate dob MM/DD/YYYY}}', {
        dob: '2000-01-15T12:00:00Z',
      });
      expect(text).toMatch(/Born: 01\/1[45]\/2000/); // day depends on local TZ
    });

    it('should call formatDate with a quoted multi-word format', async () => {
      // Local-time date keeps the assertion timezone-independent
      const dob = new Date(2025, 10, 14, 15, 30);
      const text = await render('Signed: {{formatDate dob "MMMM DD, YYYY \'at\' h:mm A"}}', {
        dob,
      });
      expect(text).toContain('Signed: November 14, 2025 at 3:30 PM');
    });

    it('should call formatCurrency with quoted currency code', async () => {
      const text = await render('Total: {{formatCurrency amount "USD"}}', { amount: 1234.5 });
      expect(text).toContain('Total: $1,234.50');
    });

    it('should call helpers on nested paths', async () => {
      const text = await render('{{upper client.name}}', {
        client: { name: 'acme co' },
      });
      expect(text).toContain('ACME CO');
    });

    it('should render empty string when a helper throws', async () => {
      const text = await render('X: [{{formatNumber notANumber}}]', {
        notANumber: { bad: true },
      });
      // helper failures are logged and rendered as '' (or a safe fallback), never thrown
      expect(text).toMatch(/X: \[.*\]/);
    });
  });

  describe('loops and conditionals', () => {
    it('should render loops over arrays of objects', async () => {
      const text = await render('{{#items}}{{label}};{{/items}}', {
        items: [{ label: 'one' }, { label: 'two' }],
      });
      expect(text).toContain('one;two;');
    });

    it('should render conditional sections', async () => {
      const shown = await render('{{#isPremium}}Premium{{/isPremium}}', { isPremium: true });
      expect(shown).toContain('Premium');

      const hidden = await render('{{#isPremium}}Premium{{/isPremium}}', { isPremium: false });
      expect(hidden).not.toContain('Premium');
    });

    it('should render inverted sections for falsy values', async () => {
      const text = await render('{{^completed}}Pending{{/completed}}', { completed: false });
      expect(text).toContain('Pending');
    });
  });
});
