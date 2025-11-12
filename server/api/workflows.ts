import { Router, type Request, Response } from 'express';
import { eq, and, desc, lt, ilike, or } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { requireAuth } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { requirePermission } from '../middleware/rbac';
import { createError, formatErrorResponse } from '../utils/errors';
import { createPaginatedResponse, decodeCursor } from '../utils/pagination';
import { validateGraphStructure } from '../engine';
import type { AuthRequest } from '../middleware/auth';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  publishWorkflowSchema,
  listWorkflowsQuerySchema,
  listVersionsQuerySchema,
  workflowParamsSchema,
  projectIdParamsSchema,
  versionIdParamsSchema,
} from './validators/workflows';

const router = Router();

/**
 * GET /projects/:projectId/workflows
 * List workflows for a project
 */
router.get(
  '/projects/:projectId/workflows',
  requireAuth,
  requireTenant,
  requirePermission('workflow:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and query
      const params = projectIdParamsSchema.parse(req.params);
      const query = listWorkflowsQuerySchema.parse(req.query);
      const { cursor, limit, status, q } = query;

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
      const whereConditions = [eq(schema.workflows.projectId, params.projectId)];

      if (status) {
        whereConditions.push(eq(schema.workflows.status, status));
      }

      if (q) {
        whereConditions.push(ilike(schema.workflows.name, `%${q}%`));
      }

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          whereConditions.push(lt(schema.workflows.createdAt, new Date(decoded.timestamp)));
        }
      }

      // Fetch workflows
      const workflows = await db.query.workflows.findMany({
        where: and(...whereConditions),
        orderBy: [desc(schema.workflows.createdAt)],
        limit: limit + 1,
        with: {
          currentVersion: true,
        },
      });

      // Create paginated response
      const response = createPaginatedResponse(workflows, limit);

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /projects/:projectId/workflows
 * Create a new workflow (always starts as DRAFT)
 */
router.post(
  '/projects/:projectId/workflows',
  requireAuth,
  requireTenant,
  requirePermission('workflow:create'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

      // Validate params and body
      const params = projectIdParamsSchema.parse(req.params);
      const data = createWorkflowSchema.parse(req.body);

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

      // Validate graph structure if provided
      if (data.graphJson) {
        validateGraphStructure(data.graphJson);
      }

      // Create workflow and initial draft version in a transaction
      const result = await db.transaction(async (tx) => {
        // Create workflow
        const [workflow] = await tx
          .insert(schema.workflows)
          .values({
            name: data.name,
            projectId: params.projectId,
            status: 'draft',
          })
          .returning();

        // Create initial draft version
        const [version] = await tx
          .insert(schema.workflowVersions)
          .values({
            workflowId: workflow.id,
            graphJson: data.graphJson || {},
            createdBy: userId,
            published: false,
          })
          .returning();

        // Update workflow with current version
        const [updatedWorkflow] = await tx
          .update(schema.workflows)
          .set({ currentVersionId: version.id })
          .where(eq(schema.workflows.id, workflow.id))
          .returning();

        return { workflow: updatedWorkflow, version };
      });

      res.status(201).json({
        ...result.workflow,
        currentVersion: result.version,
      });
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /workflows/:id
 * Get workflow by ID with current version
 */
router.get(
  '/workflows/:id',
  requireAuth,
  requireTenant,
  requirePermission('workflow:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = workflowParamsSchema.parse(req.params);

      // Fetch workflow with project for tenant check
      const workflow = await db.query.workflows.findFirst({
        where: eq(schema.workflows.id, params.id),
        with: {
          project: true,
          currentVersion: true,
        },
      });

      if (!workflow) {
        throw createError.notFound('Workflow', params.id);
      }

      // Verify tenant access
      if (workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this workflow');
      }

      res.json(workflow);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * PATCH /workflows/:id
 * Update workflow (only allowed for DRAFT workflows)
 */
router.patch(
  '/workflows/:id',
  requireAuth,
  requireTenant,
  requirePermission('workflow:edit'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

      // Validate params and body
      const params = workflowParamsSchema.parse(req.params);
      const data = updateWorkflowSchema.parse(req.body);

      // Fetch workflow with project for tenant check
      const workflow = await db.query.workflows.findFirst({
        where: eq(schema.workflows.id, params.id),
        with: {
          project: true,
          currentVersion: true,
        },
      });

      if (!workflow) {
        throw createError.notFound('Workflow', params.id);
      }

      // Verify tenant access
      if (workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this workflow');
      }

      // Only allow editing draft workflows
      if (workflow.status !== 'draft') {
        throw createError.workflowNotDraft();
      }

      // Validate graph structure if provided
      if (data.graphJson) {
        validateGraphStructure(data.graphJson);
      }

      // Update workflow and version
      const result = await db.transaction(async (tx) => {
        // Update workflow name if provided
        if (data.name) {
          await tx
            .update(schema.workflows)
            .set({ name: data.name, updatedAt: new Date() })
            .where(eq(schema.workflows.id, params.id));
        }

        // Update current version if graphJson provided
        if (data.graphJson && workflow.currentVersionId) {
          await tx
            .update(schema.workflowVersions)
            .set({
              graphJson: data.graphJson,
              updatedAt: new Date(),
            })
            .where(eq(schema.workflowVersions.id, workflow.currentVersionId));
        }

        // Fetch updated workflow
        const updated = await tx.query.workflows.findFirst({
          where: eq(schema.workflows.id, params.id),
          with: { currentVersion: true },
        });

        return updated;
      });

      res.json(result);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * POST /workflows/:id/publish
 * Publish workflow (creates immutable version snapshot)
 */
router.post(
  '/workflows/:id/publish',
  requireAuth,
  requireTenant,
  requirePermission('workflow:publish'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;
      const userId = authReq.userId!;

      // Validate params and body
      const params = workflowParamsSchema.parse(req.params);
      publishWorkflowSchema.parse(req.body); // Validate but don't use for now

      // Fetch workflow with project for tenant check
      const workflow = await db.query.workflows.findFirst({
        where: eq(schema.workflows.id, params.id),
        with: {
          project: true,
          currentVersion: true,
        },
      });

      if (!workflow) {
        throw createError.notFound('Workflow', params.id);
      }

      // Verify tenant access
      if (workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this workflow');
      }

      // Must have a current version
      if (!workflow.currentVersion) {
        throw createError.workflowNoVersion();
      }

      // Publish workflow in transaction
      const result = await db.transaction(async (tx) => {
        // Mark current version as published
        await tx
          .update(schema.workflowVersions)
          .set({
            published: true,
            publishedAt: new Date(),
          })
          .where(eq(schema.workflowVersions.id, workflow.currentVersionId!));

        // Update workflow status to published
        await tx
          .update(schema.workflows)
          .set({
            status: 'published',
            updatedAt: new Date(),
          })
          .where(eq(schema.workflows.id, params.id));

        // Fetch updated workflow
        const updated = await tx.query.workflows.findFirst({
          where: eq(schema.workflows.id, params.id),
          with: { currentVersion: true },
        });

        return updated;
      });

      res.json(result);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /workflows/:id/versions
 * List versions for a workflow
 */
router.get(
  '/workflows/:id/versions',
  requireAuth,
  requireTenant,
  requirePermission('workflow:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params and query
      const params = workflowParamsSchema.parse(req.params);
      const query = listVersionsQuerySchema.parse(req.query);
      const { cursor, limit } = query;

      // Fetch workflow with project for tenant check
      const workflow = await db.query.workflows.findFirst({
        where: eq(schema.workflows.id, params.id),
        with: { project: true },
      });

      if (!workflow) {
        throw createError.notFound('Workflow', params.id);
      }

      // Verify tenant access
      if (workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this workflow');
      }

      // Build where clause
      const whereConditions = [eq(schema.workflowVersions.workflowId, params.id)];

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          whereConditions.push(lt(schema.workflowVersions.createdAt, new Date(decoded.timestamp)));
        }
      }

      // Fetch versions
      const versions = await db.query.workflowVersions.findMany({
        where: and(...whereConditions),
        orderBy: [desc(schema.workflowVersions.createdAt)],
        limit: limit + 1,
        with: {
          createdByUser: {
            columns: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      // Create paginated response
      const response = createPaginatedResponse(versions, limit);

      res.json(response);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

/**
 * GET /workflowVersions/:versionId
 * Get specific workflow version
 */
router.get(
  '/workflowVersions/:versionId',
  requireAuth,
  requireTenant,
  requirePermission('workflow:view'),
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const tenantId = authReq.tenantId!;

      // Validate params
      const params = versionIdParamsSchema.parse(req.params);

      // Fetch version with workflow and project
      const version = await db.query.workflowVersions.findFirst({
        where: eq(schema.workflowVersions.id, params.versionId),
        with: {
          workflow: {
            with: {
              project: true,
            },
          },
          createdByUser: {
            columns: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      if (!version) {
        throw createError.notFound('WorkflowVersion', params.versionId);
      }

      // Verify tenant access
      if (version.workflow.project.tenantId !== tenantId) {
        throw createError.forbidden('Access denied to this version');
      }

      res.json(version);
    } catch (error) {
      const formatted = formatErrorResponse(error);
      res.status(formatted.status).json(formatted.body);
    }
  }
);

export default router;
