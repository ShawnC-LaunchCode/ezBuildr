import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { createError } from '../utils/errors';
import type { PlaceholderInfo } from '../api/validators/templates';
import {
  extractPlaceholdersFromDocx,
  renderDocx,
  validateTemplateData,
} from './docxRenderer';

// Local file storage directory
const FILES_DIR = path.join(process.cwd(), 'server', 'files');
const OUTPUTS_DIR = path.join(process.cwd(), 'server', 'files', 'outputs');

/**
 * Template Service
 * Handles file storage and placeholder extraction for document templates
 */

/**
 * Initialize file storage directory
 */
export async function initializeFileStorage(): Promise<void> {
  try {
    await fs.mkdir(FILES_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create files directory:', error);
    throw createError.internal('Failed to initialize file storage');
  }
}

/**
 * Save uploaded file to local storage
 * @returns fileRef - Unique reference to the stored file
 */
export async function saveTemplateFile(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  // Validate file type
  if (!mimeType.includes('wordprocessingml') && !mimeType.includes('msword')) {
    throw createError.invalidFileType('Only .docx files are supported', { mimeType });
  }

  // Ensure files directory exists
  await initializeFileStorage();

  // Generate unique filename
  const ext = path.extname(originalName);
  const fileName = `${nanoid(16)}${ext}`;
  const filePath = path.join(FILES_DIR, fileName);

  try {
    await fs.writeFile(filePath, fileBuffer);
    return fileName; // Return just the filename as fileRef
  } catch (error) {
    console.error('Failed to save template file:', error);
    throw createError.internal('Failed to save template file');
  }
}

/**
 * Delete template file from local storage
 */
export async function deleteTemplateFile(fileRef: string): Promise<void> {
  const filePath = path.join(FILES_DIR, fileRef);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore error if file doesn't exist
    if ((error as any).code !== 'ENOENT') {
      console.error('Failed to delete template file:', error);
    }
  }
}

/**
 * Get file path for a template
 */
export function getTemplateFilePath(fileRef: string): string {
  return path.join(FILES_DIR, fileRef);
}

/**
 * Check if template file exists
 */
export async function templateFileExists(fileRef: string): Promise<boolean> {
  try {
    const filePath = getTemplateFilePath(fileRef);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file path for an output file
 */
export function getOutputFilePath(fileRef: string): string {
  return path.join(OUTPUTS_DIR, fileRef);
}

/**
 * Check if output file exists
 */
export async function outputFileExists(fileRef: string): Promise<boolean> {
  try {
    const filePath = getOutputFilePath(fileRef);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate template against allowed placeholders
 * @param fileRef - Template file reference
 * @param allowedVars - List of allowed variable names
 * @returns Validation result with missing/invalid placeholders
 */
export async function validateTemplate(
  fileRef: string,
  allowedVars: string[]
): Promise<{ valid: boolean; missingVars: string[]; extraVars: string[] }> {
  // Extract placeholders from template
  const placeholders = await extractPlaceholders(fileRef);
  const placeholderNames = placeholders.map((p) => p.name);

  // Check for placeholders not in allowed vars
  const extraVars = placeholderNames.filter((name) => !allowedVars.includes(name));

  // Check for required vars missing from template
  const missingVars = allowedVars.filter((name) => !placeholderNames.includes(name));

  return {
    valid: extraVars.length === 0,
    missingVars,
    extraVars,
  };
}

/**
 * Extract placeholders from docx template
 *
 * @param fileRef - Template file reference
 * @returns Array of placeholder information
 */
export async function extractPlaceholders(fileRef: string): Promise<PlaceholderInfo[]> {
  // Verify file exists
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  // Get template file path
  const templatePath = getTemplateFilePath(fileRef);

  // Extract placeholders using docxtemplater
  const placeholderNames = await extractPlaceholdersFromDocx(templatePath);

  // Convert to PlaceholderInfo format
  const placeholders: PlaceholderInfo[] = placeholderNames.map((name) => ({
    name,
    type: 'text', // Default to text type
    example: '', // Could be enhanced to provide better examples
  }));

  return placeholders;
}

/**
 * Render template with context data
 *
 * @param fileRef - Template file reference
 * @param context - Data to populate the template
 * @param options - Rendering options
 * @returns Path to the rendered document (fileRef)
 */
export async function renderTemplate(
  fileRef: string,
  context: Record<string, any>,
  options?: {
    toPdf?: boolean;
    outputName?: string;
  }
): Promise<{ fileRef: string; pdfRef?: string; size: number; format: string }> {
  // Verify file exists
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  // Get template file path
  const templatePath = getTemplateFilePath(fileRef);

  try {
    // Render the template using docxtemplater
    const result = await renderDocx({
      templatePath,
      data: context,
      outputDir: OUTPUTS_DIR,
      outputName: options?.outputName,
      toPdf: options?.toPdf || false,
    });

    // Extract just the filename (fileRef) from the full path
    const docxFileRef = path.basename(result.docxPath);
    const pdfFileRef = result.pdfPath ? path.basename(result.pdfPath) : undefined;

    return {
      fileRef: docxFileRef,
      pdfRef: pdfFileRef,
      size: result.size,
      format: 'docx',
    };
  } catch (error) {
    console.error('Failed to render template:', error);
    throw createError.internal('Failed to render template');
  }
}
