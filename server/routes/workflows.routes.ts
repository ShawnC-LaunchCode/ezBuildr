import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertWorkflowSchema } from "@shared/schema";
import { workflowService } from "../services/WorkflowService";
import { variableService } from "../services/VariableService";
import { z } from "zod";

/**
 * Register workflow-related routes
 * Handles workflow CRUD operations and status management
 */
export function registerWorkflowRoutes(app: Express): void {
  /**
   * POST /api/workflows
   * Create a new workflow
   */
  app.post('/api/workflows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflowData = insertWorkflowSchema.parse({
        ...req.body,
        creatorId: userId,
      });

      const workflow = await workflowService.createWorkflow(workflowData, userId);
      res.status(201).json(workflow);
    } catch (error) {
      console.error("Error creating workflow:", error);
      res.status(500).json({
        message: "Failed to create workflow",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/workflows
   * Get all workflows for the authenticated user
   */
  app.get('/api/workflows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflows = await workflowService.listWorkflows(userId);
      res.json(workflows);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  });

  /**
   * GET /api/workflows/:workflowId
   * Get a single workflow with full details (sections, steps, rules)
   */
  app.get('/api/workflows/:workflowId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const workflow = await workflowService.getWorkflowWithDetails(workflowId, userId);
      res.json(workflow);
    } catch (error) {
      console.error("Error fetching workflow:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId
   * Update a workflow
   */
  app.put('/api/workflows/:workflowId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const updateData = req.body;

      const workflow = await workflowService.updateWorkflow(workflowId, userId, updateData);
      res.json(workflow);
    } catch (error) {
      console.error("Error updating workflow:", error);
      const message = error instanceof Error ? error.message : "Failed to update workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/workflows/:workflowId
   * Delete a workflow
   */
  app.delete('/api/workflows/:workflowId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      await workflowService.deleteWorkflow(workflowId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting workflow:", error);
      const message = error instanceof Error ? error.message : "Failed to delete workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/status
   * Change workflow status
   */
  app.put('/api/workflows/:workflowId/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const { status } = req.body;

      if (!['draft', 'active', 'archived'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const workflow = await workflowService.changeStatus(workflowId, userId, status);
      res.json(workflow);
    } catch (error) {
      console.error("Error changing workflow status:", error);
      const message = error instanceof Error ? error.message : "Failed to change status";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/move
   * Move workflow to a project (or unfiled if projectId is null)
   */
  app.put('/api/workflows/:workflowId/move', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const { projectId } = z.object({
        projectId: z.string().uuid().nullable(),
      }).parse(req.body);

      const workflow = await workflowService.moveToProject(workflowId, userId, projectId);
      res.json(workflow);
    } catch (error) {
      console.error("Error moving workflow:", error);
      const message = error instanceof Error ? error.message : "Failed to move workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/unfiled
   * Get all unfiled workflows (workflows not in any project) for the authenticated user
   */
  app.get('/api/workflows/unfiled', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflows = await workflowService.listUnfiledWorkflows(userId);
      res.json(workflows);
    } catch (error) {
      console.error("Error fetching unfiled workflows:", error);
      res.status(500).json({ message: "Failed to fetch unfiled workflows" });
    }
  });

  /**
   * GET /api/workflows/:workflowId/mode
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  app.get('/api/workflows/:workflowId/mode', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const result = await workflowService.getResolvedMode(workflowId, userId);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error fetching workflow mode:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch workflow mode";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/mode
   * Set or clear workflow mode override
   */
  app.put('/api/workflows/:workflowId/mode', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const { modeOverride } = z.object({
        modeOverride: z.enum(['easy', 'advanced']).nullable(),
      }).parse(req.body);

      const workflow = await workflowService.setModeOverride(workflowId, userId, modeOverride);
      res.json({ success: true, data: workflow });
    } catch (error) {
      console.error("Error setting workflow mode:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: error.errors
        });
      }

      const message = error instanceof Error ? error.message : "Failed to set workflow mode";
      const status = message.includes("not found") ? 404 :
                     message.includes("Access denied") ? 403 :
                     message.includes("Invalid") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/variables
   * Get all variables (steps with aliases) for a workflow
   * Returns array of WorkflowVariable objects ordered by section/step order
   */
  app.get('/api/workflows/:workflowId/variables', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const variables = await variableService.listVariables(workflowId, userId);
      res.json(variables);
    } catch (error) {
      console.error("Error fetching workflow variables:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch workflow variables";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // WORKFLOW ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/workflows/:workflowId/access
   * Get all ACL entries for a workflow
   */
  app.get('/api/workflows/:workflowId/access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const access = await workflowService.getWorkflowAccess(workflowId, userId);
      res.json({ success: true, data: access });
    } catch (error) {
      console.error("Error fetching workflow access:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch workflow access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/access
   * Grant or update access to a workflow
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string, role: 'view' | 'edit' | 'owner' }] }
   */
  app.put('/api/workflows/:workflowId/access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;

      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
          role: z.enum(['view', 'edit', 'owner']),
        })),
      });

      const { entries } = schema.parse(req.body);
      const access = await workflowService.grantWorkflowAccess(workflowId, userId, entries);
      res.json({ success: true, data: access });
    } catch (error) {
      console.error("Error granting workflow access:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : "Failed to grant workflow access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") || message.includes("Only the") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/workflows/:workflowId/access
   * Revoke access from a workflow
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string }] }
   */
  app.delete('/api/workflows/:workflowId/access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;

      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
        })),
      });

      const { entries } = schema.parse(req.body);
      await workflowService.revokeWorkflowAccess(workflowId, userId, entries);
      res.json({ success: true, message: "Access revoked successfully" });
    } catch (error) {
      console.error("Error revoking workflow access:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : "Failed to revoke workflow access";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/owner
   * Transfer workflow ownership
   * Body: { userId: string }
   */
  app.put('/api/workflows/:workflowId/owner', isAuthenticated, async (req: any, res) => {
    try {
      const currentOwnerId = req.user?.claims?.sub;
      if (!currentOwnerId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;

      const schema = z.object({
        userId: z.string(),
      });

      const { userId: newOwnerId } = schema.parse(req.body);
      const workflow = await workflowService.transferWorkflowOwnership(workflowId, currentOwnerId, newOwnerId);
      res.json({ success: true, data: workflow });
    } catch (error) {
      console.error("Error transferring workflow ownership:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : "Failed to transfer workflow ownership";
      const status = message.includes("not found") ? 404 : message.includes("Only the") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });
}
