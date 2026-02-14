/**
 * DOCX Rendering Service
 * Handles DOCX template rendering and PDF conversion using docxtemplater
 */

// import { exec } from 'child_process'; // Removed
// eslint-disable-next-line @typescript-eslint/naming-convention
import _fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
// import { promisify } from 'util'; // Removed

import Docxtemplater from 'docxtemplater';
import { _PDFDocument, _StandardFonts, _rgb } from 'pdf-lib';
import PizZip from 'pizzip';

import { logger } from '../logger';
import { createError } from '../utils/errors';
import { formatters } from '../utils/formatters';

// import { execAsync } from '../utils/exec'; // Use PdfConverter instead
import { PdfConverter } from './document/PdfConverter';

async function convertDocxToPdf(inputPath: string): Promise<string> {
  const converter = new PdfConverter();
  const outputPath = inputPath.replace(/\.docx$/, '.pdf');
  await converter.convert({
    docxPath: inputPath,
    outputPath,
  });
  return outputPath;
}

export interface RenderOptions {
  templatePath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- template data can be any JSON structure
  data: Record<string, any>;
  outputDir?: string;
  outputName?: string;
  toPdf?: boolean;
}

export interface RenderResult {
  docxPath: string;
  pdfPath?: string;
  size: number;
}

/**
 * Render a DOCX template with data
 * @param options - Rendering options
 * @returns Paths to generated files
 */
export async function renderDocx(options: RenderOptions): Promise<RenderResult> {
  const {
    templatePath,
    data,
    outputDir = path.join(process.cwd(), 'server', 'files', 'outputs'),
    outputName,
    toPdf = false,
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

    // Create docxtemplater instance with options
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      nullGetter: () => '', // Return empty string for null/undefined values
    });

    // Merge data with formatters for template use
    const templateData = {
      ...data,
      ...formatters,
    };

    // Render with data
    try {
      await doc.renderAsync(templateData);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'properties' in error) {
        const err = error as { properties?: { errors?: Array<{ message: string }> } };
        if (err.properties?.errors) {
          console.error('Docxtemplater MultiError:', JSON.stringify(err.properties.errors, null, 2));
          const errorMessages = err.properties.errors
            .map((e) => e.message)
            .join(', ');
          throw createError.internal(`Failed to render template: ${errorMessages}`);
        }
      }
      throw createError.internal('Failed to render template', error);
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

    const result: RenderResult = {
      docxPath: outputPath,
      size,
    };

    // Convert to PDF if requested
    if (toPdf) {
      try {
        const pdfPath = await convertDocxToPdf(outputPath);
        result.pdfPath = pdfPath;
      } catch (error) {
        logger.warn({ error }, 'PDF conversion failed');
        // PDF conversion is optional, don't fail the entire operation
        // The DOCX file is still valid
      }
    }

    return result;
  } catch (error: unknown) {
    // If it's already a formatted error, re-throw it
    if (error && typeof error === 'object' && 'code' in error && 'status' in error) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw error;
    }

    // Otherwise, wrap in a generic error
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw createError.internal(
      `Failed to render template: ${message}`
    );
  }
}

/**
 */
export async function extractPlaceholdersFromDocx(
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
    // Matches {{placeholder}}, {{#if condition}}, {{#each items}}, etc.
    // eslint-disable-next-line security/detect-unsafe-regex, no-useless-escape
    const placeholderRegex = /\{\{[#\/]?(\w+)(?:\s+\w+)?\}\}/g;
    const matches = fullText.matchAll(placeholderRegex);

    const placeholders = new Set<string>();

    for (const match of matches) {
      const placeholder = match[1];
      // Filter out control structures (if, each, etc.)
      if (!['if', 'each', 'unless', 'with'].includes(placeholder)) {
        placeholders.add(placeholder);
      }
    }

    return Array.from(placeholders).sort();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw createError.notFound('Template file', templatePath);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw createError.internal(
      `Failed to extract placeholders: ${message}`
    );
  }
}

/**
 * Validate template data against placeholders
 * @param placeholders - Expected placeholders
 * @param data - Data to validate
 * @returns Array of missing placeholder names
 */
export function validateTemplateData(
  placeholders: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- template data can be any JSON structure
  data: Record<string, any>
): string[] {
  const missing: string[] = [];

  for (const placeholder of placeholders) {
    // Check if placeholder exists in data (including formatters)
    if (!(placeholder in data) && !(placeholder in formatters)) {
      missing.push(placeholder);
    }
  }

  return missing;
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}
