import { Router, type Request, Response } from 'express';
import { eq, and, desc, lt } from 'drizzle-orm';
import { type FileFilterCallback } from 'multer';
import { db } from '../db';
import * as schema from '@shared/schema';
import { hybridAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';
import {
  saveTemplateFile,
  deleteTemplateFile,
  extractPlaceholders,
} from '../services/templates';
import type { AuthRequest } from '../middleware/auth';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  templateParamsSchema,
  projectIdParamsSchema,
  type ExtractPlaceholdersResponse,
} from './validators/templates';
import { templateScanner } from '../services/document/TemplateScanner';
import { logger } from '../logger';

const router = Router();

// @ts-ignore
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const multer = require('multer');
const multerInstance = multer;

// Configure multer for file uploads (memory storage is default in v2)
// Configure multer for file uploads (memory storage is default in v2)
const debugStorage = {
  _handleFile: function _handleFile(req: any, file: any, cb: any) {
    logger.info({ filename: file.originalname, mimetype: file.mimetype }, "Multer _handleFile called");
    if (multerInstance.memoryStorage) {
      const storage = multerInstance.memoryStorage();
      storage._handleFile(req, file, cb);
    } else {
      // Fallback if memoryStorage is not available on the instance
      cb(new Error("Memory storage not available"));
    }
  },
  _removeFile: function _removeFile(req: any, file: any, cb: any) {
    if (multerInstance.memoryStorage) {
      const storage = multerInstance.memoryStorage();
      storage._removeFile(req, file, cb);
    } else {
      cb(null);
    }
  }
};

const upload = multerInstance({
  storage: multerInstance.memoryStorage ? multerInstance.memoryStorage() : undefined,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    // Only accept .docx files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.originalname.endsWith('.docx')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx files are supported'));
    }
  },
});

logger.info({
  multerImportKeys: Object.keys(multer),
  multerInstanceKeys: Object.keys(multerInstance),
  multerInstanceType: typeof multerInstance,
  uploadKeys: Object.keys(upload),
  uploadType: typeof upload,
  uploadPrototype: Object.getPrototypeOf(upload)
}, "Debug Multer Import");

/**
 * GET /projects/:projectId/templates
 * List templates for a project
 */
router.get(
  '/projects/:projectId/templates',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and query
      const params = projectIdParamsSchema.parse(req.params);
      const query = listTemplatesQuerySchema.parse(req.query);
      const { cursor, limit } = query;

      // Verify project belongs to tenant
      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.projectId),
          eq(schema.projects.tenantId, tenantId)
        ),
      });

      if (!project) {
        throw createError.notFound('Project', params.projectId);
      }

      // Build where clause
      const whereConditions = [eq(schema.templates.projectId, params.projectId)];

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          whereConditions.push(lt(schema.templates.createdAt, new Date(decoded.timestamp)));
        }
      }

      // Fetch templates
      const templates = await db.query.templates.findMany({
        where: and(...whereConditions),
        orderBy: [desc(schema.templates.createdAt)],
        limit: limit + 1,
      });

      // Create paginated response
      const response = createPaginatedResponse(templates, limit);

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /projects/:projectId/templates
 * Create a new template with file upload
 */
router.post(
  '/projects/:projectId/templates',
  upload.single('file'),
  hybridAuth,
  requireTenant,
  requirePermission('template:create'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      logger.info({
        headers: req.headers,
        multerInstanceType: typeof multerInstance,
        multerKeys: Object.keys(multerInstance),
        hasMemoryStorage: !!multerInstance.memoryStorage,
        file: req.file,
        body: req.body
      }, "Debug Template Upload");

      // Validate params
      const params = projectIdParamsSchema.parse(req.params);

      // Verify project belongs to tenant
      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.projectId),
          eq(schema.projects.tenantId, tenantId)
        ),
      });

      if (!project) {
        throw createError.notFound('Project', params.projectId);
      }

      // Validate file upload
      if (!req.file) {
        throw createError.validation('File upload required');
      }

      // Validate body
      const data = createTemplateSchema.parse(req.body);

      // SCAN & FIX TEMPLATE
      let fileBuffer = req.file.buffer;
      let warnings: string[] = [];

      try {
        const scanResult = await templateScanner.scanAndFix(fileBuffer);

        if (!scanResult.isValid) {
          throw createError.validation(
            `Invalid template: ${scanResult.errors?.join(', ')}`
          );
        }

        if (scanResult.fixed) {
          fileBuffer = scanResult.buffer;
          warnings = scanResult.repairs;
        }
      } catch (error: any) {
        // If it's already a validation error, rethrow
        if (error.code === 'VALIDATION_ERROR') throw error;
        // Otherwise wrap it
        throw createError.validation(`Template validation failed: ${error.message}`);
      }

      // Save file
      const fileRef = await saveTemplateFile(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Create template record
      const [template] = await db
        .insert(schema.templates)
        .values({
          projectId: params.projectId,
          name: data.name,
          fileRef,
          type: 'docx',
          helpersVersion: 1,
        })
        .returning();

      res.status(201).json({
        ...template,
        warnings: warnings.length > 0 ? warnings : undefined
      });
    } catch (error) {
      logger.error({ error, body: req.body, params: req.params, file: req.file }, "Error creating template");
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id
 * Get template by ID
 */
router.get(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);

      // Fetch template with project
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: {
          project: true,
        },
      });

      if (!template) {
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this template');
      }

      res.json(template);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * PATCH /templates/:id
 * Update template (rename or replace file)
 */
router.patch(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission('template:edit'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);

      // Fetch template with project
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: {
          project: true,
        },
      });

      if (!template) {
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this template');
      }

      // Validate body
      const data = updateTemplateSchema.parse(req.body);

      // Handle file replacement if provided
      let newFileRef: string | undefined;
      let warnings: string[] = [];

      if (req.file) {
        // SCAN & FIX TEMPLATE
        let fileBuffer = req.file.buffer;

        try {
          const scanResult = await templateScanner.scanAndFix(fileBuffer);

          if (!scanResult.isValid) {
            logger.error({ errors: scanResult.errors }, 'Template validation failed in API (PATCH)');
            throw createError.validation(
              `Invalid template: ${scanResult.errors?.join(', ')}`
            );
          }

          if (scanResult.fixed) {
            fileBuffer = scanResult.buffer;
            warnings = scanResult.repairs;
          }
        } catch (error: any) {
          if (error.code === 'VALIDATION_ERROR') throw error;
          throw createError.validation(`Template validation failed: ${error.message}`);
        }

        // Save new file
        newFileRef = await saveTemplateFile(
          fileBuffer,
          req.file.originalname,
          req.file.mimetype
        );

        // Delete old file
        await deleteTemplateFile(template.fileRef);
      }

      // Update template
      const [updated] = await db
        .update(schema.templates)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(newFileRef && { fileRef: newFileRef }),
          updatedAt: new Date(),
        })
        .where(eq(schema.templates.id, params.id))
        .returning();

      res.json({
        ...updated,
        warnings: warnings.length > 0 ? warnings : undefined
      });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * DELETE /templates/:id
 * Delete template and associated file
 */
router.delete(
  '/templates/:id',
  hybridAuth,
  requireTenant,
  requirePermission('template:delete'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);

      // Fetch template with project
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: {
          project: true,
        },
      });

      if (!template) {
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this template');
      }

      // Delete file
      await deleteTemplateFile(template.fileRef);

      // Delete template record
      await db.delete(schema.templates).where(eq(schema.templates.id, params.id));

      res.status(204).send();
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id/placeholders
 * Extract placeholders from template
 */
router.get(
  '/templates/:id/placeholders',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);

      // Fetch template with project
      const template = await db.query.templates.findFirst({
        where: eq(schema.templates.id, params.id),
        with: {
          project: true,
        },
      });

      if (!template) {
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this template');
      }

      // Extract placeholders
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
  }
);

export default router;
