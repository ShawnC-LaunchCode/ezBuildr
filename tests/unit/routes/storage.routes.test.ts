/**
 * GET /api/storage/files/* (GH-169B Finding 2).
 *
 * `DiskStorageProvider.getSignedUrl()` used to return a URL for a route that
 * did not exist anywhere in the repo — a guaranteed 404 for every disk-backed
 * template/preview/output download in production. This proves the route now
 * exists, is reachable WITHOUT a session (the signature is the credential —
 * no `hybridAuth` mock is registered here on purpose), and enforces the HMAC
 * contract: valid signature streams the file (AC2), tampered signature and
 * expired `exp` both 403 with constant-time comparison (AC3), and a
 * well-signed but nonexistent key 404s rather than 500ing (AC4).
 *
 * AC5's round trip is proven directly: `DiskStorageProvider.getSignedUrl()`
 * (the real implementation, not a stub) produces the URL under test, and
 * that URL is sent straight into the route via supertest.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { getFileMock } = vi.hoisted(() => ({ getFileMock: vi.fn() }));

vi.mock('../../../server/services/storage', () => ({
  storageProvider: { getFile: getFileMock },
}));

vi.mock('../../../server/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { DiskStorageProvider } from '../../../server/services/storage/DiskStorageProvider';
import { registerStorageRoutes } from '../../../server/routes/storage.routes';
import { createError } from '../../../server/utils/errors';

describe('GET /api/storage/files/*', () => {
  let app: Express;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-storage-signing-secret-32-chars-min';
    app = express();
    registerStorageRoutes(app);
  });

  afterAll(() => {
    process.env.SESSION_SECRET = originalSessionSecret;
  });

  beforeEach(() => {
    getFileMock.mockReset();
  });

  // The signer used by getSignedUrl() is a standalone instance — no disk
  // access happens because getSignedUrl() never touches the filesystem.
  const signer = new DiskStorageProvider('/unused-base-dir');

  it('is reachable without any session/auth header — the signature is the credential', async () => {
    getFileMock.mockResolvedValue(Buffer.from('hello world'));
    const signedUrl = await signer.getSignedUrl('notes/greeting.txt', 300);

    const response = await request(app).get(signedUrl);

    expect(response.status).toBe(200);
  });

  it('AC2: streams a stored file for a valid signature, with no-store caching', async () => {
    getFileMock.mockResolvedValue(Buffer.from('hello world'));
    const signedUrl = await signer.getSignedUrl('notes/greeting.txt', 300);

    const response = await request(app).get(signedUrl);

    expect(response.status).toBe(200);
    expect(response.text).toBe('hello world');
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(getFileMock).toHaveBeenCalledWith('notes/greeting.txt');
  });

  it('AC5: a URL DiskStorageProvider.getSignedUrl() produces round-trips through the route', async () => {
    getFileMock.mockResolvedValue(Buffer.from('%PDF-1.4 fake pdf bytes'));
    const signedUrl = await signer.getSignedUrl('previews/output.pdf', 300);

    expect(signedUrl).toMatch(/^\/api\/storage\/files\/previews\/output\.pdf\?exp=\d+&sig=[0-9a-f]+$/);

    const response = await request(app).get(signedUrl);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
  });

  it('AC3: rejects a tampered signature with 403 and never reaches storage', async () => {
    const signedUrl = await signer.getSignedUrl('notes/greeting.txt', 300);
    const tampered = signedUrl.replace(/sig=[0-9a-f]+/, `sig=${'0'.repeat(64)}`);

    const response = await request(app).get(tampered);

    expect(response.status).toBe(403);
    expect(getFileMock).not.toHaveBeenCalled();
  });

  it('AC3: rejects a signature whose sig has a mismatched length instead of throwing', async () => {
    const signedUrl = await signer.getSignedUrl('notes/greeting.txt', 300);
    const shortSig = signedUrl.replace(/sig=[0-9a-f]+/, 'sig=abcd');

    const response = await request(app).get(shortSig);

    expect(response.status).toBe(403);
    expect(getFileMock).not.toHaveBeenCalled();
  });

  it('AC3: rejects an expired exp (correctly signed, but in the past) with 403', async () => {
    const signedUrl = await signer.getSignedUrl('notes/greeting.txt', -10);

    const response = await request(app).get(signedUrl);

    expect(response.status).toBe(403);
    expect(getFileMock).not.toHaveBeenCalled();
  });

  it('AC4: returns 404, not 500, for a well-signed but nonexistent key', async () => {
    getFileMock.mockRejectedValue(createError.notFound('File not found in storage'));
    const signedUrl = await signer.getSignedUrl('notes/does-not-exist.txt', 300);

    const response = await request(app).get(signedUrl);

    expect(response.status).toBe(404);
  });

  it('rejects a request with no signature at all', async () => {
    const response = await request(app).get('/api/storage/files/notes/greeting.txt');

    expect(response.status).toBe(403);
    expect(getFileMock).not.toHaveBeenCalled();
  });
});
