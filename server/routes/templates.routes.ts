/* eslint-disable max-lines -- route file with many endpoints */
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { eq, and, desc, lt } from 'drizzle-orm';
import { Router, type Request, type Response } from 'express';
import { type FileFilterCallback } from 'multer';
import multer from 'multer';
import { z } from 'zod';

import * as schema from '@shared/schema';

import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  templateParamsSchema,
  projectIdParamsSchema,
  type ExtractPlaceholdersResponse,
} from '../api/validators/templates';
import { db } from '../db';
import { logger } from '../logger';
import { hybridAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
import { requirePermission } from '../middleware/rbac';
import { requireTenant } from '../middleware/tenant';
import { pdfService } from '../services/document/PdfService';
import { templateScanner } from '../services/document/TemplateScanner';
import {
  DOCUMENT_PROCESSING_TIMEOUT_MS,
  documentProcessingLimiter,
} from '../services/processingLimiter';
import { virusScanner } from '../services/security/VirusScanner';
import { storageQuotaService } from '../services/StorageQuotaService';
import {
  saveTemplateFile,
  deleteTemplateFile,
  extractPlaceholders,
} from '../services/templates';
import { asyncHandler } from '../utils/asyncHandler';
import { isProcessingTimeoutError, withTimeout } from '../utils/concurrency';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';

import type { AuthRequest } from '../middleware/auth';
import type { PdfMetadata } from '../services/document/PdfService';

const router = Router();

const PERMISSION_VIEW = 'template:view';
const PERMISSION_EDIT = 'template:edit';
const PERMISSION_CREATE = 'template:create';
const PERMISSION_DELETE = 'template:delete';
const ACCESS_DENIED_MSG = 'Access denied to this template';

// Configure multer for file uploads (Disk storage for security)
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.originalname.endsWith('.docx') ||
      file.mimetype === 'application/pdf' ||
      file.originalname.endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx and .pdf files are supported'));
    }
  },
});

// Helper to cleanup temp files
const cleanupFile = async (filePath?: string): Promise<void> => {
  if (filePath !== undefined) {
    try {
      await fs.unlink(filePath);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        logger.warn({ error: e, filePath }, 'Failed to cleanup temp upload file');
      }
    }
  }
};

function isErrorWithCode(err: unknown): err is Error & { code: string } {
  return err instanceof Error && 'code' in err;
}

function rethrowProcessingTimeout(error: unknown): void {
  if (!isProcessingTimeoutError(error)) {
    return;
  }

  logger.error(
    {
      error,
      label: error.label,
      elapsedMs: error.elapsedMs,
      timeoutMs: error.timeoutMs,
    },
    'Document processing timed out'
  );
  throw createError.validation(
    `Document processing timeout: ${error.label} exceeded ${error.timeoutMs}ms`
  );
}

async function collectDocxPlaceholderWarnings(fileBuffer: Buffer): Promise<string[]> {
  const { extractPlaceholdersDetailed } = await import('../services/templatePlaceholders');
  const tempPath = path.join(os.tmpdir(), `validate-${crypto.randomBytes(4).toString('hex')}.docx`);

  await fs.writeFile(tempPath, fileBuffer);
  try {
    const placeholders = await extractPlaceholdersDetailed(tempPath);
    return placeholders
      .filter((placeholder) => placeholder.kind === 'unknown_helper')
      .map((placeholder) => `Warning: Template references an unknown helper function "${placeholder.helper ?? placeholder.name}".`);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

/**
 * GET /templates/:id/download
 * Download template file
 */
router.get(
  '/templates/:id/download',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      logger.debug({ templateId: req.params.id }, 'Downloading template');
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        logger.error({ templateId: params.id }, 'Template not found');
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        logger.error({ tenantId, templateId: template.id }, ACCESS_DENIED_MSG);
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const { getTemplateFilePath } = await import('../services/templates');
      const filePath = getTemplateFilePath(template.fileRef);
      const fsSync = await import('fs');
      if (!fsSync.existsSync(filePath)) {
        logger.error({ filePath }, 'Template file missing at path');
        throw createError.notFound('Template file', template.fileRef);
      }
      logger.debug({ filePath }, 'Serving template file');
      res.setHeader('Content-Disposition', `attachment; filename="${template.name}.${template.type === 'pdf' ? 'pdf' : 'docx'}"`);
      if (template.type === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }
      const stream = fsSync.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      logger.error({ error }, 'Template download error');
      if (res.headersSent) {
        return;
      }
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /projects/:projectId/templates
 * List templates for a project
 */
router.get(
  '/projects/:projectId/templates',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = projectIdParamsSchema.parse(req.params);
      const query = listTemplatesQuerySchema.parse(req.query);
      const { cursor, limit } = query;
      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.projectId),
          eq(schema.projects.tenantId, tenantId)
        ),
      });
      if (!project) {
        throw createError.notFound('Project', params.projectId);
      }
      const whereConditions = [eq(schema.templates.projectId, params.projectId)];
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor);
        if (decoded !== null) {
          whereConditions.push(lt(schema.templates.createdAt, new Date(decoded.timestamp)));
        }
      }
      const templates = await db.query.templates.findMany({
        where: and(...whereConditions),
        orderBy: [desc(schema.templates.createdAt)],
        limit: limit + 1,
      });
      const response = createPaginatedResponse(templates, limit);
      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * POST /projects/:projectId/templates
 * Create a new template with file upload
 */
router.post(
  '/projects/:projectId/templates',
  uploadLimiter,
  upload.single('file'),
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_CREATE),
  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- inherently complex file upload with security checks
  asyncHandler(async (req: Request, res: Response) => {
    let fileRef: string | undefined;
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = projectIdParamsSchema.parse(req.params);
      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.projectId),
          eq(schema.projects.tenantId, tenantId)
        ),
      });
      if (!project) {
        await cleanupFile(req.file?.path);
        throw createError.notFound('Project', params.projectId);
      }
      if (!req.file) {
        throw createError.validation('File upload required');
      }
      let data;
      try {
        data = createTemplateSchema.parse(req.body);
      } catch (validationError) {
        await cleanupFile(req.file.path);
        logger.error({ error: validationError, body: req.body as unknown }, "Template validation failed");
        throw createError.validation("Invalid template data");
      }
      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');
      let fileBuffer = await fs.readFile(req.file.path);
      const { validateMagicBytes } = await import('../utils/magicBytes');
      const isValidMagic = validateMagicBytes(fileBuffer, req.file.originalname);
      if (!isValidMagic) {
        await cleanupFile(req.file.path);
        throw createError.validation('File type mismatch (Magic Bytes validation failed)');
      }
      if (!isPdf) {
        const { validateZipLimits } = await import('../utils/zipLimits');
        const zipValidation = validateZipLimits(fileBuffer, req.file.originalname);
        if (!zipValidation.ok) {
          await cleanupFile(req.file.path);
          throw createError.validation(`Invalid DOCX archive: ${zipValidation.reason ?? 'ZIP safety validation failed'}`);
        }
      }
      const scanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
      if (!scanResult.safe) {
        await cleanupFile(req.file.path);
        logger.error(
          { filename: req.file.originalname, threat: scanResult.threatName },
          'Malware detected in uploaded template'
        );
        throw createError.validation(`File rejected: potential malware detected (${String(scanResult.threatName)})`);
      }
      await storageQuotaService.checkQuota(tenantId, fileBuffer.length);
      logger.debug(
        { filename: req.file.originalname, scanner: scanResult.scannerName, durationMs: scanResult.scanDurationMs },
        'Virus scan passed'
      );
      let warnings: string[] = [];
      let pdfMetadata: PdfMetadata = { pageCount: 0, fields: [], isEncrypted: false };
      if (!isPdf) {
        try {
          const docxScanResult = await documentProcessingLimiter.run(() =>
            withTimeout(
              () => templateScanner.scanAndFix(fileBuffer),
              DOCUMENT_PROCESSING_TIMEOUT_MS,
              'template-create-docx-scan'
            )
          );
          if (!docxScanResult.isValid) {
            throw createError.validation(
              `Invalid template: ${docxScanResult.errors?.join(', ') ?? 'unknown error'}`
            );
          }
            if (docxScanResult.fixed) {
              fileBuffer = docxScanResult.buffer;
              warnings = docxScanResult.repairs;
            }
            
            // DOC-109: Validate helpers during upload
            try {
              warnings.push(...await collectDocxPlaceholderWarnings(fileBuffer));
            } catch (e) {
              logger.warn({ error: e }, "Failed to extract placeholders during template upload");
            }
            
          } catch (error: unknown) {
          await cleanupFile(req.file.path);
          rethrowProcessingTimeout(error);
          if (isErrorWithCode(error) && error.code === 'VALIDATION_ERROR') { throw error; }
          throw createError.validation(`Template validation failed: ${isErrorWithCode(error) ? error.message : String(error)}`);
        }
      } else {
        try {
          fileBuffer = await documentProcessingLimiter.run(() =>
            withTimeout(async () => {
              const unlocked = await pdfService.unlockPdf(fileBuffer);
              pdfMetadata = await pdfService.extractFields(unlocked);
              return unlocked;
            }, DOCUMENT_PROCESSING_TIMEOUT_MS, 'template-create-pdf-processing')
          );
        } catch (error: unknown) {
          await cleanupFile(req.file.path);
          rethrowProcessingTimeout(error);
          logger.error({ error }, 'PDF processing failed');
          throw createError.validation(`PDF processing failed: ${isErrorWithCode(error) ? error.message : String(error)}`);
        }
      }
      fileRef = await saveTemplateFile(fileBuffer, req.file.originalname, req.file.mimetype);
      await cleanupFile(req.file.path);
      const [template] = await db
        .insert(schema.templates)
        .values({
          projectId: params.projectId,
          name: data.name,
          fileRef,
          type: isPdf ? 'pdf' : 'docx',
          helpersVersion: 1,
          metadata: {
            ...(isPdf ? pdfMetadata : {}),
            size: fileBuffer.length
          },
        })
        .returning();
      res.status(201).json({
        ...template,
        warnings: warnings.length > 0 ? warnings : undefined
      });
    } catch (error) {
      if (fileRef !== undefined) {
        await deleteTemplateFile(fileRef).catch((e: unknown) =>
          logger.warn({ error: e, fileRef }, "Failed to cleanup orphan file during rollback")
        );
      }
      logger.error({ error, body: req.body as unknown, params: req.params as unknown, file: req.file }, "Error creating template");
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id
 * Get template by ID
 */
router.get(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      res.json(template);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * PATCH /templates/:id
 * Update template (rename or replace file)
 */
router.patch(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_EDIT),
  uploadLimiter,
  upload.single('file'),
  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- inherently complex file replacement with security checks
  asyncHandler(async (req: Request, res: Response) => {
    let newFileRef: string | undefined;
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const data = updateTemplateSchema.parse(req.body);
      let warnings: string[] = [];
      let oldFileRef: string | undefined;
      let updateType: string | undefined;
      let updateMetadata: Record<string, unknown> | undefined;
      if (req.file) {
        let fileBuffer = await fs.readFile(req.file.path);
        const { validateMagicBytes } = await import('../utils/magicBytes');
        if (!validateMagicBytes(fileBuffer, req.file.originalname)) {
          await cleanupFile(req.file.path);
          throw createError.validation('File type mismatch (Magic Bytes validation failed)');
        }
        const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');
        if (!isPdf) {
          const { validateZipLimits } = await import('../utils/zipLimits');
          const zipValidation = validateZipLimits(fileBuffer, req.file.originalname);
          if (!zipValidation.ok) {
            await cleanupFile(req.file.path);
            throw createError.validation(`Invalid DOCX archive: ${zipValidation.reason ?? 'ZIP safety validation failed'}`);
          }
        }
        const virusScanResult = await virusScanner().scan(fileBuffer, req.file.originalname);
        if (!virusScanResult.safe) {
          await cleanupFile(req.file.path);
          logger.error(
            { filename: req.file.originalname, threat: virusScanResult.threatName },
            'Malware detected in uploaded template (PATCH)'
          );
          throw createError.validation(`File rejected: potential malware detected (${String(virusScanResult.threatName)})`);
        }
        await storageQuotaService.checkQuota(tenantId, fileBuffer.length);
        logger.debug(
          { filename: req.file.originalname, scanner: virusScanResult.scannerName },
          'Virus scan passed (PATCH)'
        );
        let pdfMetadata: PdfMetadata = { pageCount: 0, fields: [], isEncrypted: false };
        if (!isPdf) {
          try {
            const docxScanResult = await documentProcessingLimiter.run(() =>
              withTimeout(
                () => templateScanner.scanAndFix(fileBuffer),
                DOCUMENT_PROCESSING_TIMEOUT_MS,
                'template-update-docx-scan'
              )
            );
            // eslint-disable-next-line max-depth -- nested validation inside try/if
            if (!docxScanResult.isValid) {
              logger.error({ errors: docxScanResult.errors }, 'Template validation failed in API (PATCH)');
              throw createError.validation(
                `Invalid template: ${docxScanResult.errors?.join(', ') ?? 'unknown error'}`
              );
            }
            // eslint-disable-next-line max-depth -- nested validation inside try/if
            if (docxScanResult.fixed) {
              fileBuffer = docxScanResult.buffer;
              warnings = docxScanResult.repairs;
            }
          } catch (error: unknown) {
            await cleanupFile(req.file.path);
            rethrowProcessingTimeout(error);
            // eslint-disable-next-line max-depth -- nested re-throw inside try/if
            if (isErrorWithCode(error) && error.code === 'VALIDATION_ERROR') { throw error; }
            throw createError.validation(`Template validation failed: ${isErrorWithCode(error) ? error.message : String(error)}`);
          }
        } else {
          try {
            fileBuffer = await documentProcessingLimiter.run(() =>
              withTimeout(async () => {
                const unlocked = await pdfService.unlockPdf(fileBuffer);
                pdfMetadata = await pdfService.extractFields(unlocked);
                return unlocked;
              }, DOCUMENT_PROCESSING_TIMEOUT_MS, 'template-update-pdf-processing')
            );
          } catch (error: unknown) {
            await cleanupFile(req.file.path);
            rethrowProcessingTimeout(error);
            logger.error({ error }, 'PDF processing failed (PATCH)');
            throw createError.validation(`PDF processing failed: ${isErrorWithCode(error) ? error.message : String(error)}`);
          }
        }
        newFileRef = await saveTemplateFile(fileBuffer, req.file.originalname, req.file.mimetype);
        await cleanupFile(req.file.path);
        updateType = isPdf ? 'pdf' : 'docx';
        updateMetadata = {
          ...(isPdf ? pdfMetadata : {}),
          size: fileBuffer.length
        };
        oldFileRef = template.fileRef;
      }
      const [updated] = await db
        .update(schema.templates)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(newFileRef !== undefined && { fileRef: newFileRef }),
          ...(updateType !== undefined && { type: updateType as "docx" | "pdf" }),
          ...(updateMetadata !== undefined && { metadata: updateMetadata }),
          updatedAt: new Date(),
        })
        .where(eq(schema.templates.id, params.id))
        .returning();
      if (oldFileRef !== undefined && newFileRef !== undefined) {
        // CRITICAL: delete old file AFTER DB update for atomicity
        try {
          await deleteTemplateFile(oldFileRef);
          logger.debug({ oldFileRef, newFileRef }, 'Old template file cleaned up after successful update');
        } catch (cleanupError) {
          logger.warn({ oldFileRef, error: cleanupError }, 'Failed to delete old template file (orphaned)');
        }
      }
      res.json({
        ...updated,
        warnings: warnings.length > 0 ? warnings : undefined
      });
    } catch (error) {
      if (newFileRef !== undefined) {
        await deleteTemplateFile(newFileRef).catch((e: unknown) =>
          logger.warn({ error: e, newFileRef }, "Failed to cleanup orphan new file during rollback")
        );
      }
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * DELETE /templates/:id
 * Delete template and associated file
 */
router.delete(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_DELETE),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      await deleteTemplateFile(template.fileRef);
      await db.delete(schema.templates).where(eq(schema.templates.id, params.id));
      res.status(204).send();
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/placeholders
 * Extract placeholders from template
 */
router.get(
  '/templates/:id/placeholders',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const placeholders = await extractPlaceholders(template.fileRef);
      const response: ExtractPlaceholdersResponse = {
        templateId: template.id,
        placeholders,
      };
      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/validate?workflowId=...
 * Compare the template's placeholders against a workflow's variables.
 * Returns matched/missing (with fuzzy suggestions), loop-scoped fields,
 * unused variables, and steps whose answers are dropped for lack of alias.
 */
router.get(
  '/templates/:id/validate',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId;
      if (userId === undefined || userId === null || userId === '') {
        throw createError.unauthorized('Unauthorized - no user ID');
      }
      const params = templateParamsSchema.parse(req.params);
      const query = z.object({ workflowId: z.string().uuid() }).parse(req.query);

      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }

      const { templateValidationService } = await import('../services/TemplateValidationService');
      const report = await templateValidationService.validate(
        template.id,
        template.fileRef,
        query.workflowId,
        userId
      );
      res.json(report);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * POST /templates/:id/preview
 * Generate a preview of the template with sample data
 */
router.post(
  '/templates/:id/preview',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const previewSchema = z.object({
        mapping: z.record(z.any()).optional(),
        sampleData: z.record(z.any()),
        outputFormat: z.enum(['pdf', 'docx']).optional().default('pdf'),
        validateMapping: z.boolean().optional().default(true),
      });
      const parsedBody = previewSchema.parse(req.body);
      const { mapping, sampleData, outputFormat, validateMapping } = parsedBody;

      const { templatePreviewService } = await import('../services/TemplatePreviewService');
      const previewResult = await templatePreviewService.generatePreview({
        templateId: params.id,
        mapping: mapping as Parameters<typeof templatePreviewService.generatePreview>[0]['mapping'],
        sampleData: sampleData as Record<string, unknown>,
        outputFormat: outputFormat as 'pdf' | 'docx' | undefined,
        validateMapping,
        expiresIn: 300,
      });
      res.json({
        previewUrl: previewResult.previewUrl,
        format: previewResult.format,
        size: previewResult.size,
        expiresAt: previewResult.expiresAt,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- validationReport typed as any in PreviewResult
        validationReport: previewResult.validationReport,
        mappingMetadata: previewResult.mappingMetadata,
      });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * POST /templates/:id/test-mapping
 * Test field mapping with sample data (validation only, no generation)
 */
router.post(
  '/templates/:id/test-mapping',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const body = req.body as Record<string, unknown>;
      const mapping = body.mapping;
      const testData = body.testData;
      if (mapping === undefined || mapping === null || typeof mapping !== 'object') {
        throw createError.validation('mapping is required and must be an object');
      }
      if (testData === undefined || testData === null || typeof testData !== 'object') {
        throw createError.validation('testData is required and must be an object');
      }
      const { mappingValidator } = await import('../services/document/MappingValidator');
      const report = await mappingValidator.validateWithTestData(
        params.id,
        mapping as Parameters<typeof mappingValidator.validateWithTestData>[1],
        testData as Record<string, unknown>,
      );
      res.json(report);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/versions
 * Get version history for a template
 */
router.get(
  '/templates/:id/versions',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const history = await templateVersionService.getVersionHistory(params.id);
      res.json({ versions: history });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/versions/:versionNumber
 * Get a specific version
 */
router.get(
  '/templates/:id/versions/:versionNumber',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const versionNumber = parseInt(req.params.versionNumber, 10);
      if (isNaN(versionNumber)) {
        throw createError.validation('Invalid version number');
      }
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const version = await templateVersionService.getVersion(params.id, versionNumber);
      res.json(version);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * POST /templates/:id/versions
 * Create a new version snapshot
 */
router.post(
  '/templates/:id/versions',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_EDIT),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const body = req.body as Record<string, unknown>;
      const notes = body.notes as string | undefined;
      const force = body.force as boolean | undefined;
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const version = await templateVersionService.createVersion({
        templateId: params.id,
        userId,
        notes,
        force,
      });
      res.status(201).json(version);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * POST /templates/:id/versions/:versionNumber/restore
 * Restore a template to a previous version
 */
router.post(
  '/templates/:id/versions/:versionNumber/restore',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_EDIT),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;
      const params = templateParamsSchema.parse(req.params);
      const versionNumber = parseInt(req.params.versionNumber, 10);
      if (isNaN(versionNumber)) {
        throw createError.validation('Invalid version number');
      }
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const body = req.body as Record<string, unknown>;
      const notes = body.notes as string | undefined;
      const { templateVersionService } = await import('../services/TemplateVersionService');
      await templateVersionService.restoreVersion(params.id, versionNumber, userId, notes);
      res.json({ success: true, message: `Restored to version ${String(versionNumber)}` });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/versions/compare
 * Compare two versions
 */
router.get(
  '/templates/:id/versions/compare',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const from = parseInt(req.query.from as string, 10);
      const to = parseInt(req.query.to as string, 10);
      if (isNaN(from) || isNaN(to)) {
        throw createError.validation('Invalid version numbers');
      }
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const comparison = await templateVersionService.compareVersions(params.id, from, to);
      res.json(comparison);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

/**
 * GET /templates/:id/analytics
 * Get analytics for a template
 */
router.get(
  '/templates/:id/analytics',
  hybridAuth,
  requireTenant,
  requirePermission(PERMISSION_VIEW),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const params = templateParamsSchema.parse(req.params);
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: { project: true },
      });
      if (!template) {
        throw createError.notFound('Template', params.id);
      }
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden(ACCESS_DENIED_MSG);
      }
      const { templateAnalytics } = await import('../services/TemplateAnalyticsService');
      const insights = await templateAnalytics.getTemplateInsights(params.id);
      res.json(insights);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  })
);

export default router;
