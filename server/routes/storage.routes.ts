import path from 'path';

import { Router } from 'express';

import { logger } from '../logger';
import { storageProvider } from '../services/storage';
import { isStorageSignatureExpired, verifyStorageSignature } from '../services/storage/signedUrl';
import { asyncHandler } from '../utils/asyncHandler';
import { createError } from '../utils/errors';
import { classifyRouteError } from '../utils/routeErrors';

import type { Express } from 'express';

const router = Router();

const CONTENT_TYPES_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function contentTypeForKey(key: string): string {
  return CONTENT_TYPES_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Serves files behind the signed URLs `StorageProvider.getSignedUrl()`
 * produces (GH-169B Finding 2). `DiskStorageProvider.getSignedUrl()` used to
 * point here without this route existing at all — a guaranteed 404 for every
 * disk-backed template/preview/output download in production.
 *
 * Deliberately reachable WITHOUT a session: keys are shared across tenants'
 * templates, previews, and outputs with no per-key owner record to check, so
 * `hybridAuth` would not be an authorization decision here. The HMAC
 * signature (`exp` + `sig`, verified below) is the credential instead — that
 * is the entire point of a signed URL. Path traversal is handled inside
 * `DiskStorageProvider.resolveWithinBase()`; the key is passed straight
 * through to `storageProvider.getFile()` to inherit that guard rather than
 * building any path here.
 */
router.get('/api/storage/files/*', asyncHandler(async (req, res) => {
  const key = req.params[0];
  const { exp: expParam, sig } = req.query;
  try {
    if (!key || typeof sig !== 'string' || typeof expParam !== 'string') {
      throw createError.forbidden('Missing or invalid signature');
    }
    const exp = Number(expParam);
    if (!Number.isFinite(exp) || !verifyStorageSignature(key, exp, sig)) {
      throw createError.forbidden('Invalid signature');
    }
    if (isStorageSignatureExpired(exp)) {
      throw createError.forbidden('Signed URL has expired');
    }

    const buffer = await storageProvider.getFile(key);
    res.setHeader('Content-Type', contentTypeForKey(key));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    logger.error({ error, key }, 'Failed to serve signed storage file');
    const { status, message } = classifyRouteError(error, 'Failed to retrieve file');
    res.status(status).json({ message });
  }
}));

export function registerStorageRoutes(app: Express): void {
  app.use(router);
}

export default router;
