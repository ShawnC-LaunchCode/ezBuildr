/**
 * Stage 21: Enhanced DOCX Rendering Service (Engine 2.0)
 *
 * Advanced template rendering with support for:
 * - Loops (simple and nested): {#items}...{/items}
 * - Conditionals: {#if condition}...{/if}, {#unless}...{/unless}
 * - Inline helpers/filters: {upper name}, {currency amount}, {date createdAt "MM/DD/YYYY"}
 * - Repeated sections (tables & paragraphs)
 * - Error handling with detailed messages
 */

import fs from 'fs/promises';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/naming-convention
import Docxtemplater from 'docxtemplater';
// eslint-disable-next-line @typescript-eslint/naming-convention
import PizZip from 'pizzip';

import { logger } from '../logger';
import { ApiError , createError } from '../utils/errors';

import { PdfConverter } from './document/PdfConverter';
import { renderDocxBuffer } from './document/RenderCore';
import { docxHelpers } from './docxHelpers';

export interface RenderOptions2 {
  templatePath: string;
  data: Record<string, unknown>;
  outputDir?: string;
  outputName?: string;
  toPdf?: boolean;
  helpersVersion?: number;
}

export interface RenderResult2 {
  docxPath: string;
  pdfPath?: string;
  size: number;
  placeholdersUsed?: string[];
}

/**
 * Render a DOCX template with advanced features
 * @param options - Rendering options
 * @returns Paths to generated files
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- template rendering with error handling is inherently complex
export async function renderDocx2(options: RenderOptions2): Promise<RenderResult2> {
  const {
    templatePath,
    data,
    outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
    outputName,
    toPdf = false,
    helpersVersion: _helpersVersion = 2,
  } = options;

  // Validate template exists
  try {
    await fs.access(templatePath);
  } catch {
    throw createError.notFound('Template file', templatePath);
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Render via the shared core (single parser/options implementation)
    const buffer = await renderDocxBuffer({ templatePath, data });

    // Generate output filename
    const timestamp = Date.now();
    const basename = outputName ?? path.basename(templatePath, '.docx');
    const outputFileName = `${basename}-${timestamp}.docx`;
    const outputPath = path.join(outputDir, outputFileName);

    await fs.writeFile(outputPath, buffer);

    // Get file size
    const stats = await fs.stat(outputPath);
    const size = stats.size;

    const result: RenderResult2 = {
      docxPath: outputPath,
      size,
    };

    // Convert to PDF if requested
    if (toPdf) {
      try {
        const pdfPath = await convertDocxToPdf2(outputPath);
        result.pdfPath = pdfPath;
      } catch (pdfError) {
        logger.warn({ error: pdfError }, 'PDF conversion failed');
      }
    }

    return result;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    throw createError.internal(
      `Failed to render template: ${message}`,
      { stack }
    );
  }
}

/**
 * Convert DOCX to PDF using the real converter (Mammoth DOCX->HTML,
 * Puppeteer HTML->PDF). Kept as a thin wrapper so existing callers
 * (PdfQueueService, renderDocx2) keep their path-in/path-out contract.
 */
export async function convertDocxToPdf2(docxPath: string): Promise<string> {
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');
  const converter = new PdfConverter();
  await converter.convert({ docxPath, outputPath: pdfPath });
  return pdfPath;
}

/**
 * Extract placeholders from a DOCX template (enhanced version)
 * Supports:
 * - Simple placeholders: {name}
 * - Loop variables: {#items}item{/items}
 * - Conditional variables: {#if condition}...{/if}
 * - Helper calls: {upper name}, {currency amount}
 *
 * @param templatePath - Path to template file
 * @returns Array of unique placeholder/variable names
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function extractPlaceholders2(
  templatePath: string
): Promise<string[]> {
  try {
    // Validate template exists
    await fs.access(templatePath);

    // Read template file
    const fileContent = await fs.readFile(templatePath, 'binary');
    const zip = new PizZip(fileContent);

    // Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });

    // Get full text from document
    const fullText = doc.getFullText();

    // Extract placeholders using regex
    // Matches: {placeholder}, {#if var}, {#each items}, {upper name}, etc.
    const placeholderRegex = /\{[#/]?([^{}]+?)\}/g;
    const matches = fullText.matchAll(placeholderRegex);

    const placeholders = new Set<string>();

    for (const match of matches) {
      const tagContent = match[1].trim();

      // Skip closing tags
      if (tagContent.startsWith('/')) { continue; }

      // Parse content
      const parts = tagContent.split(/\s+/);

      // If it starts with #, it's a control structure
      if (parts[0].startsWith('#')) {
        const controlType = parts[0].substring(1);
        const isControlFlow = ['if', 'unless', 'with', 'each', 'for'].includes(controlType);
        placeholders.add(isControlFlow && parts[1] !== undefined ? parts[1] : controlType);
      } else if (parts.length > 1 && parts[0] in docxHelpers && parts[1] !== undefined) {
        placeholders.add(parts[1]);
      } else {
        placeholders.add(parts[0]);
      }
    }

    return Array.from(placeholders).sort();
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError.notFound('Template file', templatePath);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw createError.internal(
      `Failed to extract placeholders: ${message}`
    );
  }
}

/**
 * Validate template data against placeholders
 * @param placeholders - Expected placeholders
 * @param data - Data to validate
 * @returns Validation result with missing/extra variables
 */
export function validateTemplateData2(
  placeholders: string[],
  data: Record<string, unknown>
): { valid: boolean; missing: string[]; extra: string[] } {
  const missing: string[] = [];
  const dataKeys = Object.keys(data);

  for (const placeholder of placeholders) {
    if (!(placeholder in data) && !(placeholder in docxHelpers)) {
      missing.push(placeholder);
    }
  }

  const extra = dataKeys.filter(
    (key) => !placeholders.includes(key) && !(key in docxHelpers)
  );

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}
