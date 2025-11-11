import { Router, type Request, Response } from 'express';
import { eq, and, desc, lt } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';
import type { AuthRequest } from '../middleware/auth';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  projectParamsSchema,
} from './validators/projects';

const router = Router();

/**
 * GET /projects
 * List all projects for the authenticated user's tenant
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  requirePermission('project:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate query params
      const query = listProjectsQuerySchema.parse(req.query);
      const { cursor, limit } = query;

      // Build where clause
      const whereConditions = [
        eq(schema.projects.tenantId, tenantId),
        eq(schema.projects.archived, false),
      ];

      // Add cursor condition if provided
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          whereConditions.push(
            lt(schema.projects.createdAt, new Date(decoded.timestamp))
          );
        }
      }

      // Fetch projects (limit + 1 for pagination)
      const projects = await db.query.projects.findMany({
        where: and(...whereConditions),
        orderBy: [desc(schema.projects.createdAt)],
        limit: limit + 1,
      });

      // Create paginated response
      const response = createPaginatedResponse(projects, limit);

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /projects
 * Create a new project
 */
router.post(
  '/',
  requireAuth,
  requireTenant,
  requirePermission('project:create'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate request body
      const data = createProjectSchema.parse(req.body);

      // Create project
      const [project] = await db
        .insert(schema.projects)
        .values({
          name: data.name,
          description: data.description || null,
          tenantId,
          archived: false,
        })
        .returning();

      res.status(201).json(project);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /projects/:id
 * Get project by ID
 */
router.get(
  '/:id',
  requireAuth,
  requireTenant,
  requirePermission('project:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = projectParamsSchema.parse(req.params);

      // Fetch project
      const project = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.id),
          eq(schema.projects.tenantId, tenantId)
        ),
      });

      if (!project) {
        throw createError.notFound('Project', params.id);
      }

      res.json(project);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * PATCH /projects/:id
 * Update project
 */
router.patch(
  '/:id',
  requireAuth,
  requireTenant,
  requirePermission('project:edit'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and body
      const params = projectParamsSchema.parse(req.params);
      const data = updateProjectSchema.parse(req.body);

      // Check project exists and belongs to tenant
      const existing = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.id),
          eq(schema.projects.tenantId, tenantId)
        ),
      });

      if (!existing) {
        throw createError.notFound('Project', params.id);
      }

      // Update project
      const [updated] = await db
        .update(schema.projects)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * DELETE /projects/:id
 * Soft-delete project (set archived = true)
 */
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requirePermission('project:delete'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = projectParamsSchema.parse(req.params);

      // Check project exists and belongs to tenant
      const existing = await db.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, params.id),
          eq(schema.projects.tenantId, tenantId)
        ),
      });

      if (!existing) {
        throw createError.notFound('Project', params.id);
      }

      // Soft delete (set archived = true)
      await db
        .update(schema.projects)
        .set({
          archived: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.projects.id, params.id));

      res.status(204).send();
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

export default router;
