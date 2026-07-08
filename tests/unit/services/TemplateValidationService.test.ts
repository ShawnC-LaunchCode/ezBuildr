import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  TemplateValidationService,
  extractPlaceholdersDetailed,
  suggestAliases,
} from '../../../server/services/TemplateValidationService';

// TemplateSyntaxError is asserted via rejects.toMatchObject({ name })

import type { WorkflowVariable } from '@shared/schema';

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

function variable(overrides: Partial<WorkflowVariable> & { key: string }): WorkflowVariable {
  return {
    alias: null,
    label: overrides.key,
    type: 'short_text',
    sectionId: 'section-1',
    sectionTitle: 'Section 1',
    stepId: overrides.key,
    ...overrides,
  } as WorkflowVariable;
}

describe('TemplateValidationService', () => {
  const tmpDir = path.join(os.tmpdir(), `tvs-test-${Date.now()}`);

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

  describe('extractPlaceholdersDetailed', () => {
    it('should extract plain variables and dot paths', async () => {
      const file = await writeDocx(
        'plain.docx',
        'Hello {{clientName}}, city: {{client.address.city}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const names = placeholders.map((p) => p.name);
      expect(names).toContain('clientName');
      expect(names).toContain('client.address.city');
    });

    it('should attribute helper tags to their variable', async () => {
      const file = await writeDocx('helper.docx', '{{formatDate signedAt "MMMM DD, YYYY"}}');
      const placeholders = await extractPlaceholdersDetailed(file);
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toMatchObject({
        name: 'signedAt',
        kind: 'helper',
        helper: 'formatDate',
      });
    });

    it('should mark loop inner fields with their loop scope', async () => {
      const file = await writeDocx(
        'loop.docx',
        '{{#lineItems}}{{description}} {{formatCurrency amount "USD"}}{{/lineItems}} Total: {{total}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);

      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));
      expect(byName['lineItems']).toMatchObject({ kind: 'section', loopScope: [] });
      expect(byName['description'].loopScope).toEqual(['lineItems']);
      expect(byName['amount'].loopScope).toEqual(['lineItems']);
      expect(byName['total'].loopScope).toEqual([]);
    });

    it('should not scope fields inside inverted or helper-driven sections', async () => {
      // Note: docxtemplater requires closing tags to match the opening text
      // exactly, or be empty ({{/}})
      const file = await writeDocx(
        'inverted.docx',
        '{{^hasItems}}{{emptyMessage}}{{/hasItems}} {{#isEmpty addOns}}{{fallbackNote}}{{/}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);
      const byName = Object.fromEntries(placeholders.map((p) => [p.name, p]));

      expect(byName['emptyMessage'].loopScope).toEqual([]);
      expect(byName['fallbackNote'].loopScope).toEqual([]);
      expect(byName['addOns']).toMatchObject({ kind: 'section' });
    });

    it('should raise TemplateSyntaxError for malformed templates', async () => {
      const file = await writeDocx('broken.docx', '{{#items}}{{name}} - never closed');
      await expect(extractPlaceholdersDetailed(file)).rejects.toMatchObject({
        name: 'TemplateSyntaxError',
      });
    });
  });

  describe('suggestAliases', () => {
    const aliases = ['clientName', 'client_email', 'startDate', 'totalAmount'];

    it('should suggest case-insensitive matches first', () => {
      expect(suggestAliases('clientname', aliases)[0]).toBe('clientName');
    });

    it('should suggest underscore-insensitive matches', () => {
      expect(suggestAliases('clientEmail', aliases)[0]).toBe('client_email');
    });

    it('should suggest close typos', () => {
      expect(suggestAliases('clentName', aliases)).toContain('clientName');
    });

    it('should return nothing for unrelated names', () => {
      expect(suggestAliases('zzzzzzzz', aliases)).toEqual([]);
    });
  });

  describe('buildReport', () => {
    const service = new TemplateValidationService();

    it('should classify matched, missing, loop-scoped, unused, and alias-less', async () => {
      const file = await writeDocx(
        'report.docx',
        'Dear {{clientName}}, born {{formatDate dateOfBirth "MM/DD/YYYY"}}. ' +
          '{{#services}}{{serviceName}}{{/services}} Sig: {{signture}}'
      );
      const placeholders = await extractPlaceholdersDetailed(file);

      const variables: WorkflowVariable[] = [
        variable({ key: 's1', alias: 'clientName', label: 'Client Name' }),
        variable({ key: 's2', alias: 'dateOfBirth', label: 'Date of Birth', type: 'date' }),
        variable({ key: 's3', alias: 'services', label: 'Services', type: 'checkbox' }),
        variable({ key: 's4', alias: 'signature', label: 'Signature', type: 'signature_block' }),
        variable({ key: 's5', alias: 'unusedField', label: 'Unused Field' }),
        variable({ key: 's6', alias: null, label: 'Orphan Question' }),
        variable({ key: 's7', alias: null, label: 'Instructions', type: 'display' }),
      ];

      const report = service.buildReport('tpl-1', 'wf-1', placeholders, variables);

      expect(report.matched).toEqual(
        expect.arrayContaining(['clientName', 'dateOfBirth', 'services'])
      );
      expect(report.loopScoped).toContain('serviceName');

      expect(report.missing).toHaveLength(1);
      expect(report.missing[0].placeholder).toBe('signture');
      expect(report.missing[0].suggestions).toContain('signature');

      const unusedAliases = report.unusedVariables.map((u) => u.alias);
      expect(unusedAliases).toContain('unusedField');
      expect(unusedAliases).toContain('signature');
      expect(unusedAliases).not.toContain('clientName');

      // display steps never carry values; only the real question is flagged
      expect(report.stepsWithoutAlias).toHaveLength(1);
      expect(report.stepsWithoutAlias[0].label).toBe('Orphan Question');

      expect(report.valid).toBe(false);
    });

    it('should match dot-path placeholders against their root alias', async () => {
      const file = await writeDocx('dots.docx', '{{billing.city}} {{billing.zip}}');
      const placeholders = await extractPlaceholdersDetailed(file);
      const variables = [variable({ key: 's1', alias: 'billing', label: 'Billing', type: 'address' })];

      const report = service.buildReport('tpl-2', 'wf-2', placeholders, variables);

      expect(report.matched).toEqual(
        expect.arrayContaining(['billing.city', 'billing.zip'])
      );
      expect(report.missing).toHaveLength(0);
      expect(report.valid).toBe(true);
    });
  });
});
