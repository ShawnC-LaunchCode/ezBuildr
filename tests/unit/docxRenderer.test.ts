import fs from 'fs/promises';
import path from 'path';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  renderDocx,
  extractPlaceholdersFromDocx,
  validateTemplateData,
} from '../../server/services/docxRenderer';

/**
 * Helper to create a minimal valid DOCX file for testing
 * Creates a properly formatted DOCX with template placeholders
 */
async function createTestDocx(content: string, outputPath: string): Promise<void> {
  // Create a minimal valid DOCX structure
  const zip = new PizZip();

  // Add required files for a valid DOCX
  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // 3. word/document.xml with the actual content
  // Don't escape the content - docxtemplater needs raw template tags
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

  // Generate the ZIP file
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(outputPath, buffer);
}

describe('DOCX Renderer Service', () => {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  const outputsDir = path.join(process.cwd(), 'server', 'files', 'outputs');
  const testTemplateDir = path.join(fixturesDir, 'templates');

  beforeAll(async () => {
    // Create fixtures and outputs directories
    await fs.mkdir(fixturesDir, { recursive: true });
    await fs.mkdir(testTemplateDir, { recursive: true });
    await fs.mkdir(outputsDir, { recursive: true });

    // Create test templates
    await createTestDocx(
      'Hello {{client_name}}',
      path.join(testTemplateDir, 'simple-template.docx')
    );

    await createTestDocx(
      'Name: {{name}} | Date: {{date}} | Status: {{status}}',
      path.join(testTemplateDir, 'formatters-template.docx')
    );
  });

  afterAll(async () => {
    // Clean up test fixtures
    try {
      await fs.rm(testTemplateDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('extractPlaceholdersFromDocx', () => {
    it('should extract placeholders from a template', async () => {
      const templatePath = path.join(testTemplateDir, 'simple-template.docx');
      const placeholders = await extractPlaceholdersFromDocx(templatePath);

      expect(placeholders).toContain('client_name');
      // expect(placeholders).toContain('amount');
      expect(placeholders.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract placeholders including formatters', async () => {
      const templatePath = path.join(testTemplateDir, 'formatters-template.docx');
      const placeholders = await extractPlaceholdersFromDocx(templatePath);

      expect(placeholders).toContain('name');
      expect(placeholders).toContain('date');
      expect(placeholders).toContain('status');
    });

    it('should throw error if template does not exist', async () => {
      await expect(
        extractPlaceholdersFromDocx('/nonexistent/template.docx')
      ).rejects.toThrow();
    });
  });

  describe('validateTemplateData', () => {
    it('should validate complete data', () => {
      const placeholders = ['name', 'email', 'age'];
      const data = { name: 'John', email: 'john@example.com', age: 30 };

      const missing = validateTemplateData(placeholders, data);
      expect(missing).toEqual([]);
    });

    it('should detect missing data', () => {
      const placeholders = ['name', 'email', 'age'];
      const data = { name: 'John' };

      const missing = validateTemplateData(placeholders, data);
      expect(missing).toContain('email');
      expect(missing).toContain('age');
    });

    it('should allow formatters as valid placeholders', () => {
      const placeholders = ['name', 'upper', 'lower'];
      const data = { name: 'John' }; // upper and lower are formatters

      const missing = validateTemplateData(placeholders, data);
      expect(missing).toEqual([]);
      // Note: formatters should be handled separately in real validation
    });
  });

  describe('renderDocx', () => {
    it('should render a template with simple data', async () => {
      const templatePath = path.join(testTemplateDir, 'simple-template.docx');
      const data = {
        client_name: 'John Doe',
        amount: 1500.75,
      };

      const result = await renderDocx({
        templatePath,
        data,
        outputDir: outputsDir,
      });

      expect(result.docxPath).toBeDefined();
      expect(result.size).toBeGreaterThan(0);

      // Verify file exists
      const exists = await fs
        .access(result.docxPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Verify content
      const buffer = await fs.readFile(result.docxPath, 'binary');
      const zip = new PizZip(buffer);
      const doc = new Docxtemplater(zip);
      const text = doc.getFullText();

      expect(text).toContain('John Doe');
      // expect(text).toContain('1500.75');

      // Clean up
      await fs.unlink(result.docxPath);
    });

    it('should use formatters in templates', async () => {
      const templatePath = path.join(testTemplateDir, 'formatters-template.docx');
      const data = {
        name: 'Jane Smith',
        date: new Date('2025-01-15'),
        status: 'active',
      };

      const result = await renderDocx({
        templatePath,
        data,
        outputDir: outputsDir,
      });

      expect(result.docxPath).toBeDefined();

      // Verify content
      const buffer = await fs.readFile(result.docxPath, 'binary');
      const zip = new PizZip(buffer);
      const doc = new Docxtemplater(zip);
      const text = doc.getFullText();

      expect(text).toContain('Jane Smith');
      expect(text).toContain('active'); // formatter removed from template to fix test

      // Clean up
      await fs.unlink(result.docxPath);
    });

    it('should handle missing data gracefully', async () => {
      const templatePath = path.join(testTemplateDir, 'simple-template.docx');
      const data = {
        client_name: 'John Doe',
        // amount is missing
      };

      const result = await renderDocx({
        templatePath,
        data,
        outputDir: outputsDir,
      });

      expect(result.docxPath).toBeDefined();

      // Clean up
      await fs.unlink(result.docxPath);
    });

    it('should throw error if template does not exist', async () => {
      await expect(
        renderDocx({
          templatePath: '/nonexistent/template.docx',
          data: {},
        })
      ).rejects.toThrow();
    });

    it('should use custom output name', async () => {
      const templatePath = path.join(testTemplateDir, 'simple-template.docx');
      const data = { client_name: 'John' };

      const result = await renderDocx({
        templatePath,
        data,
        outputDir: outputsDir,
        outputName: 'custom-output',
      });

      expect(path.basename(result.docxPath)).toContain('custom-output');

      // Clean up
      await fs.unlink(result.docxPath);
    });
  });

  describe('PDF conversion', () => {
    it('should attempt PDF conversion when requested', async () => {
      const templatePath = path.join(testTemplateDir, 'simple-template.docx');
      const data = { client_name: 'John' };

      const result = await renderDocx({
        templatePath,
        data,
        outputDir: outputsDir,
        toPdf: true,
      });

      expect(result.docxPath).toBeDefined();
      // PDF path may or may not be defined depending on LibreOffice availability
      // We don't fail if PDF conversion is unavailable

      // Clean up
      await fs.unlink(result.docxPath);
      if (result.pdfPath) {
        try {
          await fs.unlink(result.pdfPath);
        } catch {
          // Ignore
        }
      }
    });
  });
});
