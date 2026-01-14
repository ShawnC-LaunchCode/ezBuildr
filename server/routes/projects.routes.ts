import { z } from "zod";

import { insertProjectSchema } from "@shared/schema";

import { logger } from "../logger";
import { hybridAuth } from '../middleware/auth';
import { requireUser, type UserRequest } from '../middleware/requireUser';
import { validateProjectId } from '../middleware/validateId';
import { projectService } from "../services/ProjectService";



import type { Express, Request, Response } from "express";

/**
 * Register project-related routes
 * Handles project CRUD operations and workflow organization
 */
export function registerProjectRoutes(app: Express): void {
  /**
   * POST /api/projects
   * Create a new project
   */
  app.post('/api/projects', hybridAuth, requireUser, async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      if (!user.tenantId) {
        return res.status(400).json({ message: "User does not have a tenant assigned" });
      }

      const projectData = insertProjectSchema.parse({
        ...req.body,
        title: req.body.name || req.body.title || 'Untitled Project', // Legacy field
        creatorId: user.id, // Legacy field
        createdBy: user.id, // New field (Stage 24)
        ownerId: user.id, // Creator is also the initial owner
        tenantId: user.tenantId, // Use user's tenant ID
      });

      const project = await projectService.createProject(projectData, user.id);
      res.status(201).json(project);
    } catch (error) {
      logger.error({ error }, "Error creating project");
      res.status(500).json({
        message: "Failed to create project",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/projects
   * Get all projects for the authenticated user
   */
  app.get('/api/projects', hybridAuth, requireUser, async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;

      const activeOnly = req.query.active === 'true';
      const projects = activeOnly
        ? await projectService.listActiveProjects(user.id)
        : await projectService.listProjects(user.id);

      res.json(projects);
    } catch (error) {
      logger.error({ error }, "Error fetching projects");
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  /**
   * GET /api/projects/:projectId
   * Get a single project with contained workflows
   */
  app.get('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.getProjectWithWorkflows(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error fetching project");
      const message = error instanceof Error ? error.message : "Failed to fetch project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/projects/:projectId/workflows
   * Get all workflows in a project
   */
  app.get('/api/projects/:projectId/workflows', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const workflows = await projectService.getProjectWorkflows(projectId, user.id);
      res.json(workflows);
    } catch (error) {
      logger.error({ error }, "Error fetching project workflows");
      const message = error instanceof Error ? error.message : "Failed to fetch project workflows";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId
   * Update a project
   */
  app.put('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
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
      const message = error instanceof Error ? error.message : "Failed to update project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId/archive
   * Archive a project (soft delete)
   */
  app.put('/api/projects/:projectId/archive', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.archiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error archiving project");
      const message = error instanceof Error ? error.message : "Failed to archive project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId/unarchive
   * Unarchive a project
   */
  app.put('/api/projects/:projectId/unarchive', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const project = await projectService.unarchiveProject(projectId, user.id);
      res.json(project);
    } catch (error) {
      logger.error({ error }, "Error unarchiving project");
      const message = error instanceof Error ? error.message : "Failed to unarchive project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/projects/:projectId
   * Delete a project (hard delete)
   * Note: Workflows in the project will have their projectId set to null
   */
  app.delete('/api/projects/:projectId', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      await projectService.deleteProject(projectId, user.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting project");
      const message = error instanceof Error ? error.message : "Failed to delete project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // PROJECT ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/projects/:projectId/access
   * Get all ACL entries for a project
   */
  app.get('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
      const { projectId } = req.params;

      const access = await projectService.getProjectAccess(projectId, user.id);
      res.json({ success: true, data: access });
    } catch (error) {
      logger.error({ error }, "Error fetching project access");
      const message = error instanceof Error ? error.message : "Failed to fetch project access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/projects/:projectId/access
   * Grant or update access to a project
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string, role: 'view' | 'edit' | 'owner' }] }
   */
  app.put('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
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
      const access = await projectService.grantProjectAccess(projectId, user.id, entries);
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

      const message = error instanceof Error ? error.message : "Failed to grant project access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") || message.includes("Only the") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/projects/:projectId/access
   * Revoke access from a project
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string }] }
   */
  app.delete('/api/projects/:projectId/access', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
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
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : "Failed to revoke project access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/projects/:projectId/owner
   * Transfer project ownership
   * Body: { userId: string }
   */
  app.put('/api/projects/:projectId/owner', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
    try {
      const user = (req as UserRequest).user;
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

      const message = error instanceof Error ? error.message : "Failed to transfer project ownership";
      const status = message.includes("not found") ? 404 : message.includes("Only the") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/projects/:projectId/transfer
   * Transfer project ownership (new ownership model)
   * Cascades to all child workflows
   * Body: { targetOwnerType: 'user' | 'org', targetOwnerUuid: string }
   */
  app.post('/api/projects/:projectId/transfer', hybridAuth, requireUser, validateProjectId(), async (req: Request, res: Response) => {
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
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : "Failed to transfer project ownership";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });
}
