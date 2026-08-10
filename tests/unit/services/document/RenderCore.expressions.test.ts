import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';

import { renderDocxBuffer } from '../../../../server/services/document/RenderCore';
import { docxHelpers } from '../../../../server/services/docxHelpers';

/**
 * TPL-2: expression layer -- pipe filters, chaining, comparisons, indexing,
 * counters.
 *
 * Every assertion here renders a real (in-memory) DOCX buffer through the
 * production `renderDocxBuffer` entry point, per the ticket's AC8 -- no
 * parser function is unit-tested in isolation.
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

/** Wrap plain text in a single paragraph/run so simple tags can skip the XML boilerplate. */
function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function run(text: string): string {
  return `<w:r><w:t>${text}</w:t></w:r>`;
}

/** Build a paragraph whose text is split across multiple runs -- mirrors how Word splits a tag across `<w:t>` boundaries (autocorrect, mid-edit typing). */
function splitRunParagraph(...segments: string[]): string {
  return `<w:p>${segments.map(run).join('')}</w:p>`;
}

/** Render `bodyXml` against `data` and return the plain text of the result. */
async function render(bodyXml: string, data: Record<string, unknown>): Promise<string> {
  const buffer = await renderDocxBuffer({
    templatePath: 'in-memory.docx',
    templateBuffer: createDocxBuffer(bodyXml),
    data,
  });
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<[^>]+>/g, '');
}

/** Render a single-tag paragraph against `data`. */
async function renderTag(tag: string, data: Record<string, unknown>): Promise<string> {
  return render(paragraph(`{{${tag}}}`), data);
}

describe('RenderCore expression layer (TPL-2)', () => {
  // AC1: every one of the 31 pre-existing helpers renders identically as a
  // pipe filter and via the legacy prefix form.
  describe('AC1: pipe filters match the legacy prefix form for all 31 helpers', () => {
    interface HelperCase {
      helper: string;
      scope: Record<string, unknown>;
      oldTag: string;
      pipeTag: string;
    }

    const HELPER_CASES: HelperCase[] = [
      { helper: 'upper', scope: { v: 'ada lovelace' }, oldTag: 'upper v', pipeTag: 'v | upper' },
      { helper: 'lower', scope: { v: 'ADA' }, oldTag: 'lower v', pipeTag: 'v | lower' },
      { helper: 'currency', scope: { v: 250 }, oldTag: 'currency v', pipeTag: 'v | currency' },
      { helper: 'date', scope: { v: '2026-01-05' }, oldTag: 'date v', pipeTag: 'v | date' },
      { helper: 'yesno', scope: { v: true }, oldTag: 'yesno v', pipeTag: 'v | yesno' },
      { helper: 'titleCase', scope: { v: 'hello world' }, oldTag: 'titleCase v', pipeTag: 'v | titleCase' },
      { helper: 'number', scope: { v: 1234.5 }, oldTag: 'number v', pipeTag: 'v | number' },
      { helper: 'percent', scope: { v: 42.345 }, oldTag: 'percent v', pipeTag: 'v | percent' },
      { helper: 'capitalize', scope: { v: 'hello' }, oldTag: 'capitalize v', pipeTag: 'v | capitalize' },
      { helper: 'join', scope: { v: ['a', 'b', 'c'] }, oldTag: 'join v', pipeTag: 'v | join' },
      { helper: 'length', scope: { v: [1, 2, 3] }, oldTag: 'length v', pipeTag: 'v | length' },
      { helper: 'first', scope: { v: [1, 2, 3] }, oldTag: 'first v', pipeTag: 'v | first' },
      { helper: 'last', scope: { v: [1, 2, 3] }, oldTag: 'last v', pipeTag: 'v | last' },
      { helper: 'isEmpty', scope: { v: '' }, oldTag: 'isEmpty v', pipeTag: 'v | isEmpty' },
      { helper: 'isNotEmpty', scope: { v: 'x' }, oldTag: 'isNotEmpty v', pipeTag: 'v | isNotEmpty' },
      {
        helper: 'formatDate',
        scope: { v: '2026-01-05T12:00:00Z' },
        oldTag: 'formatDate v',
        pipeTag: 'v | formatDate',
      },
      { helper: 'formatCurrency', scope: { v: 1234.5 }, oldTag: 'formatCurrency v', pipeTag: 'v | formatCurrency' },
      { helper: 'formatNumber', scope: { v: 1234.567 }, oldTag: 'formatNumber v', pipeTag: 'v | formatNumber' },
      { helper: 'round', scope: { v: 10.456 }, oldTag: 'round v', pipeTag: 'v | round' },
      {
        helper: 'truncate',
        scope: { v: 'a long string here' },
        oldTag: 'truncate v 10',
        pipeTag: 'v | truncate:10',
      },
      {
        helper: 'replace',
        scope: { v: 'hello world' },
        oldTag: 'replace v "world" "there"',
        pipeTag: 'v | replace:"world":"there"',
      },
      {
        helper: 'defaultValue',
        scope: { v: '' },
        oldTag: 'defaultValue v "fallback"',
        pipeTag: 'v | defaultValue:"fallback"',
      },
      { helper: 'add', scope: { v: 5, b: 3 }, oldTag: 'add v b', pipeTag: 'v | add:b' },
      { helper: 'subtract', scope: { v: 5, b: 3 }, oldTag: 'subtract v b', pipeTag: 'v | subtract:b' },
      { helper: 'multiply', scope: { v: 5, b: 3 }, oldTag: 'multiply v b', pipeTag: 'v | multiply:b' },
      { helper: 'divide', scope: { v: 10, b: 4 }, oldTag: 'divide v b', pipeTag: 'v | divide:b' },
      { helper: 'pluralize', scope: { v: 2 }, oldTag: 'pluralize v "item"', pipeTag: 'v | pluralize:"item"' },
      { helper: 'concat', scope: { v: 'x', b: 'y', c: 'z' }, oldTag: 'concat v b c', pipeTag: 'v | concat:b:c' },
      { helper: 'addDays', scope: { v: '2026-01-05', n: 30 }, oldTag: 'addDays v n', pipeTag: 'v | addDays:n' },
      {
        helper: 'daysBetween',
        scope: { v: '2026-01-01', d2: '2026-01-10' },
        oldTag: 'daysBetween v d2',
        pipeTag: 'v | daysBetween:d2',
      },
      { helper: 'percentage', scope: { v: 50, total: 200 }, oldTag: 'percentage v total', pipeTag: 'v | percentage:total' },
      { helper: 'trim', scope: { v: '  hi  ' }, oldTag: 'trim v', pipeTag: 'v | trim' },
    ];

    // Helpers deliberately not covered by HELPER_CASES, with the reason.
    // Keep this empty in the common case -- it exists as an escape hatch,
    // not a place to silently drop coverage. Every entry needs a comment.
    const HELPER_CASES_EXEMPT: readonly string[] = [];

    it('covers every function on docxHelpers (except explicit, commented exemptions)', () => {
      // Table-driven, not a hardcoded count: a new helper (TPL-9's addMonths
      // etc., or this ticket's own new `trim`) must be added to HELPER_CASES
      // or HELPER_CASES_EXEMPT, or this test fails and says which one is
      // missing -- a fixed toHaveLength(31) would stay green while coverage
      // silently rotted.
      const allHelperNames = Object.entries(docxHelpers)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name);
      const covered = new Set([...HELPER_CASES.map((c) => c.helper), ...HELPER_CASES_EXEMPT]);
      const uncovered = allHelperNames.filter((name) => !covered.has(name));
      expect(uncovered).toEqual([]);
    });

    it.each(HELPER_CASES)('$helper: pipe form matches prefix form', async ({ scope, oldTag, pipeTag }) => {
      const oldOutput = await renderTag(oldTag, scope);
      const newOutput = await renderTag(pipeTag, scope);
      expect(newOutput).toBe(oldOutput);
      // Guards against a vacuous pass: two forms silently agreeing on "" is
      // not proof either one actually works.
      expect(newOutput).not.toBe('');
    });
  });

  // AC2
  it('AC2: chains filters left to right', async () => {
    const text = await renderTag('name | trim | upper', { name: '  ada  ' });
    expect(text).toContain('ADA');
  });

  // AC3
  describe('AC3: filter arguments (colon syntax)', () => {
    it('formatDate takes a quoted format argument', async () => {
      const dob = new Date(2025, 10, 14, 15, 30);
      const text = await renderTag('dob | formatDate:"MMMM DD, YYYY"', { dob });
      expect(text).toContain('November 14, 2025');
    });

    it('formatCurrency takes a quoted currency-code argument', async () => {
      const text = await renderTag('amt | formatCurrency:"EUR"', { amt: 1234.5 });
      expect(text).toContain('1,234.50');
    });
  });

  // AC4
  describe('AC4: array indexing', () => {
    it('resolves an in-range index', async () => {
      const data = { Children: [{ child_full_name: 'Ada' }, { child_full_name: 'Alan' }] };
      const text = await renderTag('Children[0].child_full_name', data);
      expect(text).toContain('Ada');
    });

    it('an out-of-range index renders blank, not a crash', async () => {
      const data = { Children: [{ child_full_name: 'Ada' }] };
      const text = await render(paragraph('Value:[{{Children[9].child_full_name}}]'), data);
      expect(text).toContain('Value:[]');
    });
  });

  // AC5
  describe('AC5: comparison section tags', () => {
    it('value-to-value equality stamps content when equal', async () => {
      const data = { Children: [{ guardian: 'Alan' }], resp_full_name: 'Alan' };
      const text = await render(
        paragraph('{{#Children[0].guardian == resp_full_name}}X{{/Children[0].guardian == resp_full_name}}'),
        data
      );
      expect(text).toContain('X');
    });

    it('value-to-value equality renders nothing when not equal', async () => {
      const data = { Children: [{ guardian: 'Alan' }], resp_full_name: 'Nobody' };
      const text = await render(
        paragraph('{{#Children[0].guardian == resp_full_name}}X{{/Children[0].guardian == resp_full_name}}'),
        data
      );
      expect(text).not.toContain('X');
    });

    it('resolves an outer-scope variable by bare name from inside a loop (parent scopeList walk)', async () => {
      // TPL-1's spike notes: without walking the parent scopeList, a
      // comparison inside {{#Children}} cannot see a top-level variable.
      const data = {
        Children: [{ guardian: 'Alan' }, { guardian: 'Ada' }],
        resp_full_name: 'Alan',
      };
      const text = await render(
        paragraph('{{#Children}}{{#guardian == resp_full_name}}X{{/guardian == resp_full_name}}{{/Children}}'),
        data
      );
      // Only the first child (Alan) matches resp_full_name -- exactly one X.
      expect(text.match(/X/g)).toHaveLength(1);
    });

    it('value-to-literal comparison works on both sides of the boundary', async () => {
      const above = await render(paragraph('{{#count > 9}}yes{{/count > 9}}'), { count: 10 });
      expect(above).toContain('yes');

      const atBoundary = await render(paragraph('{{#count > 9}}yes{{/count > 9}}'), { count: 9 });
      expect(atBoundary).not.toContain('yes');
    });
  });

  // AC6
  it('AC6: {{$index}} renders the zero-based iteration index inside a loop', async () => {
    const data = { items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] };
    const text = await render(paragraph('{{#items}}{{$index}}:{{name}} {{/items}}'), data);
    expect(text).toContain('0:A 1:B 2:C');
  });

  // AC7
  describe('AC7: reserved {%/{# statement syntax is rejected', () => {
    it('rejects a tag opening with {%', async () => {
      await expect(
        render(paragraph('Intro {%tr if Children.number() > 9 %} more'), {})
      ).rejects.toThrow(/reserved/i);
    });

    it('rejects a tag opening with {#', async () => {
      await expect(render(paragraph('{# a comment #}'), {})).rejects.toThrow(/reserved/i);
    });

    it('does not misfire on docxtemplater\'s own {{#section}} syntax', async () => {
      // {{#items}} contains the literal substring "{#" -- the reserved-syntax
      // scan must not confuse it with a bare Jinja-style comment opener.
      const text = await render(paragraph('{{#items}}{{.}}{{/items}}'), { items: ['ok'] });
      expect(text).toContain('ok');
    });

    // Regression: Word routinely splits a tag's opening delimiter across two
    // <w:t> runs, and TemplateScanner.repairXml does not repair delimiter
    // splits (only structural ones), so these reach the renderer still
    // split. A raw-markup scan reads the intervening </w:t></w:r><w:r><w:t>
    // as the character before "{#", so the negative-lookbehind exclusion for
    // {{#...}} misses and a perfectly valid loop tag was rejected as
    // reserved syntax.
    it('a valid {{#section}} tag split across two runs still renders', async () => {
      const body = splitRunParagraph('{', '{#items}}', '{{.}}', '{{/items}}');
      const text = await render(body, { items: ['A', 'B'] });
      expect(text).toContain('AB');
    });

    it('a reserved {% tag split across two runs is still rejected', async () => {
      // Split exactly at the "{" / "%" boundary -- the same split point that
      // makes {{#items}} misfire as a false positive would, symmetrically,
      // make a genuinely reserved {% tag go undetected if the scan still
      // read raw markup instead of stripped placeholder text.
      const body = splitRunParagraph('{', '%tr if x %}');
      await expect(render(body, {})).rejects.toThrow(/reserved/i);
    });
  });

  // AC9: reproduces the repo owner's docxtpl estate table -- rows driven by
  // Children[n] indexing, plus an equality-driven "X" checkbox column. The
  // literal `{%tr if %}`/`{% if %}` docxtpl syntax is out of scope (TPL-2
  // reserves and rejects it, per AC7); this proves the same functional
  // outcome expressed in ezBuildr's own {{#...}}/{{/...}} grammar.
  it('AC9: docxtpl-style estate table renders indexed rows with an equality checkbox', async () => {
    const table =
      '<w:tbl>' +
      '<w:tr>' +
      '<w:tc><w:p><w:r><w:t>Child Name</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>Guardian Match</w:t></w:r></w:p></w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:tc><w:p><w:r><w:t>{{Children[9].child_full_name}}</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>{{#Children[9].temp_physical_guardian_name == pet_full_name}}X{{/Children[9].temp_physical_guardian_name == pet_full_name}}</w:t></w:r></w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';

    const children = Array.from({ length: 10 }, (_, i) => ({
      child_full_name: `Child ${i}`,
      temp_physical_guardian_name: 'Rex',
    }));
    children[9].child_full_name = 'Grace';

    const matched = await render(table, { Children: children, pet_full_name: 'Rex' });
    expect(matched).toContain('GraceX');

    const unmatched = await render(table, { Children: children, pet_full_name: 'Fido' });
    expect(unmatched).toContain('Grace');
    expect(unmatched).not.toContain('GraceX');
  });

  // Backward compatibility (kept working per the ticket -- TPL-3 removes this
  // grammar entirely). Not a duplicate of TemplateParser.test.ts: this proves
  // the two grammars coexist through the same createExpressionParser branch.
  it('legacy helper-prefix form still renders unchanged', async () => {
    const text = await renderTag('upper name', { name: 'ada lovelace' });
    expect(text).toContain('ADA LOVELACE');
  });
});
