/**
 * DOCX Rendering Service
 * Handles DOCX template rendering and PDF conversion using docxtemplater
 */

import { exec } from 'child_process';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { logger } from '../logger';
import { createError } from '../utils/errors';
import { formatters } from '../utils/formatters';

const execAsync = promisify(exec);

export interface RenderOptions {
  templatePath: string;
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
      doc.render(templateData);
    } catch (error: any) {
      if (error.properties?.errors) {
        console.error('Docxtemplater MultiError:', JSON.stringify(error.properties.errors, null, 2));
        const errorMessages = error.properties.errors
          .map((e: any) => e.message)
          .join(', ');
        throw createError.internal(`Failed to render template: ${errorMessages}`);
      }
      throw createError.internal('Failed to render template', error);
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
  } catch (error: any) {
    // If it's already a formatted error, re-throw it
    if (error.code && error.status) {
      throw error;
    }

    // Otherwise, wrap in a generic error
    throw createError.internal(
      `Failed to render template: ${error.message || 'Unknown error'}`
    );
  }
}

/**
 * Convert DOCX to PDF
 * Attempts multiple conversion methods in order of preference:
 * 1. libreoffice-convert (if available)
 * 2. System LibreOffice command line
 * 3. Fallback: return undefined (PDF not available)
 */
export async function convertDocxToPdf(docxPath: string): Promise<string> {
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');

  // Method 1: Try libreoffice-convert package
  try {
    const libre = await import('libreoffice-convert');
    const docxBuffer = await fs.readFile(docxPath);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const convert = (libre.default as unknown as (
        input: Buffer,
        format: string,
        filter: undefined,
        callback: (err: Error | null, result: Buffer) => void
      ) => void);
      convert(docxBuffer, '.pdf', undefined, (err: Error | null, result: Buffer) => {
        if (err) {reject(err);}
        else {resolve(result);}
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
    const fileName = path.basename(docxPath);

    // Try to convert using system LibreOffice
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
 * Extract placeholders from a DOCX template
 * @param templatePath - Path to template file
 * @returns Array of unique placeholder names
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
 * @returns Array of missing placeholder names
 */
export function validateTemplateData(
  placeholders: string[],
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
