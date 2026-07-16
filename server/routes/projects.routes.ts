import { z } from "zod";

import { insertProjectSchema } from "@shared/schema";
import type { PrincipalType } from "@shared/schema";

import { logger } from "../logger";
import { hybridAuth } from '../middleware/auth';
import { requireUser } from '../middleware/requireUser';
import { validateProjectId } from '../middleware/validateId';
import { aclService } from "../services/AclService";
import { projectService } from "../services/ProjectService";
import { workflowClonerService } from "../services/WorkflowClonerService";
import { asyncHandler } from "../utils/asyncHandler";
import { createPaginatedResponse } from "../utils/pagination";
import { classifyRouteError } from "../utils/routeErrors";

import type { UserRequest } from '../middleware/requireUser';
import type { Express, Request, Response } from "express";

const ERR_CREATING_PROJECT = "Failed to create project";
const ERR_INVALID_INPUT = "Invalid input";

const createProjectBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  ownerType: z.enum(['user', 'org']).optional(),
  ownerUuid: z.string().uuid().optional(),
}).refine((body) => Boolean(body.title ?? body.name), {
  message: "Project name is required",
  path: ["name"],
});

const updateProjectBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
});

const listProjectsQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const copyProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  targetOwnerType: z.enum(['user', 'org']).optional(),
  targetOwnerUuid: z.string().uuid().optional(),
  includeRelatedDatavault: z.boolean().optional(),
  includeDatavaultData: z.boolean().optional(),
  clearAccess: z.boolean().optional(),
});

/**
 * PUT/PATCH /api/projects/:projectId
 * Update a project (PATCH exists for compatibility with graph API clients)
 */
const handleProjectUpdate = asyncHandler(async (req: Request, res: Response) => {
  try {
    const user = (req as UserRequest).user;
    const { projectId } = req.params;

    const parsed = updateProjectBodySchema.parse(req.body);
    const title = parsed.title ?? parsed.name;
    const updateData = insertProjectSchema.partial().parse({
      ...(title !== undefined && { title, name: parsed.name ?? title }),
      ...(parsed.description !== undefined && { description: parsed.description }),
    });

    const project = await projectService.updateProject(projectId, user.id, updateData);
    res.json(project);
  } catch (error) {
    logger.error({ error }, "Error updating project");
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: ERR_INVALID_INPUT,
        details: error.errors,
      });
    }
    const { status, message } = classifyRouteError(error, "Failed to update project");
    res.status(status).json({ message });
  }
});

/**
 * Register project-related routes
 * Handles project CRUD operations and workflow organization
 */
// eslint-disable-next-line max-lines-per-function
export function registerProjectRoutes(app: Express): void {
  /**
   * POST /api/projects
   * Create a new project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/projects', hybridAuth, requireUser, asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      if (user.tenantId === undefined || user.tenantId === null) {
        return res.status(400).json({ message: "User does not have a tenant assigned" });
      }

      const parsedBody = createProjectBodySchema.parse(req.body);
      const title = parsedBody.title ?? parsedBody.name ?? 'Untitled Project';
      const ownerType = parsedBody.ownerType ?? 'user';
      const projectData = insertProjectSchema.parse({
        title,
        name: parsedBody.name ?? title,
        description: parsedBody.description,
        creatorId: user.id,
        createdBy: user.id,
        ownerId: user.id,
        tenantId: user.tenantId,
        ownerType,
        ownerUuid: parsedBody.ownerUuid ?? user.id,
      });

      const project = await projectService.createProject(projectData, user.id);
      res.status(201).json(project);
    } catch (error) {
      logger.error({ error }, "Error creating project");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, ERR_CREATING_PROJECT);
      res.status(status).json({
        message,
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * GET /api/projects
   * Get all projects for the authenticated user
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/projects', hybridAuth, requireUser, asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      const query = listProjectsQuerySchema.parse(req.query);
      const activeOnly = query.active === 'true';
      const projects = activeOnly
        ? await projectService.listActiveProjects(user.id)
        : await projectService.listProjects(user.id);

      res.json(createPaginatedResponse(projects.slice(0, query.limit + 1), query.limit));
    } catch (error) {
      logger.error({ error }, "Error fetching projects");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, "Failed to fetch projects");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/organizations/:orgId/projects
   * Get projects owned by an organization.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/organizations/:orgId/projects', hybridAuth, requireUser, asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { orgId } = z.object({ orgId: z.string().uuid() }).parse(req.params);
      const { active } = z.object({ active: z.enum(['true', 'false']).optional() }).parse(req.query);

      const projects = await projectService.listOrganizationProjects(orgId, user.id, active !== 'false');
      res.json(projects);
    } catch (error) {
      logger.error({ error }, "Error fetching organization projects");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, "Failed to fetch organization projects");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/projects/:projectId
   * Get a single project with contained workflows
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.getProjectWithWorkflows(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error fetching project");
      const { status, message } = classifyRouteError(error, "Failed to fetch project");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/projects/:projectId/workflows
   * Get all workflows in a project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/projects/:projectId/workflows', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const workflows = await projectService.getProjectWorkflows(projectId, user.id);
      res.json(workflows);
    } catch (error) {
      logger.error({ error }, "Error fetching project workflows");
      const { status, message } = classifyRouteError(error, "Failed to fetch project workflows");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/projects/:projectId/copy
   * Copy a project, its workflows, and optionally related DataVault resources.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/projects/:projectId/copy', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;
      const options = copyProjectBodySchema.parse(req.body);

      const result = await workflowClonerService.copyProject(projectId, user.id, options);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      logger.error({ error, projectId: req.params.projectId }, "Error copying project");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, "Failed to copy project");
      res.status(status).json({ success: false, error: message, message });
    }
  }));

  /**
   * PUT /api/projects/:projectId
   * Update a project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), handleProjectUpdate);

  /**
   * PATCH /api/projects/:projectId
   * Update a project (compatibility with graph API clients)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.patch('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), handleProjectUpdate);

  /**
   * PUT /api/projects/:projectId/archive
   * Archive a project (soft delete)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId/archive', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.archiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error archiving project");
      const { status, message } = classifyRouteError(error, "Failed to archive project");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/projects/:projectId/unarchive
   * Unarchive a project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId/unarchive', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.unarchiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error unarchiving project");
      const { status, message } = classifyRouteError(error, "Failed to unarchive project");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/projects/:projectId
   * Delete a project (soft delete — archives the project)
   * Note: Workflows in the project are retained and keep their projectId;
   * the row is not removed, only marked archived. Requires 'owner' role
   * (+ org-admin for org-owned projects) — see ProjectService.deleteProject.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.delete('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      await projectService.deleteProject(projectId, user.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting project");
      const { status, message } = classifyRouteError(error, "Failed to delete project");
      res.status(status).json({ message });
    }
  }));

  // ===================================================================
  // PROJECT ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/projects/:projectId/access
   * Get all ACL entries for a project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const [access, currentUserRole] = await Promise.all([
        projectService.getProjectAccess(projectId, user.id),
        aclService.resolveRoleForProject(user.id, projectId),
      ]);
      res.json({ success: true, data: access, currentUserRole });
    } catch (error) {
      logger.error({ error }, "Error fetching project access");
      const { status, message } = classifyRouteError(error, "Failed to fetch project access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/projects/:projectId/access
   * Grant or update access to a project
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string, role: 'view' | 'edit' | 'owner' }] }
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
          role: z.enum(['view', 'edit', 'owner']),
        })),
      });

      const { entries } = schema.parse(req.body);
      const typedEntries = entries.map(e => ({
        principalType: e.principalType as PrincipalType,
        principalId: e.principalId,
        role: e.role,
      }));
      const access = await projectService.grantProjectAccess(projectId, user.id, typedEntries);
      res.json({ success: true, data: access });
    } catch (error) {
      logger.error({ error }, "Error granting project access");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to grant project access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/projects/:projectId/access
   * Revoke access from a project
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string }] }
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.delete('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
        })),
      });

      const { entries } = schema.parse(req.body);
      await projectService.revokeProjectAccess(projectId, user.id, entries);
      res.json({ success: true, message: "Access revoked successfully" });
    } catch (error) {
      logger.error({ error }, "Error revoking project access");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to revoke project access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * POST /api/projects/:projectId/transfer
   * Transfer project ownership (new ownership model)
   * Cascades to all child workflows
   * Body: { targetOwnerType: 'user' | 'org', targetOwnerUuid: string }
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/projects/:projectId/transfer', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const schema = z.object({
        targetOwnerType: z.enum(['user', 'org']),
        targetOwnerUuid: z.string().uuid(),
      });

      const { targetOwnerType, targetOwnerUuid } = schema.parse(req.body);
      const project = await projectService.transferOwnership(
        projectId,
        user.id,
        targetOwnerType,
        targetOwnerUuid
      );

      logger.info({ projectId, targetOwnerType, targetOwnerUuid, userId: user.id }, 'Project ownership transferred');
      res.json({ success: true, data: project });
    } catch (error) {
      logger.error({ error }, "Error transferring project ownership");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to transfer project ownership");
      res.status(status).json({ success: false, error: message });
    }
  }));
}
