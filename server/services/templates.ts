import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { createError } from '../utils/errors';
import type { PlaceholderInfo } from '../api/validators/templates';

// Local file storage directory
const FILES_DIR = path.join(process.cwd(), 'server', 'files');

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
 * Extract placeholders from docx template
 *
 * For MVP, this is a stub that returns mock placeholders.
 * In Stage 7, this will integrate with docxtemplater to actually parse the template.
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

  // TODO: Stage 7 - Implement actual docxtemplater placeholder extraction
  // For now, return mock placeholders
  return [
    {
      name: 'customer_name',
      type: 'text',
      example: 'John Doe',
    },
    {
      name: 'date',
      type: 'text',
      example: '2025-01-01',
    },
    {
      name: 'items',
      type: 'list',
      example: '[{name: "Item 1", price: 100}]',
    },
  ];
}

/**
 * Render template with context data
 *
 * For MVP, this is a stub that returns a mock file path.
 * In Stage 7, this will integrate with docxtemplater to actually render the document.
 *
 * @param fileRef - Template file reference
 * @param context - Data to populate the template
 * @returns Path to the rendered document
 */
export async function renderTemplate(
  fileRef: string,
  context: Record<string, any>
): Promise<string> {
  // Verify file exists
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  // TODO: Stage 7 - Implement actual docxtemplater rendering
  // For now, copy the template file as the output
  const outputFileName = `output-${nanoid(16)}.docx`;
  const templatePath = getTemplateFilePath(fileRef);
  const outputPath = path.join(FILES_DIR, outputFileName);

  try {
    // Copy template as output (placeholder for actual rendering)
    const templateBuffer = await fs.readFile(templatePath);
    await fs.writeFile(outputPath, templateBuffer);
    return outputFileName;
  } catch (error) {
    console.error('Failed to render template:', error);
    throw createError.internal('Failed to render template');
  }
}
