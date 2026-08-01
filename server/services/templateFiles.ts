/**
 * Template/output file path helpers.
 *
 * Leaf module with no service imports — safe for any service to depend on.
 * (templates.ts imports TemplateAnalysisService, which needs these helpers;
 * keeping them here breaks that import cycle.)
 */
import path from 'path';

import { storageProvider } from './storage';

import type { StorageProvider } from './storage/types';

export const OUTPUTS_DIR = path.resolve(process.cwd(), 'server/files/outputs');

/**
 * Resolve a storage-backed template to a local path. Remote providers own the
 * download/cache lifecycle; callers must not derive paths from file refs.
 */
export async function getTemplateFilePath(
  fileRef: string,
  provider: Pick<StorageProvider, 'getLocalPath'> = storageProvider
): Promise<string> {
  return provider.getLocalPath(fileRef);
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
