import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';

import { TemplateParser } from '../../../server/services/document/TemplateParser';
import { TEMPLATE_FILTER_VOCABULARY } from '../../../server/services/docxHelpers';

/**
 * TemplateParser tests
 *
 * Renders real (in-memory) DOCX buffers through the full docxtemplater
 * pipeline. Originally regression coverage for the helper-tag parsing bug
 * where the expression parser split tags on /s+/ (the literal letter "s")
 * instead of whitespace; that bug lived in the legacy `{{helper value arg}}`
 * prefix grammar, which TPL-3 deletes outright (D1). The tests below were
 * ported from that prefix form to pipe filters (`{{ value | helper }}`) --
 * same helpers, same behavior, new grammar.
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

    it('should raise a template error for a variable absent from the data (D3)', async () => {
      // D3: unknown (typo'd/deleted-question) is loud, not a silent blank.
      await expect(render('Value: [{{missingVar}}]', {})).rejects.toThrow(/missingVar/);
    });

    it('should render a variable present but null as empty string (D3)', async () => {
      // D3: present-but-empty (respondent skipped an optional field) is
      // still a silent blank -- only "not in the data contract" raises.
      const text = await render('Value: [{{missingVar}}]', { missingVar: null });
      expect(text).toContain('Value: []');
    });
  });

  describe('helper tags as pipe filters (D1: legacy prefix grammar removed by TPL-3)', () => {
    it('should call upper as a pipe filter on a variable', async () => {
      const text = await render('Shout: {{ name | upper }}', { name: 'ada lovelace' });
      expect(text).toContain('Shout: ADA LOVELACE');
    });

    it('should call upper on aliases containing the letter s', async () => {
      // Historical regression: a broken /s+/ regex split "upper status" into
      // garbage whenever the tag contained an "s". No longer reachable code
      // (the whole prefix-tokenizer path is gone), but the alias still needs
      // to work under the current grammar.
      const text = await render('Status: {{ status | upper }}', { status: 'passed' });
      expect(text).toContain('Status: PASSED');
    });

    it('should call formatDate with a quoted format argument', async () => {
      const text = await render('Born: {{ dob | formatDate:"MM/DD/YYYY" }}', {
        dob: '2000-01-15T12:00:00Z',
      });
      expect(text).toMatch(/Born: 01\/1[45]\/2000/); // day depends on local TZ
    });

    it('should call formatDate with a quoted multi-word format', async () => {
      // Local-time date keeps the assertion timezone-independent
      const dob = new Date(2025, 10, 14, 15, 30);
      const text = await render('Signed: {{ dob | formatDate:"MMMM DD, YYYY \'at\' h:mm A" }}', {
        dob,
      });
      expect(text).toContain('Signed: November 14, 2025 at 3:30 PM');
    });

    it('should call formatCurrency with a quoted currency-code argument', async () => {
      const text = await render('Total: {{ amount | formatCurrency:"USD" }}', { amount: 1234.5 });
      expect(text).toContain('Total: $1,234.50');
    });

    it('should resolve filter arguments that reference other variables', async () => {
      const text = await render(
        'Total: {{ total | formatCurrency:currencyCode }} for {{ price | multiply:quantity }} units',
        {
          total: 99.5,
          currencyCode: 'USD',
          price: 3,
          quantity: 4,
        }
      );
      expect(text).toContain('Total: $99.50');
      expect(text).toContain('for 12 units');
    });

    it('should call a filter on a nested dot path', async () => {
      const text = await render('{{ client.name | upper }}', {
        client: { name: 'acme co' },
      });
      expect(text).toContain('ACME CO');
    });

    it('should render a safe fallback when a filter cannot make sense of its input', async () => {
      const text = await render('X: [{{ notANumber | formatNumber }}]', {
        notANumber: { bad: true },
      });
      // formatNumber's own NaN guard returns '0' rather than throwing --
      // helper-level robustness, not a rendering concern of this ticket.
      expect(text).toMatch(/X: \[.*\]/);
    });
  });

  describe('TPL-3: filter vocabulary, prefix-syntax removal, and strict-undefined', () => {
    it('AC1: exports a named preset vocabulary covering date, currency, number and case transforms', () => {
      expect(TEMPLATE_FILTER_VOCABULARY.longdate).toBeDefined();
      expect(TEMPLATE_FILTER_VOCABULARY.usd).toBeDefined();
      expect(TEMPLATE_FILTER_VOCABULARY.number).toBeDefined();
      expect(TEMPLATE_FILTER_VOCABULARY.titlecase).toBeDefined();
      expect(TEMPLATE_FILTER_VOCABULARY.default).toBeDefined();
      // One line of real documentation per preset, not an empty placeholder.
      for (const doc of Object.values(TEMPLATE_FILTER_VOCABULARY)) {
        expect(typeof doc).toBe('string');
        expect(doc.length).toBeGreaterThan(10);
      }
    });

    it('AC2: named presets render correctly with no quotes in the template', async () => {
      const text = await render('Signed {{ signing_date | longdate }} for {{ fee | usd }}', {
        signing_date: '2026-01-05T12:00:00Z',
        fee: 1234.5,
      });
      expect(text).toContain('Signed January 5, 2026 for $1,234.50');
    });

    it('AC3 (regression): the deleted prefix form raises a template error naming the tag, not a silent render', async () => {
      await expect(
        render('{{formatDate dob "MMMM DD, YYYY"}}', { dob: '2025-11-14T00:00:00Z' })
      ).rejects.toThrow(/formatDate dob/);
    });

    it('AC6: | default renders the fallback for both an absent and a present-but-empty variable', async () => {
      const absent = await render('[{{ nope | default:"N/A" }}]', {});
      expect(absent).toContain('[N/A]');

      const empty = await render('[{{ nope | default:"N/A" }}]', { nope: null });
      expect(empty).toContain('[N/A]');
    });

    it('AC7 (regression): an unknown filter name raises a template error naming it', async () => {
      await expect(render('{{ fee | no_such_filter }}', { fee: 250 })).rejects.toThrow(/no_such_filter/);
    });

    it('AC8 (regression): a curly-quoted filter argument still renders correctly', async () => {
      const text = await render('{{ d | formatDate:“MM/DD/YYYY” }}', {
        d: '2026-01-05T12:00:00Z',
      });
      expect(text).toContain('01/05/2026');
    });

    it('a field missing on one loop item but present on another renders blank, not a raise', async () => {
      // Strict-undefined (D3) only classifies TOP-LEVEL variables -- inside a
      // loop, scopeList holds arbitrary per-item data (List answers,
      // DataVault rows) with no guarantee every item shares the same keys.
      // Regression: this exact shape raised for every render before the
      // scopeList-depth check was added, which would have broken any List
      // question with an optional per-item field.
      const text = await render('{{#items}}{{name}}:[{{label}}] {{/items}}', {
        items: [{ name: 'A', label: 'first' }, { name: 'B' }],
      });
      expect(text).toContain('A:[first] B:[]');
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

    it('should render an array used as a scalar tag as joined text', async () => {
      const text = await render('Hobbies: {{hobbies}}', { hobbies: ['biking', 'hiking'] });
      expect(text).toContain('Hobbies: biking, hiking');
    });

    it('should support the same array in both loop and scalar positions', async () => {
      const text = await render('{{#tags}}[{{.}}]{{/tags}} Summary: {{tags}}', {
        tags: ['red', 'blue'],
      });
      expect(text).toContain('[red][blue]');
      expect(text).toContain('Summary: red, blue');
    });

    it('should render loops over arrays of objects with amounts', async () => {
      const text = await render(
        '{{#lineItems}}{{description}}: {{ amount | formatCurrency:"USD" }}; {{/lineItems}}',
        {
          lineItems: [
            { description: 'Widget', amount: 10 },
            { description: 'Gadget', amount: 20.5 },
          ],
        }
      );
      expect(text).toContain('Widget: $10.00');
      expect(text).toContain('Gadget: $20.50');
    });
  });
});
