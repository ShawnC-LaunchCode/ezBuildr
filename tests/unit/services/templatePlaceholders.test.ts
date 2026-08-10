import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { extractPlaceholdersDetailed } from '../../../server/services/templatePlaceholders';

/**
 * TPL-11: teach the static extractor the pipe grammar.
 *
 * `extractPlaceholdersDetailed()` predates TPL-2's `{{ x | filter }}`
 * grammar and mis-parsed it -- see the ticket's reproduction in
 * tickets/TEMPLATE_LANGUAGE_TICKETS.md. Every assertion here runs against a
 * real (in-memory) DOCX buffer built with PizZip, per AC7 -- no parser
 * function is unit-tested in isolation.
 */

function createDocxBuffer(bodyText: string): Buffer {
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
    <w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('extractPlaceholdersDetailed (TPL-11 pipe grammar)', () => {
  const tmpDir = path.join(os.tmpdir(), `tpl11-test-${Date.now()}`);

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDocx(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, createDocxBuffer(content));
    return filePath;
  }

  // Reproduces the ticket's Finding verbatim: before the fix, this template
  // returned ["|", "Children[0].name", "plain_var"] -- client_name and fee
  // lost entirely, "|" reported as a variable. This test pins the fixed
  // behaviour; the broken behaviour was independently reproduced against
  // the pre-fix source (see turn-in notes) and is not re-derivable here
  // since the source no longer contains the bug.
  it('extracts every real variable from the ticket repro template, and never "|"', async () => {
    const file = await writeDocx(
      'repro.docx',
      '{{ client_name | upper }} {{ fee | usd }} {{ Children[0].name }} {{plain_var}}'
    );
    const placeholders = await extractPlaceholdersDetailed(file);
    const names = placeholders.map((p) => p.name);

    expect(names).not.toContain('|');
    expect(names).toContain('client_name');
    expect(names).toContain('fee');
    expect(names).toContain('Children'); // AC5: indexed path collapses to its root alias
    expect(names).toContain('plain_var');
    expect(names).toHaveLength(4);
  });

  describe('AC1: a piped tag extracts the variable, not the pipe', () => {
    it('{{ client_name | upper }} extracts client_name', async () => {
      const file = await writeDocx('ac1.docx', '{{ client_name | upper }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toMatchObject({
        name: 'client_name',
        kind: 'helper',
        helper: 'upper',
      });
    });
  });

  describe('AC2: a chained tag extracts the variable exactly once', () => {
    it('{{ a | trim | upper }} extracts "a" as a single placeholder', async () => {
      const file = await writeDocx('ac2.docx', '{{ a | trim | upper }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      const matches = placeholders.filter((p) => p.name === 'a');
      expect(matches).toHaveLength(1);
      expect(placeholders).toHaveLength(1);
    });

    it('two chained tags for the same variable still dedupe to one placeholder', async () => {
      const file = await writeDocx(
        'ac2b.docx',
        '{{ a | trim | upper }} and again {{ a | trim | upper }}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders.filter((p) => p.name === 'a')).toHaveLength(1);
    });
  });

  describe('AC3: filter names are never reported as variables', () => {
    it('a chain of known filters produces no placeholder named after any filter', async () => {
      const file = await writeDocx('ac3.docx', '{{ signing_date | trim | upper }}');
      const placeholders = await extractPlaceholdersDetailed(file);
      const names = placeholders.map((p) => p.name);

      expect(names).not.toContain('trim');
      expect(names).not.toContain('upper');
      expect(names).toEqual(['signing_date']);
    });
  });

  describe('AC4: an unknown filter name is reported as a problem, distinct from an unknown variable', () => {
    it('flags an unknown filter with kind unknown_helper and names the filter', async () => {
      const file = await writeDocx('ac4.docx', '{{ client_name | bogusFilter }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toMatchObject({
        name: 'client_name',
        kind: 'unknown_helper',
        helper: 'bogusFilter',
      });
    });

    it('an unknown filter is distinguishable from a plain unmatched variable', async () => {
      const file = await writeDocx(
        'ac4b.docx',
        '{{ client_name | bogusFilter }} {{ totally_unmapped_variable }}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['client_name'].kind).toBe('unknown_helper');
      expect(byName['totally_unmapped_variable'].kind).toBe('variable');
      expect(byName['client_name'].kind).not.toBe(byName['totally_unmapped_variable'].kind);
    });

    it('the last filter wins when only the last of a chain is unknown', async () => {
      const file = await writeDocx('ac4c.docx', '{{ v | trim | notARealFilter }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders[0]).toMatchObject({
        name: 'v',
        kind: 'unknown_helper',
        helper: 'notARealFilter',
      });
    });
  });

  describe('AC5: indexed-path decision (see stripArrayIndex doc comment)', () => {
    it('{{ Children[0].name }} is reported as "Children", not verbatim', async () => {
      const file = await writeDocx('ac5.docx', '{{ Children[0].name }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders).toHaveLength(1);
      expect(placeholders[0].name).toBe('Children');
      // The full accessor is preserved in `raw` for anything that wants it.
      expect(placeholders[0].raw).toBe('Children[0].name');
    });

    it('two different indices into the same array dedupe to one "Children" placeholder', async () => {
      const file = await writeDocx(
        'ac5b.docx',
        '{{ Children[0].name }} and {{ Children[9].guardian }}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders.filter((p) => p.name === 'Children')).toHaveLength(1);
    });

    it('an indexed path combined with a filter still resolves the root alias', async () => {
      const file = await writeDocx('ac5c.docx', '{{ Children[0].name | upper }}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders[0]).toMatchObject({
        name: 'Children',
        kind: 'helper',
        helper: 'upper',
      });
    });

    it('a dotted path with no index is unaffected (verbatim, matching prior behaviour)', async () => {
      const file = await writeDocx('ac5d.docx', '{{client_1.vips.relationship2}}');
      const placeholders = await extractPlaceholdersDetailed(file);

      expect(placeholders[0].name).toBe('client_1.vips.relationship2');
    });
  });

  describe('AC6: loop and inverted-section tags keep their existing behaviour (regression)', () => {
    it('a plain loop section scopes its inner fields to the loop', async () => {
      const file = await writeDocx(
        'ac6-loop.docx',
        '{{#lineItems}}{{description}} {{amount}}{{/lineItems}} Total: {{total}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['lineItems']).toMatchObject({ kind: 'section', loopScope: [] });
      expect(byName['description'].loopScope).toEqual(['lineItems']);
      expect(byName['amount'].loopScope).toEqual(['lineItems']);
      expect(byName['total'].loopScope).toEqual([]);
    });

    it('nested loops accumulate scope depth', async () => {
      const file = await writeDocx(
        'ac6-nested.docx',
        '{{#departments}}{{deptName}}{{#employees}}{{firstName}}{{/employees}}{{/departments}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['deptName'].loopScope).toEqual(['departments']);
      expect(byName['firstName'].loopScope).toEqual(['departments', 'employees']);
    });

    it('an inverted section does not scope its inner fields', async () => {
      const file = await writeDocx(
        'ac6-inverted.docx',
        '{{^hasItems}}{{emptyMessage}}{{/hasItems}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['hasItems']).toMatchObject({ kind: 'section' });
      expect(byName['emptyMessage'].loopScope).toEqual([]);
    });

    it('a shorthand {{/}} closing tag still balances the loop stack', async () => {
      const file = await writeDocx(
        'ac6-shorthand-close.docx',
        '{{^hasItems}}{{emptyMessage}}{{/}} {{afterClose}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['afterClose'].loopScope).toEqual([]);
    });
  });

  describe('AC7 regression: malformed templates and plain paths still behave as before', () => {
    it('raises TemplateSyntaxError for an unclosed section', async () => {
      const file = await writeDocx('broken.docx', '{{#items}}{{name}} - never closed');
      await expect(extractPlaceholdersDetailed(file)).rejects.toMatchObject({
        name: 'TemplateSyntaxError',
      });
    });

    it('plain variables and dot paths still extract unchanged', async () => {
      const file = await writeDocx(
        'plain.docx',
        'Hello {{clientName}}, city: {{client.address.city}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const names = placeholders.map((p) => p.name);

      expect(names).toContain('clientName');
      expect(names).toContain('client.address.city');
    });
  });
});
