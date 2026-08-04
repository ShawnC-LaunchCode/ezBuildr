/**
 * S3StorageProvider (GH-169B Finding 6 — this class had zero test coverage).
 *
 * Mocks `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` entirely —
 * no network calls, no real bucket, ever. Covers:
 *  - AC6: exists() returns false only for a genuine 404/NotFound and
 *    rethrows everything else (the dead second `return false` + its
 *    `sonarjs` suppression are gone).
 *  - AC7: getMetadata() populates `custom` from `response.Metadata`.
 *  - AC8: getLocalPath() maps distinct keys to distinct temp files and
 *    re-downloads when the cached copy's ETag no longer matches.
 *  - Signed-URL generation delegates to the AWS presigner with the right
 *    bucket/key/expiry.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
const { getSignedUrlMock } = vi.hoisted(() => ({ getSignedUrlMock: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => {
  class FakeS3 {
    send = sendMock;
  }
  class FakeCommand<T> {
    input: T;
    constructor(input: T) {
      this.input = input;
    }
  }
  return {
    S3: FakeS3,
    GetObjectCommand: class extends FakeCommand<Record<string, unknown>> {},
    PutObjectCommand: class extends FakeCommand<Record<string, unknown>> {},
    DeleteObjectCommand: class extends FakeCommand<Record<string, unknown>> {},
    HeadObjectCommand: class extends FakeCommand<Record<string, unknown>> {},
    ListObjectsV2Command: class extends FakeCommand<Record<string, unknown>> {},
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock('../../../server/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { S3StorageProvider } from '../../../server/services/storage/S3StorageProvider';

function notFoundError(): Error & { name: string; $metadata: { httpStatusCode: number } } {
  const error = new Error('Not Found') as Error & { name: string; $metadata: { httpStatusCode: number } };
  error.name = 'NotFound';
  error.$metadata = { httpStatusCode: 404 };
  return error;
}

function accessDeniedError(): Error & { name: string; $metadata: { httpStatusCode: number } } {
  const error = new Error('Access Denied') as Error & { name: string; $metadata: { httpStatusCode: number } };
  error.name = 'AccessDenied';
  error.$metadata = { httpStatusCode: 403 };
  return error;
}

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  const cacheFiles: string[] = [];

  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    provider = new S3StorageProvider({ bucket: 'test-bucket', region: 'us-east-1' });
  });

  afterEach(async () => {
    while (cacheFiles.length > 0) {
      const file = cacheFiles.pop();
      if (file) {
        await fs.unlink(file).catch(() => undefined);
      }
    }
  });

  describe('exists() — AC6', () => {
    it('returns true when HeadObject succeeds', async () => {
      sendMock.mockResolvedValueOnce({});
      await expect(provider.exists('templates/foo.docx')).resolves.toBe(true);
    });

    it('returns false for a NotFound error', async () => {
      sendMock.mockRejectedValueOnce(notFoundError());
      await expect(provider.exists('templates/missing.docx')).resolves.toBe(false);
    });

    it('returns false for a bare 404 status with no name', async () => {
      const error = new Error('boom') as Error & { $metadata: { httpStatusCode: number } };
      error.$metadata = { httpStatusCode: 404 };
      sendMock.mockRejectedValueOnce(error);
      await expect(provider.exists('templates/missing2.docx')).resolves.toBe(false);
    });

    it('rethrows a non-404 error instead of reporting "missing"', async () => {
      sendMock.mockRejectedValueOnce(accessDeniedError());
      await expect(provider.exists('templates/forbidden.docx')).rejects.toThrow('Access Denied');
    });
  });

  describe('getMetadata() — AC7', () => {
    it('populates custom from response.Metadata', async () => {
      sendMock.mockResolvedValueOnce({
        ContentType: 'application/pdf',
        ContentLength: 1234,
        ETag: '"abc123"',
        LastModified: new Date('2026-01-01T00:00:00Z'),
        Metadata: { expiresAt: '2026-12-31', ownerId: 'tenant-1' },
      });

      const metadata = await provider.getMetadata('outputs/result.pdf');

      expect(metadata.custom).toEqual({ expiresAt: '2026-12-31', ownerId: 'tenant-1' });
      expect(metadata.contentType).toBe('application/pdf');
      expect(metadata.size).toBe(1234);
      expect(metadata.etag).toBe('"abc123"');
    });

    it('leaves custom undefined when the object has no custom metadata', async () => {
      sendMock.mockResolvedValueOnce({
        ContentType: 'application/pdf',
        ContentLength: 10,
      });

      const metadata = await provider.getMetadata('outputs/plain.pdf');
      expect(metadata.custom).toBeUndefined();
    });

    it('throws a not-found error for a missing object', async () => {
      sendMock.mockRejectedValueOnce(notFoundError());
      await expect(provider.getMetadata('outputs/missing.pdf')).rejects.toThrow(/not found/i);
    });
  });

  describe('getSignedUrl()', () => {
    it('delegates to the AWS presigner with the bucket, key, and expiry', async () => {
      getSignedUrlMock.mockResolvedValueOnce('https://s3.example.com/signed?X-Amz-Signature=abc');

      const url = await provider.getSignedUrl('templates/foo.docx', 120);

      expect(url).toBe('https://s3.example.com/signed?X-Amz-Signature=abc');
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
      const [, command, options] = getSignedUrlMock.mock.calls[0] as [
        unknown,
        { input: Record<string, unknown> },
        { expiresIn: number },
      ];
      expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'templates/foo.docx' });
      expect(options).toEqual({ expiresIn: 120 });
    });

    it('wraps a presigner failure as an internal error', async () => {
      getSignedUrlMock.mockRejectedValueOnce(new Error('presign blew up'));
      await expect(provider.getSignedUrl('templates/foo.docx')).rejects.toThrow('Failed to generate signed URL');
    });
  });

  describe('getLocalPath() — AC8', () => {
    function mockHead(etag: string): void {
      sendMock.mockResolvedValueOnce({ ContentType: 'application/pdf', ContentLength: 5, ETag: etag });
    }

    function mockGet(body: string): void {
      sendMock.mockResolvedValueOnce({ Body: [Buffer.from(body)] });
    }

    it('maps distinct keys to distinct temp files instead of colliding', async () => {
      mockHead('"etag-a"');
      mockGet('file a');
      const pathA = await provider.getLocalPath('a/b.docx');
      cacheFiles.push(pathA, `${pathA}.etag`);

      mockHead('"etag-b"');
      mockGet('file b');
      const pathB = await provider.getLocalPath('a_b.docx');
      cacheFiles.push(pathB, `${pathB}.etag`);

      // Old behaviour sanitized both refs to the same "a_b.docx" filename.
      expect(pathA).not.toBe(pathB);
      expect(path.dirname(pathA)).toBe(os.tmpdir());
    });

    it('downloads once and reuses the cache while the ETag is unchanged', async () => {
      mockHead('"stable-etag"');
      mockGet('cached contents');
      const firstPath = await provider.getLocalPath('reports/quarterly.pdf');
      cacheFiles.push(firstPath, `${firstPath}.etag`);
      expect(await fs.readFile(firstPath, 'utf8')).toBe('cached contents');

      const getCallsAfterFirstDownload = sendMock.mock.calls.length;

      // Second call: HeadObject returns the same ETag, so no GetObject call
      // should happen — the cached file is reused as-is.
      mockHead('"stable-etag"');
      const secondPath = await provider.getLocalPath('reports/quarterly.pdf');

      expect(secondPath).toBe(firstPath);
      // Only the second HeadObject call happened; no additional GetObject.
      expect(sendMock.mock.calls.length).toBe(getCallsAfterFirstDownload + 1);
    });

    it('re-downloads when the cached ETag no longer matches the object', async () => {
      mockHead('"etag-v1"');
      mockGet('version one');
      const firstPath = await provider.getLocalPath('reports/annual.pdf');
      cacheFiles.push(firstPath, `${firstPath}.etag`);
      expect(await fs.readFile(firstPath, 'utf8')).toBe('version one');

      // Object changed in the bucket: HeadObject now reports a new ETag.
      mockHead('"etag-v2"');
      mockGet('version two');
      const secondPath = await provider.getLocalPath('reports/annual.pdf');

      expect(secondPath).toBe(firstPath);
      expect(await fs.readFile(secondPath, 'utf8')).toBe('version two');
    });
  });
});
