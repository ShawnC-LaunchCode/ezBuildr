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

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createError } from '../utils/errors';
import { docxHelpers } from './docxHelpers';
import { logger } from '../logger';

const execAsync = promisify(exec);

export interface RenderOptions2 {
  templatePath: string;
  data: Record<string, any>;
  outputDir?: string;
  outputName?: string;
  toPdf?: boolean;
  helpersVersion?: number; // For future versioning
}

export interface RenderResult2 {
  docxPath: string;
  pdfPath?: string;
  size: number;
  placeholdersUsed?: string[]; // For analytics
}

/**
 * Custom expression parser for docxtemplater
 * Enables angular-like syntax with helper functions
 */
function createExpressionParser(tag: string) {
  return {
    get(scope: any, context: any) {
      // Parse tag which may include filters/helpers
      // Example: "upper name" -> call upper(scope.name)
      // Example: "currency amount USD" -> call currency(scope.amount, "USD")

      if (tag === '.') {
        return scope;
      }

      const parts = tag.trim().split(/\s+/);

      // If first part is a helper function, call it
      if (parts.length > 1 && parts[0] in docxHelpers) {
        const helperName = parts[0];
        const helper = (docxHelpers as any)[helperName];

        if (typeof helper === 'function') {
          // Get the value from scope
          const valuePath = parts[1];
          const value = getNestedValue(scope, valuePath);

          // Additional arguments (e.g., format string, options)
          const args = parts.slice(2);

          // Call helper with value and args
          try {
            return helper(value, ...args);
          } catch (error) {
            logger.error({ error, helperName }, `Helper ${helperName} failed`);
            return '';
          }
        }
      }

      // Otherwise, just get the value
      return getNestedValue(scope, tag);
    },
  };
}

/**
 * Get nested value from object using dot notation
 * Example: "user.address.city" -> scope.user.address.city
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return obj;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }

  return current;
}

/**
 * Render a DOCX template with advanced features
 * @param options - Rendering options
 * @returns Paths to generated files
 */
export async function renderDocx2(options: RenderOptions2): Promise<RenderResult2> {
  const {
    templatePath,
    data,
    outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
    outputName,
    toPdf = false,
    helpersVersion = 2,
  } = options;

  // Validate template exists
  try {
    await fs.access(templatePath);
  } catch (error) {
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
      ...docxHelpers, // Make helpers available as top-level functions
    };

    // Create docxtemplater instance with enhanced options
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, // Enable paragraph loops
      linebreaks: true, // Preserve line breaks
      delimiters: { start: '{{', end: '}}' },
      nullGetter: () => '', // Return empty string for null/undefined values
      parser: ((tag: string) => createExpressionParser(tag)) as any, // Custom parser for helper functions
    });

    // Set data and render
    doc.setData(templateData);

    try {
      doc.render();
    } catch (error: any) {
      // Enhanced error handling
      if (error.properties && error.properties.errors) {
        const errorDetails = error.properties.errors
          .map((err: any) => {
            const parts = [err.name];
            if (err.message) parts.push(err.message);
            if (err.properties?.id) parts.push(`at ${err.properties.id}`);
            if (err.properties?.explanation) parts.push(`- ${err.properties.explanation}`);
            return parts.join(': ');
          })
          .join(' | ');

        throw createError.internal(`DOCX rendering failed: ${errorDetails}`, {
          errors: error.properties.errors,
        });
      }

      throw createError.internal(
        `DOCX rendering failed: ${error.message || 'Unknown error'}`,
        { stack: error.stack }
      );
    }

    // Generate output filename
    const timestamp = Date.now();
    const basename = outputName || path.basename(templatePath, '.docx');
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
      } catch (error) {
        logger.warn({ error }, 'PDF conversion failed');
        // PDF conversion is optional, don't fail the entire operation
      }
    }

    return result;
  } catch (error: any) {
    // If it's already a formatted error, re-throw it
    if (error.code && error.status) {
      throw error;
    }

    // Otherwise, wrap in a generic error
    throw createError.internal(
      `Failed to render template: ${error.message || 'Unknown error'}`,
      { stack: error.stack }
    );
  }
}

/**
 * Convert DOCX to PDF
 * Attempts multiple conversion methods in order of preference
 */
export async function convertDocxToPdf2(docxPath: string): Promise<string> {
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');

  // Method 1: Try libreoffice-convert package
  try {
    const libre = await import('libreoffice-convert');
    const docxBuffer = await fs.readFile(docxPath);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      (libre.default as any)(docxBuffer, '.pdf', undefined, (err: Error | null, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    await fs.writeFile(pdfPath, pdfBuffer);
    return pdfPath;
  } catch (error) {
    logger.warn({ error }, 'libreoffice-convert not available, trying system LibreOffice');
  }

  // Method 2: Try system LibreOffice
  try {
    const outputDir = path.dirname(docxPath);

    await execAsync(
      `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`,
      { timeout: 30000 }
    );

    // Check if PDF was created
    try {
      await fs.access(pdfPath);
      return pdfPath;
    } catch {
      throw new Error('PDF file not created by LibreOffice');
    }
  } catch (error) {
    logger.warn({ error }, 'System LibreOffice conversion failed');
  }

  // If all methods fail, throw an error
  throw createError.internal(
    'PDF conversion not available. Please install LibreOffice or libreoffice-convert package.'
  );
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
export async function extractPlaceholders2(
  templatePath: string
): Promise<string[]> {
  try {
    // Validate template exists
    await fs.access(templatePath);

    // Read template file
    const content = await fs.readFile(templatePath, 'binary');
    const zip = new PizZip(content);

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
    const placeholderRegex = /\{[#\/]?([^{}]+?)\}/g;
    const matches = fullText.matchAll(placeholderRegex);

    const placeholders = new Set<string>();

    for (const match of matches) {
      const content = match[1].trim();

      // Skip closing tags
      if (content.startsWith('/')) continue;

      // Parse content
      const parts = content.split(/\s+/);

      // If it starts with #, it's a control structure
      if (parts[0].startsWith('#')) {
        const controlType = parts[0].substring(1); // Remove #

        // Skip known control keywords
        if (['if', 'unless', 'with'].includes(controlType)) {
          // The variable being tested is the second part
          if (parts[1]) {
            placeholders.add(parts[1]);
          }
        } else if (['each', 'for'].includes(controlType)) {
          // Loop variable is the second part
          if (parts[1]) {
            placeholders.add(parts[1]);
          }
        } else {
          // Custom loop syntax: {#items}
          placeholders.add(controlType);
        }
      } else {
        // Check if first part is a helper
        if (parts.length > 1 && parts[0] in docxHelpers) {
          // Helper call: {helper variable}
          if (parts[1]) {
            placeholders.add(parts[1]);
          }
        } else {
          // Simple variable: {variable}
          placeholders.add(parts[0]);
        }
      }
    }

    return Array.from(placeholders).sort();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw createError.notFound('Template file', templatePath);
    }
    throw createError.internal(
      `Failed to extract placeholders: ${error.message || 'Unknown error'}`
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
  data: Record<string, any>
): { valid: boolean; missing: string[]; extra: string[] } {
  const missing: string[] = [];
  const dataKeys = Object.keys(data);

  for (const placeholder of placeholders) {
    // Check if placeholder exists in data (excluding helper functions)
    if (!(placeholder in data) && !(placeholder in docxHelpers)) {
      missing.push(placeholder);
    }
  }

  // Find extra keys in data that aren't in placeholders
  const extra = dataKeys.filter(
    (key) => !placeholders.includes(key) && !(key in docxHelpers)
  );

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}
