
import { createError } from '../utils/errors';

import { analyzeTemplate } from './TemplateAnalysisService';
import { storageProvider } from './storage';
import { templateFileExists, getTemplateFilePath } from './templateFiles';

import type { PlaceholderInfo } from '../api/validators/templates';

// Path helpers live in templateFiles.ts (leaf module, no service imports)
// so that TemplateAnalysisService and others can use them without creating
// an import cycle with this file.
export { getTemplateFilePath, templateFileExists, getOutputFilePath, outputFileExists, OUTPUTS_DIR } from './templateFiles';

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

  const analysis = await analyzeTemplate(await getTemplateFilePath(fileRef));

  const placeholders: PlaceholderInfo[] = analysis.variables.map((v) => ({
    name: v.name,
    type: 'text',
    example: '',
  }));

  return placeholders;
}

// NOTE: template rendering lives in the document services
// (EnhancedDocumentEngine / FinalBlockRenderer / RenderCore); this module is
// file storage and placeholder extraction only.
