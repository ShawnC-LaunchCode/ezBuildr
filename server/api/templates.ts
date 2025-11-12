import { Router, type Request, Response } from 'express';
import { eq, and, desc, lt } from 'drizzle-orm';
import multer from 'multer';
import { db } from '../db';
import * as schema from '@shared/schema';
import { requireAuth } from '../middleware/auth';
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

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (_req, file, cb) => {
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

/**
 * GET /projects/:projectId/templates
 * List templates for a project
 */
router.get(
  '/projects/:projectId/templates',
  requireAuth,
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
  requireAuth,
  requireTenant,
  requirePermission('template:create'),
  upload.single('file'),
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
      const data = createTemplateSchema.parse(req.body);

      // Save file
      const fileRef = await saveTemplateFile(
        req.file.buffer,
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

      res.status(201).json(template);
    } catch (error) {
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
  requireAuth,
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
  requireAuth,
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
      if (req.file) {
        // Save new file
        newFileRef = await saveTemplateFile(
          req.file.buffer,
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

      res.json(updated);
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
  requireAuth,
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
  requireAuth,
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
