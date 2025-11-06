import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertProjectSchema } from "@shared/schema";
import { projectService } from "../services/ProjectService";
import { z } from "zod";

/**
 * Register project-related routes
 * Handles project CRUD operations and workflow organization
 */
export function registerProjectRoutes(app: Express): void {
  /**
   * POST /api/projects
   * Create a new project
   */
  app.post('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const projectData = insertProjectSchema.parse({
        ...req.body,
        creatorId: userId,
      });

      const project = await projectService.createProject(projectData, userId);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
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
  app.get('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const activeOnly = req.query.active === 'true';
      const projects = activeOnly
        ? await projectService.listActiveProjects(userId)
        : await projectService.listProjects(userId);

      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  /**
   * GET /api/projects/:projectId
   * Get a single project with contained workflows
   */
  app.get('/api/projects/:projectId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      const project = await projectService.getProjectWithWorkflows(projectId, userId);
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/projects/:projectId/workflows
   * Get all workflows in a project
   */
  app.get('/api/projects/:projectId/workflows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      const workflows = await projectService.getProjectWorkflows(projectId, userId);
      res.json(workflows);
    } catch (error) {
      console.error("Error fetching project workflows:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch project workflows";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId
   * Update a project
   */
  app.put('/api/projects/:projectId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      const updateData = z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['active', 'archived']).optional(),
      }).parse(req.body);

      const project = await projectService.updateProject(projectId, userId, updateData);
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      const message = error instanceof Error ? error.message : "Failed to update project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId/archive
   * Archive a project (soft delete)
   */
  app.put('/api/projects/:projectId/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      const project = await projectService.archiveProject(projectId, userId);
      res.json(project);
    } catch (error) {
      console.error("Error archiving project:", error);
      const message = error instanceof Error ? error.message : "Failed to archive project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/projects/:projectId/unarchive
   * Unarchive a project
   */
  app.put('/api/projects/:projectId/unarchive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      const project = await projectService.unarchiveProject(projectId, userId);
      res.json(project);
    } catch (error) {
      console.error("Error unarchiving project:", error);
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
  app.delete('/api/projects/:projectId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { projectId } = req.params;
      await projectService.deleteProject(projectId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      const message = error instanceof Error ? error.message : "Failed to delete project";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
