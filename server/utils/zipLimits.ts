import PizZip from 'pizzip';

import { logger } from '../logger';

// docs/hardening/docx-editor-gate.md §2: cap DOCX expansion at 256 MB and 100x.
export const MAX_ZIP_UNCOMPRESSED_BYTES = parseInt(
  process.env.MAX_DOCX_UNCOMPRESSED_BYTES ?? String(256 * 1024 * 1024),
  10
);
export const MAX_ZIP_COMPRESSION_RATIO = parseInt(
  process.env.MAX_DOCX_COMPRESSION_RATIO ?? '100',
  10
);

export interface ZipLimitValidationResult {
  ok: boolean;
  reason?: string;
  totalUncompressed: number;
  ratio: number;
}

interface CompressedEntryMetadata {
  compressedSize: number;
  uncompressedSize: number;
}

type ZipObjectWithMetadata = PizZip.ZipObject & {
  _data?: CompressedEntryMetadata;
};

const invalidResult = (
  filename: string,
  reason: string,
  totalUncompressed: number,
  ratio: number
): ZipLimitValidationResult => {
  logger.warn(
    { filename, reason, totalUncompressed, ratio },
    'DOCX ZIP safety validation failed'
  );
  return { ok: false, reason, totalUncompressed, ratio };
};

const escapesArchiveRoot = (entryName: string): boolean => {
  const hasTraversalSegment = entryName.split(/[\\/]/).includes('..');
  const isAbsolute = entryName.startsWith('/') || entryName.startsWith('\\');
  const hasDriveLetter = /^[A-Za-z]:[\\/]/.test(entryName);
  return hasTraversalSegment || isAbsolute || hasDriveLetter;
};

/**
 * Validate declared ZIP metadata without inflating any archive entry.
 */
export function validateZipLimits(
  buffer: Buffer,
  filename: string
): ZipLimitValidationResult {
  try {
    const zip = new PizZip(buffer);
    let totalCompressed = 0;
    let totalUncompressed = 0;

    for (const entry of Object.values(zip.files) as ZipObjectWithMetadata[]) {
      if (escapesArchiveRoot(entry.name)) {
        return invalidResult(
          filename,
          `ZIP entry escapes archive root: ${entry.name}`,
          totalUncompressed,
          totalCompressed === 0 ? 0 : totalUncompressed / totalCompressed
        );
      }

      if (entry._data === undefined) {
        return invalidResult(
          filename,
          `ZIP entry metadata is unavailable: ${entry.name}`,
          totalUncompressed,
          0
        );
      }

      totalCompressed += entry._data.compressedSize;
      totalUncompressed += entry._data.uncompressedSize;
    }

    const ratio = totalCompressed === 0
      ? (totalUncompressed === 0 ? 0 : Number.POSITIVE_INFINITY)
      : totalUncompressed / totalCompressed;

    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      const limitMb = MAX_ZIP_UNCOMPRESSED_BYTES / (1024 * 1024);
      return invalidResult(
        filename,
        `Declared uncompressed size exceeds the ${limitMb} MB limit`,
        totalUncompressed,
        ratio
      );
    }

    if (ratio > MAX_ZIP_COMPRESSION_RATIO) {
      return invalidResult(
        filename,
        `Compression ratio exceeds the ${MAX_ZIP_COMPRESSION_RATIO}x limit`,
        totalUncompressed,
        ratio
      );
    }

    return { ok: true, totalUncompressed, ratio };
  } catch (error: unknown) {
    logger.warn({ filename, error }, 'DOCX ZIP metadata could not be read');
    return {
      ok: false,
      reason: 'Invalid or unreadable DOCX ZIP archive',
      totalUncompressed: 0,
      ratio: 0,
    };
  }
}
