import fs from 'fs/promises';
import { createRequire } from 'node:module';
import os from 'os';
import path from 'path';

import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiStrategy } from '../../../server/services/document/PdfConverter';
import { createPdfFidelityDocx } from '../../helpers/pdfFidelityFixture';

const CONVERTER_URL = process.env.PDF_CONVERTER_API_URL ?? 'http://localhost:3009';

// The package root executes a bundled demo when loaded through ESM and tries
// to open its own missing test PDF. Load the library entry point directly.
const pdfParseModule: unknown = createRequire(import.meta.url)('pdf-parse/lib/pdf-parse.js');
if (typeof pdfParseModule !== 'function') {
  throw new TypeError('pdf-parse did not export a parser function');
}
interface PdfTextPage {
  getTextContent(options: { normalizeWhitespace: boolean }): Promise<{
    items: Array<{ str: string }>;
  }>;
}

interface PdfParseOptions {
  pagerender?: (page: PdfTextPage) => Promise<string>;
}

const pdfParse = pdfParseModule as (
  buffer: Buffer,
  options?: PdfParseOptions
) => Promise<{ numpages: number; text: string }>;

async function requireGotenberg(): Promise<void> {
  try {
    const response = await fetch(`${CONVERTER_URL.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`health endpoint returned ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Gotenberg is required at ${CONVERTER_URL}; start it with npm run test:docker:up`,
      { cause: error }
    );
  }
}

function count(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function embeddedFontNames(document: PDFDocument): string[] {
  const names: string[] = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) { continue; }
    const baseFont = object.get(PDFName.of('BaseFont'));
    if (baseFont instanceof PDFName) {
      names.push(baseFont.decodeText());
    }
  }
  return names;
}

describe('GH-168: real Gotenberg layout fidelity', () => {
  let tempDir: string;
  let docxPath: string;
  let pdfPath: string;

  beforeAll(async () => {
    await requireGotenberg();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh168-fidelity-'));
    docxPath = path.join(tempDir, 'word-layout-fidelity.docx');
    pdfPath = path.join(tempDir, 'word-layout-fidelity.pdf');
    await fs.writeFile(docxPath, createPdfFidelityDocx());
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('preserves Word pagination, headers, footers, page fields, fonts, and complex-table content', async () => {
    await new ApiStrategy(CONVERTER_URL).convert({ docxPath, outputPath: pdfPath });

    const bytes = await fs.readFile(pdfPath);

    // Validate the container BEFORE parsing. `pdfParse` throws
    // "UnknownErrorException: bad XRef entry" with a stack made entirely of
    // pdf.js module-init frames, which says nothing about what Gotenberg
    // actually returned — and this test fails in CI while passing locally, so
    // the failure message is the only evidence available. Assert the magic
    // bytes first and put the size and a readable head/tail in the message.
    const head = bytes.subarray(0, 8).toString('latin1');
    const tail = bytes.subarray(-24).toString('latin1');
    expect(
      head.startsWith('%PDF-'),
      `Gotenberg did not return a PDF: ${bytes.length} bytes, head=${JSON.stringify(head)}, ` +
      `tail=${JSON.stringify(tail)}`
    ).toBe(true);
    expect(
      tail.includes('%%EOF'),
      `PDF looks truncated: ${bytes.length} bytes, tail=${JSON.stringify(tail)}`
    ).toBe(true);

    const pageTexts: string[] = [];
    const parsed = await pdfParse(bytes, {
      pagerender: async (page) => {
        const content = await page.getTextContent({ normalizeWhitespace: true });
        const text = content.items.map((item) => item.str).join(' ');
        pageTexts.push(text);
        return text;
      },
    });
    const pdfDocument = await PDFDocument.load(bytes);
    const fontNames = embeddedFontNames(pdfDocument);

    expect(parsed.numpages).toBe(2);
    expect(pdfDocument.getPageCount()).toBe(2);
    expect(pageTexts).toHaveLength(2);

    // The default header/footer and live page fields must render on both pages.
    expect(count(parsed.text, 'EZBUILDR FIDELITY HEADER')).toBe(2);
    expect(pageTexts[0]).toContain('EZBUILDR FIDELITY HEADER');
    expect(pageTexts[1]).toContain('EZBUILDR FIDELITY HEADER');
    expect(pageTexts[0]).toMatch(/CONFIDENTIAL \| Page\s*1\s+of\s+2/);
    expect(pageTexts[1]).toMatch(/CONFIDENTIAL \| Page\s*2\s+of\s+2/);

    // Explicit page break and table cells survive as readable, ordered content.
    expect(parsed.text).toContain('FIRST PAGE BODY MARKER');
    expect(parsed.text).toContain('SECOND PAGE BODY MARKER');
    expect(parsed.text).toContain('MERGED TABLE HEADING');
    expect(parsed.text).toMatch(/CLIENT\s*MATTER\s*STATUS/);
    expect(parsed.text).toMatch(/Ada Lovelace\s*Estate Plan\s*Ready/);

    // Gotenberg's LibreOffice image contains Carlito, the metric-compatible
    // Calibri replacement. Requiring the requested face catches silent font
    // substitution that shifts pagination and table geometry.
    expect(fontNames.some((name) => /Carlito/i.test(name))).toBe(true);
  }, 120_000);
});
