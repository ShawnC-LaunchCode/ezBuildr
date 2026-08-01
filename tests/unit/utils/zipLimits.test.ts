import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  MAX_ZIP_COMPRESSION_RATIO,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  validateZipLimits,
} from '../../../server/utils/zipLimits';

const createZip = (entryName: string, content: string): Buffer => {
  const zip = new PizZip();
  zip.file(entryName, content);
  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
};

const withDeclaredUncompressedSize = (
  buffer: Buffer,
  uncompressedSize: number
): Buffer => {
  const result = Buffer.from(buffer);
  const centralDirectory = result.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]));
  expect(centralDirectory).toBeGreaterThanOrEqual(0);
  result.writeUInt32LE(uncompressedSize, centralDirectory + 24);
  return result;
};

describe('validateZipLimits', () => {
  it('accepts a normal DOCX ZIP without inflating its entries', () => {
    const buffer = createZip('word/document.xml', '<w:document>Hello</w:document>');

    const result = validateZipLimits(buffer, 'normal.docx');

    expect(result).toMatchObject({ ok: true });
    expect(result.totalUncompressed).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThan(MAX_ZIP_COMPRESSION_RATIO);
  });

  it('rejects a declared uncompressed total over 256 MB', () => {
    const buffer = withDeclaredUncompressedSize(
      createZip('word/document.xml', 'small'),
      MAX_ZIP_UNCOMPRESSED_BYTES + 1
    );

    const result = validateZipLimits(buffer, 'oversized.docx');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/uncompressed size.*256 MB limit/i);
    expect(result.totalUncompressed).toBe(MAX_ZIP_UNCOMPRESSED_BYTES + 1);
  });

  it('rejects a compression ratio over 100x', () => {
    const buffer = createZip('word/document.xml', 'A'.repeat(200_000));

    const result = validateZipLimits(buffer, 'high-ratio.docx');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/compression ratio.*100x limit/i);
    expect(result.ratio).toBeGreaterThan(MAX_ZIP_COMPRESSION_RATIO);
  });

  it.each([
    '../word/document.xml',
    '/word/document.xml',
    String.raw`C:\word\document.xml`,
  ])('rejects an entry that escapes the archive root: %s', (entryName) => {
    const result = validateZipLimits(createZip(entryName, 'safe'), 'traversal.docx');

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('escapes archive root');
  });
});
