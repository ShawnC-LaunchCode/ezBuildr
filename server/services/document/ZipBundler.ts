/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
// @ts-expect-error - archiver type definition is missing default export but it is provided by Node ESM
import archiver from 'archiver';

import { createLogger } from '../../logger';

const logger = createLogger({ module: 'zip-bundler' });

const MAX_FILE_COUNT = 100;

export interface ZipDocument {
  filename: string;
  filePath: string;
  mimeType?: string;
}

export interface ZipOptions {
  compressionLevel?: number;
  includeManifest?: boolean;
  customManifest?: string;
  metadata?: Record<string, string>;
}

export interface ZipResult {
  filename: string;
  filePath: string;
  fileCount: number;
  createdAt: Date;
}

export async function createZipArchive(
  documents: ZipDocument[],
  archiveName: string,
  outputPath: string,
  options: ZipOptions = {}
): Promise<ZipResult> {
  const opts: Required<ZipOptions> = {
    compressionLevel: options.compressionLevel ?? 6,
    includeManifest: options.includeManifest ?? true,
    customManifest: options.customManifest ?? '',
    metadata: options.metadata ?? {},
  };

  if (documents.length === 0) {
    throw new Error('Cannot create ZIP archive: no documents provided');
  }
  if (documents.length > MAX_FILE_COUNT) {
    throw new Error(`Too many documents (max: ${MAX_FILE_COUNT})`);
  }

  const sanitizedArchiveName = `${sanitizeFilename(archiveName, false)}.zip`;
  const fullOutputPath = path.join(outputPath, sanitizedArchiveName);

  logger.info({
    archiveName,
    fullOutputPath,
    fileCount: documents.length,
  }, 'Creating streamed ZIP archive');

  await fs.mkdir(outputPath, { recursive: true });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(fullOutputPath);
    const archive = archiver('zip', {
      zlib: { level: opts.compressionLevel }
    });

    output.on('close', () => {
      resolve({
        filename: sanitizedArchiveName,
        filePath: fullOutputPath,
        fileCount: documents.length,
        createdAt: new Date(),
      });
    });

    archive.on('error', (err: unknown) => {
      logger.error({ error: err }, 'Archiver error');
      reject(err);
    });

    archive.pipe(output);

    const usedFilenames = new Set<string>();

    for (const doc of documents) {
      let sanitizedFilename = sanitizeFilename(doc.filename);
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

      archive.file(doc.filePath, { name: sanitizedFilename });
    }

    if (opts.includeManifest) {
      const manifestContent = opts.customManifest || generateManifest(documents, opts.metadata);
      archive.append(manifestContent, { name: 'manifest.txt' });
    }

    void archive.finalize();
  });
}

export async function createZipFromPaths(
  filePaths: string[],
  archiveName: string,
  outputPath: string,
  options: ZipOptions = {}
): Promise<ZipResult> {
  const documents: ZipDocument[] = filePaths.map(fp => ({
    filename: path.basename(fp),
    filePath: fp
  }));
  return createZipArchive(documents, archiveName, outputPath, options);
}

export async function createFinalBlockZip(
  documents: ZipDocument[],
  workflowId: string,
  runId: string,
  outputPath: string,
  metadata?: Record<string, string>
): Promise<ZipResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `final-docs-${runId.slice(0, 8)}-${timestamp}`;

  const fullMetadata = {
    'Workflow ID': workflowId,
    'Run ID': runId,
    'Generated At': new Date().toISOString(),
    ...metadata,
  };

  return createZipArchive(documents, archiveName, outputPath, {
    compressionLevel: 6,
    includeManifest: true,
    metadata: fullMetadata,
  });
}

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
    lines.push(`${i + 1}. ${doc.filename}`);
    if (doc.mimeType) {lines.push(`   Type: ${doc.mimeType}`);}
    lines.push('');
  }
  lines.push('------------------------------------------');
  return lines.join('\n');
}

function sanitizeFilename(filename: string, includeExtension: boolean = true): string {
  const base = path.basename(filename);
  let sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  sanitized = sanitized.trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'document';
  }
  if (includeExtension && !path.extname(sanitized)) {
    sanitized += '.bin';
  }
  return sanitized;
}

export default {
  createZipArchive,
  createZipFromPaths,
  createFinalBlockZip,
};
