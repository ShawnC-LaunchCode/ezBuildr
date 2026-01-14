import { eq, and, desc, lt } from 'drizzle-orm';
import { Router, type Request, Response } from 'express';
import { type FileFilterCallback } from 'multer';
import multer from 'multer';

import * as schema from '@shared/schema';

import { db } from '../db';
import { logger } from '../logger';
import { hybridAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { requireTenant } from '../middleware/tenant';
import { templateScanner } from '../services/document/TemplateScanner';
import {
  saveTemplateFile,
  deleteTemplateFile,
  extractPlaceholders,
} from '../services/templates';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';

import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  templateParamsSchema,
  projectIdParamsSchema,
  type ExtractPlaceholdersResponse,
} from './validators/templates';

import type { AuthRequest } from '../middleware/auth';


const router = Router();


// Configure multer for file uploads (memory storage is default in v2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    // Only accept .docx and .pdf files
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

import { pdfService } from '../services/document/PdfService';



/**
 * GET /templates/:id/download
 * Download template file
 */
router.get(
  '/templates/:id/download',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      logger.debug({ templateId: req.params.id }, 'Downloading template');
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
        logger.error({ templateId: params.id }, 'Template not found');
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        logger.error({ tenantId, templateId: template.id }, 'Access denied to template');
        throw createError.forbidden('Access denied to this template');
      }

      // Get file path
      const { getTemplateFilePath } = await import('../services/templates');
      const filePath = getTemplateFilePath(template.fileRef);

      // Import fs locally to avoid toplevel conflict if not imported
      const fs = await import('fs');

      if (!fs.existsSync(filePath)) {
        logger.error({ filePath }, 'Template file missing at path');
        throw createError.notFound('Template file', template.fileRef);
      }

      logger.debug({ filePath }, 'Serving template file');

      // Set headers
      res.setHeader('Content-Disposition', `attachment; filename="${template.name}.${template.type === 'pdf' ? 'pdf' : 'docx'}"`);

      if (template.type === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      // Stream file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

    } catch (error) {
      logger.error({ error }, 'Template download error');
      // If headers sent, we can't send error json
      if (res.headersSent) {
        return;
      }
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);


/**
 * GET /templates/:id/download
 * Download template file
 */
router.get(
  '/templates/:id/download',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      logger.debug({ templateId: req.params.id }, 'Downloading template');
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
        logger.error({ templateId: params.id }, 'Template not found');
        throw createError.notFound('Template', params.id);
      }

      // Verify tenant access
      if (template.project.tenantId !== tenantId) {
        logger.error({ tenantId, templateId: template.id }, 'Access denied to template');
        throw createError.forbidden('Access denied to this template');
      }

      // Get file path
      const { getTemplateFilePath } = await import('../services/templates');
      const filePath = getTemplateFilePath(template.fileRef);

      // Import fs locally to avoid toplevel conflict if not imported
      const fs = await import('fs');

      if (!fs.existsSync(filePath)) {
        logger.error({ filePath }, 'Template file missing at path');
        throw createError.notFound('Template file', template.fileRef);
      }

      logger.debug({ filePath }, 'Serving template file');

      // Set headers
      res.setHeader('Content-Disposition', `attachment; filename="${template.name}.${template.type === 'pdf' ? 'pdf' : 'docx'}"`);

      if (template.type === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      // Stream file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

    } catch (error) {
      logger.error({ error }, 'Template download error');
      // If headers sent, we can't send error json
      if (res.headersSent) {
        return;
      }
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

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
      let data;
      try {
        data = createTemplateSchema.parse(req.body);
      } catch (validationError) {
        logger.error({ error: validationError, body: req.body }, "Template validation failed");
        throw createError.validation("Invalid template data");
      }

      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');

      // SCAN & FIX TEMPLATE (DOCX Only)
      let fileBuffer = req.file.buffer;
      let warnings: string[] = [];
      let pdfMetadata: any = {};

      if (!isPdf) {
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
          if (error.code === 'VALIDATION_ERROR') {throw error;}
          // Otherwise wrap it
          throw createError.validation(`Template validation failed: ${error.message}`);
        }
      } else {
        // Handle PDF
        try {
          // 1. Unlock PDF (remove restrictions)
          fileBuffer = await pdfService.unlockPdf(fileBuffer);

          // 2. Extract fields
          pdfMetadata = await pdfService.extractFields(fileBuffer);
        } catch (error: any) {
          logger.error({ error }, 'PDF processing failed');
          throw createError.validation(`PDF processing failed: ${error.message}`);
        }
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
          type: isPdf ? 'pdf' : 'docx',
          helpersVersion: 1,
          metadata: isPdf ? pdfMetadata : {},
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
        let fileBuffer = req.file.buffer;

        // Handle PDF or scan DOCX
        const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf');
        let pdfMetadata: any = {};

        if (!isPdf) {
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
            if (error.code === 'VALIDATION_ERROR') {throw error;}
            throw createError.validation(`Template validation failed: ${error.message}`);
          }
        } else {
          // Handle PDF
          try {
            fileBuffer = await pdfService.unlockPdf(fileBuffer);
            pdfMetadata = await pdfService.extractFields(fileBuffer);
          } catch (error: any) {
            logger.error({ error }, 'PDF processing failed (PATCH)');
            throw createError.validation(`PDF processing failed: ${error.message}`);
          }
        }

        // Save new file
        newFileRef = await saveTemplateFile(
          fileBuffer,
          req.file.originalname,
          req.file.mimetype
        );

        // Update data object with new type/metadata if file changed
        // We will pass this to the update call below
        (data as any).type = isPdf ? 'pdf' : 'docx';
        (data as any).metadata = isPdf ? pdfMetadata : {};

        // Delete old file
        await deleteTemplateFile(template.fileRef);
      }

      // Update template
      const [updated] = await db
        .update(schema.templates)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(newFileRef && { fileRef: newFileRef }),
          ...((data as any).type && { type: (data as any).type }),
          ...((data as any).metadata && { metadata: (data as any).metadata }),
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

/**
 * GET /templates/:id/download
 * Download template file
 */
router.get(
  '/templates/:id/download',
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

      // Get file path
      const { getTemplateFilePath } = await import('../services/templates');
      const filePath = getTemplateFilePath(template.fileRef);

      // Import fs locally to avoid toplevel conflict if not imported
      const fs = await import('fs');

      if (!fs.existsSync(filePath)) {
        throw createError.notFound('Template file', template.fileRef);
      }

      // Set headers
      res.setHeader('Content-Disposition', `attachment; filename="${template.name}.${template.type === 'pdf' ? 'pdf' : 'docx'}"`);

      if (template.type === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
      } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      // Stream file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

    } catch (error) {
      // If headers sent, we can't send error json
      if (res.headersSent) {
        return;
      }
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /templates/:id/preview
 * Generate a preview of the template with sample data
 */
router.post(
  '/templates/:id/preview',
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

      // Get preview options from request body
      const { mapping, sampleData, outputFormat = 'pdf', validateMapping = true } = req.body;

      if (!sampleData || typeof sampleData !== 'object') {
        throw createError.validation('sampleData is required and must be an object');
      }

      // Generate preview
      const { templatePreviewService } = await import('../services/TemplatePreviewService');
      const previewResult = await templatePreviewService.generatePreview({
        templateId: params.id,
        mapping,
        sampleData,
        outputFormat,
        validateMapping,
        expiresIn: 300, // 5 minutes
      });

      res.json({
        previewUrl: previewResult.previewUrl,
        format: previewResult.format,
        size: previewResult.size,
        expiresAt: previewResult.expiresAt,
        validationReport: previewResult.validationReport,
        mappingMetadata: previewResult.mappingMetadata,
      });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /templates/:id/test-mapping
 * Test field mapping with sample data (validation only, no generation)
 */
router.post(
  '/templates/:id/test-mapping',
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

      // Get mapping and test data from request body
      const { mapping, testData } = req.body;

      if (!mapping || typeof mapping !== 'object') {
        throw createError.validation('mapping is required and must be an object');
      }

      if (!testData || typeof testData !== 'object') {
        throw createError.validation('testData is required and must be an object');
      }

      // Validate mapping
      const { mappingValidator } = await import('../services/document/MappingValidator');
      const report = await mappingValidator.validateWithTestData(
        params.id,
        mapping,
        testData
      );

      res.json(report);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id/versions
 * Get version history for a template
 */
router.get(
  '/templates/:id/versions',
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

      // Get version history
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const history = await templateVersionService.getVersionHistory(params.id);

      res.json({ versions: history });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id/versions/:versionNumber
 * Get a specific version
 */
router.get(
  '/templates/:id/versions/:versionNumber',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);
      const versionNumber = parseInt(req.params.versionNumber, 10);

      if (isNaN(versionNumber)) {
        throw createError.validation('Invalid version number');
      }

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

      // Get specific version
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const version = await templateVersionService.getVersion(params.id, versionNumber);

      res.json(version);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /templates/:id/versions
 * Create a new version snapshot
 */
router.post(
  '/templates/:id/versions',
  hybridAuth,
  requireTenant,
  requirePermission('template:edit'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

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

      // Get notes from request body
      const { notes, force } = req.body;

      // Create version
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
  }
);

/**
 * POST /templates/:id/versions/:versionNumber/restore
 * Restore a template to a previous version
 */
router.post(
  '/templates/:id/versions/:versionNumber/restore',
  hybridAuth,
  requireTenant,
  requirePermission('template:edit'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);
      const versionNumber = parseInt(req.params.versionNumber, 10);

      if (isNaN(versionNumber)) {
        throw createError.validation('Invalid version number');
      }

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

      // Get notes from request body
      const { notes } = req.body;

      // Restore version
      const { templateVersionService } = await import('../services/TemplateVersionService');
      await templateVersionService.restoreVersion(params.id, versionNumber, userId, notes);

      res.json({ success: true, message: `Restored to version ${versionNumber}` });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id/versions/compare
 * Compare two versions
 */
router.get(
  '/templates/:id/versions/compare',
  hybridAuth,
  requireTenant,
  requirePermission('template:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = templateParamsSchema.parse(req.params);
      const from = parseInt(req.query.from as string, 10);
      const to = parseInt(req.query.to as string, 10);

      if (isNaN(from) || isNaN(to)) {
        throw createError.validation('Invalid version numbers');
      }

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

      // Compare versions
      const { templateVersionService } = await import('../services/TemplateVersionService');
      const comparison = await templateVersionService.compareVersions(params.id, from, to);

      res.json(comparison);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /templates/:id/analytics
 * Get analytics for a template
 */
router.get(
  '/templates/:id/analytics',
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

      // Get analytics
      const { templateAnalytics } = await import('../services/TemplateAnalyticsService');
      const insights = await templateAnalytics.getTemplateInsights(params.id);

      res.json(insights);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

export default router;
