/**
 * ZIP Bundler
 *
 * Creates ZIP archives for multi-document outputs from Final Blocks.
 * Reuses pizzip library.
 *
 * Features:
 * - Bundle multiple DOCX/PDF documents
 * - Generate manifest file
 * - Configurable compression
 * - Memory-efficient streaming
 *
 * @version 1.0.1 - Security Hardening
 * @date December 8, 2025
 */

import PizZip from 'pizzip';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../../logger';

const logger = createLogger({ module: 'zip-bundler' });

// Safety Limits
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_FILE_COUNT = 100;
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// TYPES
// ============================================================================

export interface ZipDocument {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  size?: number;
}

export interface ZipOptions {
  compressionLevel?: number;
  includeManifest?: boolean;
  customManifest?: string;
  metadata?: Record<string, string>;
}

export interface ZipResult {
  filename: string;
  buffer: Buffer;
  size: number;
  fileCount: number;
  createdAt: Date;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Create ZIP archive from document buffers
 */
export async function createZipArchive(
  documents: ZipDocument[],
  archiveName: string,
  options: ZipOptions = {}
): Promise<ZipResult> {
  const opts: Required<ZipOptions> = {
    compressionLevel: options.compressionLevel ?? 6,
    includeManifest: options.includeManifest ?? true,
    customManifest: options.customManifest ?? '',
    metadata: options.metadata ?? {},
  };

  // 1. Fail Fast checks
  if (documents.length === 0) {
    throw new Error('Cannot create ZIP archive: no documents provided');
  }
  if (documents.length > MAX_FILE_COUNT) {
    throw new Error(`Too many documents (max: ${MAX_FILE_COUNT})`);
  }

  // 2. Validate Total Size before processing
  const totalSize = calculateTotalSize(documents);
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(`Total archive size exceeds limit of ${MAX_TOTAL_SIZE / (1024 * 1024)}MB`);
  }

  logger.info({
    archiveName,
    fileCount: documents.length,
    totalSize,
  }, 'Creating ZIP archive');

  try {
    const zip = new PizZip();
    const usedFilenames = new Set<string>();

    for (const doc of documents) {
      // 3. Security: Sanitize filename (Prevention of LFI/Path Traversal)
      let sanitizedFilename = sanitizeFilename(doc.filename);

      // Handle duplicates
      if (usedFilenames.has(sanitizedFilename)) {
        const ext = path.extname(sanitizedFilename);
        const name = path.basename(sanitizedFilename, ext);
        let counter = 1;
        while (usedFilenames.has(`${name}_${counter}${ext}`)) {
          counter++;
        }
        sanitizedFilename = `${name}_${counter}${ext}`;
      }
      usedFilenames.add(sanitizedFilename);

      // Validate single file size
      if (doc.buffer.length > MAX_SINGLE_FILE_SIZE) {
        throw new Error(`File ${sanitizedFilename} exceeds max size of ${MAX_SINGLE_FILE_SIZE / (1024 * 1024)}MB`);
      }

      zip.file(sanitizedFilename, doc.buffer, {
        compression: 'DEFLATE',
        compressionOptions: {
          level: opts.compressionLevel as any,
        },
      });
    }

    // Add manifest
    if (opts.includeManifest) {
      const manifestContent = opts.customManifest ||
        generateManifest(documents, opts.metadata);

      zip.file('manifest.txt', manifestContent, {
        compression: 'DEFLATE',
        compressionOptions: {
          level: opts.compressionLevel as any,
        },
      });
    }

    // Generate ZIP buffer
    const zipBuffer = zip.generate({
      type: 'nodebuffer' as any,
      compression: 'DEFLATE',
      compressionOptions: {
        level: opts.compressionLevel as any,
      },
    }) as unknown as Buffer;

    const result: ZipResult = {
      filename: `${sanitizeFilename(archiveName, false)}.zip`,
      buffer: zipBuffer,
      size: zipBuffer.length,
      fileCount: documents.length,
      createdAt: new Date(),
    };

    return result;
  } catch (error) {
    logger.error({ error, archiveName }, 'Failed to create ZIP archive');
    throw new Error(`ZIP creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create ZIP archive from file paths
 * Securely reads only basenames of files.
 */
export async function createZipFromPaths(
  filePaths: string[],
  archiveName: string,
  options: ZipOptions = {}
): Promise<ZipResult> {
  const documents: ZipDocument[] = [];

  for (const filePath of filePaths) {
    try {
      const buffer = await fs.readFile(filePath);
      const filename = path.basename(filePath); // Security: Always use basename
      const stats = await fs.stat(filePath);

      documents.push({
        filename,
        buffer,
        size: stats.size,
      });
    } catch (error) {
      logger.error({ filePath, error }, 'Failed to read file for ZIP');
      throw new Error(`Failed to read file: ${path.basename(filePath)}`);
    }
  }

  return createZipArchive(documents, archiveName, options);
}

/**
 * Save ZIP archive to disk
 */
export async function saveZipToDisk(
  zipResult: ZipResult,
  outputPath: string
): Promise<string> {
  // Security: Ensure we are only writing to the intended directory
  // We do NOT sanitize the whole path here (consumer may want nested folders),
  // but we must sanitize the filename.
  const sanitizedFilename = sanitizeFilename(zipResult.filename);
  const fullPath = path.join(outputPath, sanitizedFilename);

  // Verify that fullPath is inside outputPath (Path Traversal check)
  const resolvedOut = path.resolve(outputPath);
  const resolvedFull = path.resolve(fullPath);
  if (!resolvedFull.startsWith(resolvedOut)) {
    throw new Error("Security Error: Attempted path traversal in ZIP save");
  }

  try {
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(fullPath, zipResult.buffer);
    return fullPath;
  } catch (error) {
    logger.error({ error, outputPath }, 'Failed to save ZIP to disk');
    throw new Error(`Failed to save ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateManifest(
  documents: ZipDocument[],
  metadata: Record<string, string>
): string {
  const lines: string[] = [];
  lines.push('==========================================');
  lines.push('  WORKFLOW DOCUMENT BUNDLE');
  lines.push('==========================================');
  lines.push('');

  if (Object.keys(metadata).length > 0) {
    lines.push('Metadata:');
    for (const [key, value] of Object.entries(metadata)) {
      lines.push(`  ${key}: ${value}`);
    }
    lines.push('');
  }

  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Files: ${documents.length}`);
  lines.push('');
  lines.push('Files Included:');
  lines.push('------------------------------------------');

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const size = doc.size ?? doc.buffer.length;
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    lines.push(`${i + 1}. ${doc.filename}`);
    lines.push(`   Size: ${sizeMB} MB`);
    if (doc.mimeType) lines.push(`   Type: ${doc.mimeType}`);
    lines.push('');
  }
  lines.push('------------------------------------------');
  return lines.join('\n');
}

/**
 * Sanitize filename for ZIP archive
 * STRICT WHITELIST: Only allows [a-zA-Z0-9._-]
 */
function sanitizeFilename(filename: string, includeExtension: boolean = true): string {
  // 1. Strip path components
  const base = path.basename(filename);

  // 2. Strict Whitelist replacement
  // Replace anything that is NOT a letter, number, dot, underscore, or dash
  let sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 3. Trim
  sanitized = sanitized.trim();

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'document';
  }

  if (includeExtension && !path.extname(sanitized)) {
    sanitized += '.bin';
  }

  return sanitized;
}

export function calculateTotalSize(documents: ZipDocument[]): number {
  return documents.reduce((total, doc) => {
    return total + (doc.size ?? doc.buffer.length);
  }, 0);
}

export function validateDocuments(documents: ZipDocument[]): string[] {
  const errors: string[] = [];
  if (documents.length === 0) errors.push('No documents provided');
  if (documents.length > MAX_FILE_COUNT) errors.push(`Too many documents (max: ${MAX_FILE_COUNT})`);

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    if (!doc.filename) errors.push(`Document ${i}: Missing filename`);
    if (!doc.buffer) errors.push(`Document ${i}: Missing buffer`);
    if (doc.buffer && doc.buffer.length === 0) errors.push(`Document ${i} (${doc.filename}): Empty buffer`);
    if (doc.buffer && doc.buffer.length > MAX_SINGLE_FILE_SIZE) errors.push(`Document ${i} (${doc.filename}): Too large`);
  }

  const totalSize = calculateTotalSize(documents);
  if (totalSize > MAX_TOTAL_SIZE) errors.push(`Total archive size too large`);

  return errors;
}

export function getZipStats(zipResult: ZipResult): {
  compressionRatio: string;
  averageFileSize: string;
  sizeMB: string;
} {
  const sizeMB = (zipResult.size / (1024 * 1024)).toFixed(2);
  const avgFileSize = (zipResult.size / zipResult.fileCount / 1024).toFixed(2);
  return {
    compressionRatio: 'N/A',
    averageFileSize: `${avgFileSize} KB`,
    sizeMB: `${sizeMB} MB`,
  };
}

export async function createFinalBlockZip(
  documents: ZipDocument[],
  workflowId: string,
  runId: string,
  metadata?: Record<string, string>
): Promise<ZipResult> {
  const errors = validateDocuments(documents);
  if (errors.length > 0) {
    throw new Error(`Invalid documents for ZIP: ${errors.join(', ')}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `final-docs-${runId.slice(0, 8)}-${timestamp}`;

  const fullMetadata = {
    'Workflow ID': workflowId,
    'Run ID': runId,
    'Generated At': new Date().toISOString(),
    ...metadata,
  };

  return createZipArchive(documents, archiveName, {
    compressionLevel: 6,
    includeManifest: true,
    metadata: fullMetadata,
  });
}

export default {
  createZipArchive,
  createZipFromPaths,
  saveZipToDisk,
  calculateTotalSize,
  validateDocuments,
  getZipStats,
  createFinalBlockZip,
};
