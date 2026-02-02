import { z } from "zod";

import { insertProjectSchema } from "@shared/schema";
import type { PrincipalType, User } from "@shared/schema";

import { logger } from "../logger";
import { hybridAuth } from '../middleware/auth';
import { requireUser } from '../middleware/requireUser';
import { validateProjectId } from '../middleware/validateId';
import { projectService } from "../services/ProjectService";
import { asyncHandler } from "../utils/asyncHandler";

import type { UserRequest } from '../middleware/requireUser';
import type { Express, Request, Response } from "express";

const ERR_CREATING_PROJECT = "Failed to create project";
const ERR_NOT_FOUND = "not found";
const ERR_ACCESS_DENIED = "Access denied";
const STATUS_NOT_FOUND = 404;
const STATUS_FORBIDDEN = 403;
const STATUS_INTERNAL = 500;

function errorStatus(message: string): number {
  if (message.includes(ERR_NOT_FOUND)) {
    return STATUS_NOT_FOUND;
  }
  if (message.includes(ERR_ACCESS_DENIED)) {
    return STATUS_FORBIDDEN;
  }
  return STATUS_INTERNAL;
}

function errorStatusWithOwner(message: string): number {
  if (message.includes(ERR_NOT_FOUND)) {
    return STATUS_NOT_FOUND;
  }
  if (message.includes(ERR_ACCESS_DENIED) || message.includes("Only the")) {
    return STATUS_FORBIDDEN;
  }
  return STATUS_INTERNAL;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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
      const user = (req as UserRequest).user as User;

      if (user.tenantId === undefined || user.tenantId === null) {
        return res.status(400).json({ message: "User does not have a tenant assigned" });
      }

      const body = req.body as Record<string, unknown>;
      const projectData = insertProjectSchema.parse({
        ...body,
        title: (body.name as string | undefined) ?? (body.title as string | undefined) ?? 'Untitled Project',
        creatorId: user.id,
        createdBy: user.id,
        ownerId: user.id,
        tenantId: user.tenantId,
      });

      const project = await projectService.createProject(projectData, user.id);
      res.status(201).json(project);
    } catch (error) {
      logger.error({ error }, "Error creating project");
      res.status(STATUS_INTERNAL).json({
        message: ERR_CREATING_PROJECT,
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
      const user = (req as UserRequest).user as User;

      const activeOnly = req.query.active === 'true';
      const projects = activeOnly
        ? await projectService.listActiveProjects(user.id)
        : await projectService.listProjects(user.id);

      res.json(projects);
    } catch (error) {
      logger.error({ error }, "Error fetching projects");
      res.status(STATUS_INTERNAL).json({ message: "Failed to fetch projects" });
    }
  }));

  /**
   * GET /api/projects/:projectId
   * Get a single project with contained workflows
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const project = await projectService.getProjectWithWorkflows(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error fetching project");
      const message = getErrorMessage(error, "Failed to fetch project");
      const status = errorStatus(message);
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
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const workflows = await projectService.getProjectWorkflows(projectId, user.id);
      res.json(workflows);
    } catch (error) {
      logger.error({ error }, "Error fetching project workflows");
      const message = getErrorMessage(error, "Failed to fetch project workflows");
      const status = errorStatus(message);
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/projects/:projectId
   * Update a project
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const updateData = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['active', 'archived']).optional(),
      }).parse(req.body);

      const project = await projectService.updateProject(projectId, user.id, updateData);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error updating project");
      const message = getErrorMessage(error, "Failed to update project");
      const status = errorStatus(message);
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/projects/:projectId/archive
   * Archive a project (soft delete)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId/archive', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const project = await projectService.archiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error archiving project");
      const message = getErrorMessage(error, "Failed to archive project");
      const status = errorStatus(message);
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
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const project = await projectService.unarchiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error unarchiving project");
      const message = getErrorMessage(error, "Failed to unarchive project");
      const status = errorStatus(message);
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/projects/:projectId
   * Delete a project (hard delete)
   * Note: Workflows in the project will have their projectId set to null
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.delete('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      await projectService.deleteProject(projectId, user.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting project");
      const message = getErrorMessage(error, "Failed to delete project");
      const status = errorStatus(message);
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
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const access = await projectService.getProjectAccess(projectId, user.id);
      res.json({ success: true, data: access });
    } catch (error) {
      logger.error({ error }, "Error fetching project access");
      const message = getErrorMessage(error, "Failed to fetch project access");
      const status = errorStatus(message);
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
      const user = (req as UserRequest).user as User;
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
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = getErrorMessage(error, "Failed to grant project access");
      const status = errorStatusWithOwner(message);
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
      const user = (req as UserRequest).user as User;
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
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = getErrorMessage(error, "Failed to revoke project access");
      const status = errorStatus(message);
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/projects/:projectId/owner
   * Transfer project ownership
   * Body: { userId: string }
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/projects/:projectId/owner', hybridAuth, requireUser, validateProjectId(), asyncHandler(async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user as User;
      const { projectId } = req.params;

      const schema = z.object({
        userId: z.string(),
      });

      const { userId: newOwnerId } = schema.parse(req.body);
      const project = await projectService.transferProjectOwnership(projectId, user.id, newOwnerId);
      res.json({ success: true, data: project });
    } catch (error) {
      logger.error({ error }, "Error transferring project ownership");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = getErrorMessage(error, "Failed to transfer project ownership");
      const status = errorStatusWithOwner(message);
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
      const user = (req as UserRequest).user as User;
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
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = getErrorMessage(error, "Failed to transfer project ownership");
      const status = errorStatus(message);
      res.status(status).json({ success: false, error: message });
    }
  }));
}
