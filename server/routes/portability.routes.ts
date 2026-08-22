import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { exportService } from "../services/portability/ExportService";
import { importService } from "../services/portability/ImportService";
import { BundleSizeLimitError } from "../services/portability/bundleFormat";
import { strictLimiter } from "../middleware/rateLimiter";
import { auditLogService } from "../services/AuditLogService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from '../utils/routeErrors';
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";

import type { Express, Request, Response, NextFunction } from "express";
import { rlsContext } from "../middleware/rlsContext";

const logger = createLogger({ module: "portability-routes" });

/**
 * Cap on the COMPRESSED upload. Distinct from the reader's uncompressed limits
 * (MAX_TOTAL_SIZE / MAX_SINGLE_ENTRY_SIZE), which guard zip-bomb expansion
 * after this gate has already accepted the bytes.
 */
const MAX_BUNDLE_UPLOAD_BYTES = Number(
  process.env.PORTABILITY_MAX_UPLOAD_BYTES ?? String(250 * 1024 * 1024)
);

const bundleUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      cb(null, `import-${suffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: MAX_BUNDLE_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.ezb') || file.mimetype === 'application/zip' ||
        file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only .ezb bundle files are supported'));
    }
  }
});

/**
 * multer reports failures to the error chain, where they would surface as 500s.
 * Handling them here keeps the size cap a 413 and a rejected file type a 400
 * (IEX-11 AC 4 and AC 5).
 */
function uploadBundle(req: Request, res: Response, next: NextFunction): void {
  bundleUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          message: `Bundle exceeds the ${Math.floor(MAX_BUNDLE_UPLOAD_BYTES / 1024 / 1024)}MB upload limit`
        });
        return;
      }
      res.status(400).json({ message: err.message });
      return;
    }
    if (err !== null && err !== undefined) {
      res.status(400).json({ message: err instanceof Error ? err.message : 'Invalid upload' });
      return;
    }
    next();
  });
}

/**
 * A malformed bundle is bad client input, not a server fault, but bundleReader
 * throws plain Errors that `classifyRouteError` would collapse into 500s. These
 * are the signals that mean "the uploaded artifact is at fault" — matched here
 * so a corrupt upload answers 400 (AC 4). Anything unrecognised still falls
 * through to the generic 500, so real server bugs are not disguised as 400s.
 */
const BUNDLE_REJECTION_SIGNALS = [
  'Missing manifest.json',
  'Format version',
  'Entry count overflow',
  'Path traversal detected',
  'Single entry size overflow',
  'Compression ratio overflow',
  'Total size overflow',
  'Checksum mismatch',
  'Invalid or unsupported zip',
  'END header',
  'Validation failed in',
  'integrity check failed',
  'malware detected',
  'Unresolvable reference',
  'Bundle roots not found',
  'Duplicate entry detected',
  'Size mismatch',
  'newer version of ezBuildr'
];

function classifyImportError(error: unknown, fallback: string): { status: number; message: string } {
  if (error instanceof z.ZodError) {
    return { status: 400, message: 'Invalid bundle: manifest failed validation' };
  }
  if (error instanceof BundleSizeLimitError) {
    return { status: 413, message: error.message };
  }
  const raw = error instanceof Error ? error.message : '';
  if (BUNDLE_REJECTION_SIGNALS.some(signal => raw.includes(signal))) {
    return { status: 400, message: `Invalid bundle: ${raw}` };
  }
  return classifyRouteError(error, fallback);
}

const previewOptionsSchema = z.object({
  targetProjectId: z.string().uuid().optional()
});

/** Explicit allowlist — never spread the multipart body into service options. */
const applyOptionsSchema = z.object({
  targetProjectId: z.string().uuid().optional(),
  targetOwnerType: z.enum(['user', 'org']).optional(),
  targetOwnerUuid: z.string().uuid().optional(),
  name: z.string().max(255).optional()
});

const cleanupUpload = async (filePath?: string): Promise<void> => {
  if (filePath === undefined) {return;}
  try {
    await fs.promises.unlink(filePath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      logger.warn({ error: e, filePath }, 'Failed to clean up uploaded bundle');
    }
  }
};

export function registerPortabilityRoutes(app: Express): void {
  const handleExport = async (req: Request, res: Response, scope: 'workflow' | 'project' | 'database'): Promise<Response | void> => {
    let tmpPathToDelete: string | null = null;
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const id = req.params.id;
      const result = await exportService.exportToFile({ scope, id }, userId);
      tmpPathToDelete = result.tmpPath;
      
      const { manifest, tenantId } = result;

      // Bundles run to hundreds of MB; stat them off-thread like every other
      // file operation in this path.
      const { size: sizeBytes } = await fs.promises.stat(result.tmpPath);

      // The record that answers "who took a copy of this client's data, and
      // from where" — so it carries the caller's address, not just the actor.
      await auditLogService.logDataExport({
        userId,
        scope,
        rootId: id,
        tenantId,
        entityCounts: manifest.entityCounts,
        blobCount: manifest.blobCount,
        sizeBytes,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="ezbuildr-${scope}-${id}-export.ezb"`);
      
      const stream = fs.createReadStream(result.tmpPath);
      stream.on('close', () => {
        fs.promises.unlink(result.tmpPath).catch(() => {});
      });
      stream.on('error', (error) => {
        logger.error({ error }, "Error streaming export");
        if (!res.headersSent) {
          res.status(500).json({ message: "Error streaming export" });
        }
      });
      stream.pipe(res);

    } catch (error) {
      if (tmpPathToDelete) {
        fs.promises.unlink(tmpPathToDelete).catch(() => {});
      }
      logger.error({ error }, "Error exporting portability bundle");
      const { status, message } = classifyRouteError(error, "Failed to export portability bundle");
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    }
  };

  /**
   * The same export, reported rather than streamed — what the pre-download
   * disclosure reads (IEX3-4).
   *
   * Deliberately unlogged, matching the import preview route below: this
   * writes nothing and hands back no data, only counts and the list of things
   * that were withheld. The download itself is still audited. Authorization,
   * rate limiting and error classification are `handleExport`'s, unchanged —
   * the manifest names entity counts for a tenant's workflow, so it must not
   * be reachable by anyone who could not export it.
   */
  const handleManifest = async (req: Request, res: Response, scope: 'workflow' | 'project' | 'database'): Promise<Response | void> => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const manifest = await exportService.computeManifest({ scope, id: req.params.id }, userId);
      return res.json(manifest);
    } catch (error) {
      logger.error({ error }, "Error computing portability manifest");
      const { status, message } = classifyRouteError(error, "Failed to compute export manifest");
      return res.status(status).json({ message });
    }
  };

  app.get('/api/portability/export/workflow/:id/manifest', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleManifest(req, res, 'workflow');
  }));

  app.get('/api/portability/export/project/:id/manifest', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleManifest(req, res, 'project');
  }));

  app.get('/api/portability/export/database/:id/manifest', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleManifest(req, res, 'database');
  }));

  // `hybridAuth` before `strictLimiter`, matching the convention for
  // authenticated resource routes (sections.routes.ts:87, steps.routes.ts:120).
  // Limiter-first is for token/public routes that cannot identify a caller.
  // Here it would let anonymous traffic burn the per-IP budget: ten unauthorized
  // requests exhaust the window and every legitimate user behind that IP — an
  // office NAT or VPN — is locked out of exports for 15 minutes.
  app.get('/api/portability/export/workflow/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'workflow');
  }));

  app.get('/api/portability/export/project/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'project');
  }));

  app.get('/api/portability/export/database/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'database');
  }));

  // Import is a two-step interaction: preview tells the user what a bundle will
  // do, apply performs it. Middleware order matches the export routes above —
  // `hybridAuth` first so anonymous 401s cannot burn the per-IP rate budget.
  app.post('/api/portability/import/preview', hybridAuth, strictLimiter, uploadBundle, rlsContext,
    asyncHandler(async (req: Request, res: Response) => {
      const filePath = req.file?.path;
      try {
        const userId = (req as AuthRequest).userId;
        if (userId === undefined || userId === '') {
          return res.status(401).json({ message: "Unauthorized - no user ID" });
        }
        if (filePath === undefined) {
          return res.status(400).json({ message: "Bundle file upload required" });
        }

        const options = previewOptionsSchema.safeParse(req.body ?? {});
        if (!options.success) {
          return res.status(400).json({ message: 'Invalid input', errors: options.error.errors });
        }
        const targetProjectId = options.data.targetProjectId;

        const preview = await importService.preview(filePath, userId, targetProjectId);

        // A bundle that could not be opened at all is malformed input, not a
        // previewable artifact. ImportService reports that as an error entry
        // rather than throwing (its contract is "report, never write"), so the
        // status decision belongs here in the HTTP layer. Row-level validation
        // problems still return 200 with canProceed=false — that is a useful
        // preview, and the caller is meant to see it.
        const unparseable = preview.errors.some(e => e.startsWith('Failed to parse bundle'));
        if (unparseable) {
          return res.status(400).json({
            message: `Invalid bundle: ${preview.errors[0]}`,
            errors: preview.errors
          });
        }

        // Deliberately unlogged: preview writes nothing (AC 6).
        return res.json(preview);
      } catch (error) {
        logger.error({ error }, "Error previewing portability bundle");
        const { status, message } = classifyImportError(error, "Failed to preview bundle");
        return res.status(status).json({ message });
      } finally {
        await cleanupUpload(filePath);
      }
    }));

  app.post('/api/portability/import/apply', hybridAuth, strictLimiter, uploadBundle, rlsContext,
    asyncHandler(async (req: Request, res: Response) => {
      const filePath = req.file?.path;
      try {
        const userId = (req as AuthRequest).userId;
        if (userId === undefined || userId === '') {
          return res.status(401).json({ message: "Unauthorized - no user ID" });
        }
        if (filePath === undefined) {
          return res.status(400).json({ message: "Bundle file upload required" });
        }

        const parsed = applyOptionsSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
        }

        const result = await importService.apply(filePath, userId, parsed.data);

        // The record answering "who pushed data into this tenant, and what did
        // it create". Applies only — previews create nothing to account for.
        await auditLogService.logDataImport({
          userId,
          scope: result.scope,
          rootId: result.rootId,
          tenantId: result.tenantId,
          entityCounts: result.entityCounts,
          blobsRestored: result.blobsRestored,
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null
        });

        return res.status(201).json({
          rootId: result.rootId,
          scope: result.scope,
          entityCounts: result.entityCounts,
          blobsRestored: result.blobsRestored,
          warnings: result.warnings,
          // Structural decisions the server took on the caller's behalf — most
          // importantly "this workflow was left without a project". The service
          // has composed these since IEX-15 and the route dropped them, so the
          // import completed and the explanation went nowhere (IEX3-9).
          adjustments: result.adjustments
        });
      } catch (error) {
        logger.error({ error }, "Error applying portability bundle");
        const { status, message } = classifyImportError(error, "Failed to import bundle");
        return res.status(status).json({ message });
      } finally {
        await cleanupUpload(filePath);
      }
    }));
}
