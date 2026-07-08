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
import { docxHelpers, formatArrayForDisplay, resolveHelperArg, tokenizeTag } from './docxHelpers';

/** Subset of the context docxtemplater passes to parser.get */
interface ParserContext {
  meta?: {
    part?: {
      module?: string;
    };
  };
}

/** True when the tag is a loop/inverted section, which needs the raw array */
function isLoopContext(context: unknown): boolean {
  return (context as ParserContext)?.meta?.part?.module === 'loop';
}

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

interface DocxTemplateError extends Error {
  properties?: {
    errors?: Array<{
      name?: string;
      message?: string;
      properties?: {
        id?: string;
        explanation?: string;
      };
    }>;
  };
}

/**
 * Custom expression parser for docxtemplater
 * Enables angular-like syntax with helper functions
 */
function createExpressionParser(tag: string): { get(scope: Record<string, unknown>, _context: unknown): unknown } {
  return {
    get(scope: Record<string, unknown>, context: unknown): unknown {
      if (tag === '.') {
        return scope;
      }

      const parts = tokenizeTag(tag);

      if (parts.length > 1 && parts[0] in docxHelpers) {
        const helperName = parts[0];
        const helper = docxHelpers[helperName as keyof typeof docxHelpers];

        if (typeof helper === 'function') {
          const valuePath = parts[1];
          const value = getNestedValue(scope, valuePath);
          const args = parts.slice(2).map((arg) => resolveHelperArg(scope, arg));

          try {
            return (helper as (...args: unknown[]) => unknown)(value, ...args);
          } catch (error) {
            logger.error({ error, helperName }, `Helper ${helperName} failed`);
            return '';
          }
        }
      }

      const value = getNestedValue(scope, tag);

      // Arrays used as a scalar {{tag}} render as joined text;
      // loop tags ({{#tag}}) receive the raw array for iteration
      if (Array.isArray(value) && !isLoopContext(context)) {
        return formatArrayForDisplay(value);
      }

      return value;
    },
  };
}

/**
 * Get nested value from object using dot notation
 * Example: "user.address.city" -> scope.user.address.city
 */
function getNestedValue(obj: Record<string, unknown>, pathStr: string): unknown {
  if (!pathStr) { return obj; }

  const keys = pathStr.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) { return undefined; }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
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
    // Read template file
    const content = await fs.readFile(templatePath, 'binary');
    const zip = new PizZip(content);

    // Merge data with helpers for template use
    const templateData = {
      ...data,
      ...docxHelpers,
    };

    // Create docxtemplater instance with enhanced options
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      nullGetter: (): string => '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- docxtemplater parser type is not publicly exported
      parser: ((parsedTag: string) => createExpressionParser(parsedTag)) as any,
    });

    try {
      doc.render(templateData);
    } catch (err: unknown) {
      const error = err as DocxTemplateError;
      if (error.properties?.errors) {
        const errorDetails = error.properties.errors
          .map((templateErr) => {
            const errorParts = [templateErr.name];
            if (templateErr.message) { errorParts.push(templateErr.message); }
            if (templateErr.properties?.id) { errorParts.push(`at ${templateErr.properties.id}`); }
            if (templateErr.properties?.explanation) { errorParts.push(`- ${templateErr.properties.explanation}`); }
            return errorParts.join(': ');
          })
          .join(' | ');

        throw createError.internal(`DOCX rendering failed: ${errorDetails}`, {
          errors: error.properties.errors,
        });
      }

      throw createError.internal(
        `DOCX rendering failed: ${error.message ?? 'Unknown error'}`,
        { stack: error.stack }
      );
    }

    // Generate output filename
    const timestamp = Date.now();
    const basename = outputName ?? path.basename(templatePath, '.docx');
    const outputFileName = `${basename}-${timestamp}.docx`;
    const outputPath = path.join(outputDir, outputFileName);

    // Write rendered document
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

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
