/**
 * Template/output file path helpers.
 *
 * Leaf module with no service imports — safe for any service to depend on.
 * (templates.ts imports TemplateAnalysisService, which needs these helpers;
 * keeping them here breaks that import cycle.)
 */
import path from 'path';

import { storageProvider } from './storage';

export const OUTPUTS_DIR = path.join(process.cwd(), 'server', 'files', 'outputs');

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
