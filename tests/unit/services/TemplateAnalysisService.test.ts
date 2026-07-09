import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  analyzeTemplate,
  validateTemplateWithData,
  generateSampleData,
  compareTemplates,
} from '../../../server/services/TemplateAnalysisService';

/**
 * Real coverage for the structural analysis service. Placeholder extraction
 * is now delegated to the shared templatePlaceholders parser; these tests
 * exercise analyzeTemplate against actual DOCX fixtures and the derived
 * validation / sample-generation / comparison helpers.
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
    <w:p><w:r><w:t>${content}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('TemplateAnalysisService', () => {
  const tmpDir = path.join(os.tmpdir(), `tas-test-${Date.now()}`);

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

  describe('analyzeTemplate', () => {
    it('extracts plain variables with stats', async () => {
      const file = await writeDocx('vars.docx', 'Hello {{name}}, your email is {{email}}');
      const analysis = await analyzeTemplate(file);

      const names = analysis.variables.filter((v) => v.type === 'variable').map((v) => v.name);
      expect(names).toContain('name');
      expect(names).toContain('email');
      expect(analysis.stats.uniqueVariables).toBe(2);
      expect(analysis.stats.loopCount).toBe(0);
      expect(analysis.stats.conditionalCount).toBe(0);
    });

    it('attributes helper tags to their helper and variable', async () => {
      const file = await writeDocx('helper.docx', '{{upper name}}');
      const analysis = await analyzeTemplate(file);

      const helper = analysis.variables.find((v) => v.type === 'helper');
      expect(helper).toMatchObject({ name: 'name', type: 'helper', helperName: 'upper' });
      expect(analysis.helpers).toContain('upper');
      expect(analysis.stats.helperCallCount).toBe(1);
    });

    it('classifies array sections as loops and reports nesting depth', async () => {
      const file = await writeDocx(
        'nested.docx',
        '{{#departments}}{{deptName}}{{#employees}}{{firstName}}{{/employees}}{{/departments}}'
      );
      const analysis = await analyzeTemplate(file);

      const loopVars = analysis.loops.map((l) => l.variable);
      expect(loopVars).toContain('departments');
      expect(loopVars).toContain('employees');

      const employees = analysis.loops.find((l) => l.variable === 'employees');
      expect(employees?.depth).toBe(1);
      expect(analysis.stats.maxNestingDepth).toBe(2);
    });

    it('classifies inverted sections as conditionals', async () => {
      const file = await writeDocx('inverted.docx', '{{^hasItems}}No items found{{/hasItems}}');
      const analysis = await analyzeTemplate(file);

      expect(analysis.conditionals).toEqual([{ variable: 'hasItems', type: 'unless' }]);
      expect(analysis.stats.conditionalCount).toBe(1);
    });

    it('records the dotted path for nested variables', async () => {
      const file = await writeDocx('nested-path.docx', '{{user.address.city}}');
      const analysis = await analyzeTemplate(file);

      const nested = analysis.variables.find((v) => v.name === 'user.address.city');
      expect(nested?.path).toBe('user.address.city');
    });

    it('throws a bad-request error for a malformed template', async () => {
      const file = await writeDocx('broken.docx', '{{#unclosed}} no closing tag');
      await expect(analyzeTemplate(file)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('validateTemplateWithData', () => {
    it('reports missing, extra, and coverage', async () => {
      const file = await writeDocx('validate.docx', '{{name}} {{email}} {{phone}}');
      const result = await validateTemplateWithData(file, { name: 'Ada', extra: 'x' });

      expect(result.missing).toEqual(expect.arrayContaining(['email', 'phone']));
      expect(result.extra).toContain('extra');
      expect(result.coverage).toBe(33); // 1 of 3 provided
      expect(result.valid).toBe(false);
    });

    it('warns when a loop variable is not an array', async () => {
      const file = await writeDocx('loop-type.docx', '{{#items}}{{label}}{{/items}}');
      const result = await validateTemplateWithData(file, { items: 'not-an-array' });

      const typeWarning = result.warnings.find((w) => w.code === 'TYPE_MISMATCH');
      expect(typeWarning).toBeDefined();
      expect(typeWarning?.severity).toBe('error');
      expect(result.valid).toBe(false);
    });

    it('warns about empty loop arrays', async () => {
      const file = await writeDocx('empty-array.docx', '{{#items}}{{label}}{{/items}}');
      const result = await validateTemplateWithData(file, { items: [] });

      expect(result.warnings.some((w) => w.code === 'EMPTY_ARRAY')).toBe(true);
    });
  });

  describe('generateSampleData', () => {
    it('generates typed sample values keyed by variable', async () => {
      const file = await writeDocx('sample.docx', '{{clientName}} {{invoiceDate}} {{totalAmount}}');
      const sample = await generateSampleData(file);

      expect(typeof sample.clientName).toBe('string');
      expect(typeof sample.invoiceDate).toBe('string');
      expect(sample.invoiceDate).toContain('T'); // ISO date
      expect(sample.totalAmount).toBe(1234.56);
    });

    it('generates arrays for loop variables', async () => {
      const file = await writeDocx('sample-loop.docx', '{{#items}}{{label}}{{/items}}');
      const sample = await generateSampleData(file);

      expect(Array.isArray(sample.items)).toBe(true);
    });
  });

  describe('compareTemplates', () => {
    it('reports added, removed, and unchanged variables', async () => {
      const before = await writeDocx('before.docx', '{{name}} {{email}}');
      const after = await writeDocx('after.docx', '{{name}} {{phone}}');
      const diff = await compareTemplates(before, after);

      expect(diff.added).toContain('phone');
      expect(diff.removed).toContain('email');
      expect(diff.unchanged).toContain('name');
    });
  });
});
