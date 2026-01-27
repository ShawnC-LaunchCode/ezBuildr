
import path from 'path';

import { logger } from '../logger';
import { createError } from '../utils/errors';

import {
  extractPlaceholdersFromDocx,
  renderDocx,
} from './docxRenderer';
import { storageProvider } from './storage';

import type { PlaceholderInfo } from '../api/validators/templates';


const OUTPUTS_DIR = path.join(process.cwd(), 'server', 'files', 'outputs');

/**
 * Initialize file storage directory
 */
export async function initializeFileStorage(): Promise<void> {
  await storageProvider.init();
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
  if (
    !mimeType.includes('wordprocessingml') &&
    !mimeType.includes('msword') &&
    !mimeType.includes('application/pdf')
  ) {
    throw createError.invalidFileType('Only .docx and .pdf files are supported', { mimeType });
  }

  return storageProvider.saveFile(fileBuffer, originalName, mimeType);
}

/**
 * Delete template file from local storage
 */
export async function deleteTemplateFile(fileRef: string): Promise<void> {
  await storageProvider.deleteFile(fileRef);
}

/**
 * Get file path for a template
 */
export function getTemplateFilePath(fileRef: string): string {
  // Legacy support: We assume disk storage provider structure for now.
  return path.join(process.cwd(), 'server', 'files', fileRef);
}

/**
 * Check if template file exists
 */
export async function templateFileExists(fileRef: string): Promise<boolean> {
  return storageProvider.exists(fileRef);
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
  // Outputs are still local-only for now
  const fs = await import('fs/promises');
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
 */
export async function validateTemplate(
  fileRef: string,
  allowedVars: string[]
): Promise<{ valid: boolean; missingVars: string[]; extraVars: string[] }> {
  const placeholders = await extractPlaceholders(fileRef);
  const placeholderNames = placeholders.map((p) => p.name);
  const extraVars = placeholderNames.filter((name) => !allowedVars.includes(name));
  const missingVars = allowedVars.filter((name) => !placeholderNames.includes(name));

  return {
    valid: extraVars.length === 0,
    missingVars,
    extraVars,
  };
}

/**
 * Extract placeholders from docx template
 */
export async function extractPlaceholders(fileRef: string): Promise<PlaceholderInfo[]> {
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  const templatePath = getTemplateFilePath(fileRef);
  const placeholderNames = await extractPlaceholdersFromDocx(templatePath);

  const placeholders: PlaceholderInfo[] = placeholderNames.map((name) => ({
    name,
    type: 'text',
    example: '',
  }));

  return placeholders;
}

/**
 * Render template with context data
 */
export async function renderTemplate(
  fileRef: string,
  context: Record<string, any>,
  options?: {
    toPdf?: boolean;
    outputName?: string;
  }
): Promise<{ fileRef: string; pdfRef?: string; size: number; format: string }> {
  const exists = await templateFileExists(fileRef);
  if (!exists) {
    throw createError.notFound('Template file');
  }

  const templatePath = getTemplateFilePath(fileRef);

  try {
    const result = await renderDocx({
      templatePath,
      data: context,
      outputDir: OUTPUTS_DIR,
      outputName: options?.outputName,
      toPdf: options?.toPdf || false,
    });

    const docxFileRef = path.basename(result.docxPath);
    const pdfFileRef = result.pdfPath ? path.basename(result.pdfPath) : undefined;

    return {
      fileRef: docxFileRef,
      pdfRef: pdfFileRef,
      size: result.size,
      format: 'docx',
    };
  } catch (error) {
    logger.error({ error }, 'Failed to render template');
    throw createError.internal('Failed to render template');
  }
}
