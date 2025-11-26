import type { Express, Request, Response } from "express";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { creatorOrRunTokenAuth } from '../middleware/runTokenAuth';
import { insertWorkflowSchema } from "@shared/schema";
import { workflowService } from "../services/WorkflowService";
import { variableService } from "../services/VariableService";
import { templateTestService } from "../services/TemplateTestService";
import { logicRuleRepository } from "../repositories/LogicRuleRepository";
import { z } from "zod";
import { logger } from "../logger";

/**
 * Register workflow-related routes
 * Handles workflow CRUD operations and status management
 */
export function registerWorkflowRoutes(app: Express): void {
  /**
   * POST /api/workflows
   * Create a new workflow
   */
  app.post('/api/workflows', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflowData = insertWorkflowSchema.parse({
        ...req.body,
        creatorId: userId,
        ownerId: userId, // Creator is also the initial owner
      });

      const workflow = await workflowService.createWorkflow(workflowData, userId);
      res.status(201).json(workflow);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, "Error creating workflow");
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
  app.get('/api/workflows', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflows = await workflowService.listWorkflows(userId);
      res.json(workflows);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, "Error fetching workflows");
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  });

  /**
   * GET /api/workflows/unfiled
   * Get all unfiled workflows (workflows not in any project) for the authenticated user
   * NOTE: This must come BEFORE /api/workflows/:workflowId to avoid "unfiled" being treated as a workflowId
   */
  app.get('/api/workflows/unfiled', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const workflows = await workflowService.listUnfiledWorkflows(userId);
      res.json(workflows);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, "Error fetching unfiled workflows");
      res.status(500).json({ message: "Failed to fetch unfiled workflows" });
    }
  });

  /**
   * GET /api/workflows/:workflowId
   * Get a single workflow with full details (sections, steps, rules)
   */
  app.get('/api/workflows/:workflowId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const workflow = await workflowService.getWorkflowWithDetails(workflowId, userId);
      res.json(workflow);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId
   * Update a workflow
   */
  app.put('/api/workflows/:workflowId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const updateData = req.body;

      const workflow = await workflowService.updateWorkflow(workflowId, userId, updateData);
      res.json(workflow);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error updating workflow");
      const message = error instanceof Error ? error.message : "Failed to update workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/workflows/:workflowId
   * Delete a workflow
   */
  app.delete('/api/workflows/:workflowId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      await workflowService.deleteWorkflow(workflowId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error deleting workflow");
      const message = error instanceof Error ? error.message : "Failed to delete workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/status
   * Change workflow status
   */
  app.put('/api/workflows/:workflowId/status', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId, status: req.body.status }, "Error changing workflow status");
      const message = error instanceof Error ? error.message : "Failed to change status";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/intake-config
   * Update workflow intake configuration (Stage 12.5)
   */
  app.put('/api/workflows/:workflowId/intake-config', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const intakeConfigSchema = z.object({
        allowPrefill: z.boolean().optional(),
        allowedPrefillKeys: z.array(z.string()).optional(),
        requireCaptcha: z.boolean().optional(),
        captchaType: z.enum(["simple", "recaptcha"]).optional(),
        sendEmailReceipt: z.boolean().optional(),
        receiptEmailVar: z.string().optional(),
        receiptTemplateId: z.string().optional(),
      });

      const intakeConfig = intakeConfigSchema.parse(req.body);

      const workflow = await workflowService.updateIntakeConfig(workflowId, userId, intakeConfig);
      res.json(workflow);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error updating intake config");
      const message = error instanceof Error ? error.message : "Failed to update intake config";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/move
   * Move workflow to a project (or unfiled if projectId is null)
   */
  app.put('/api/workflows/:workflowId/move', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId, projectId: req.body.projectId }, "Error moving workflow");
      const message = error instanceof Error ? error.message : "Failed to move workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/mode
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  app.get('/api/workflows/:workflowId/mode', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const result = await workflowService.getResolvedMode(workflowId, userId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow mode");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow mode";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/mode
   * Set or clear workflow mode override
   */
  app.put('/api/workflows/:workflowId/mode', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId, modeOverride: req.body.modeOverride }, "Error setting workflow mode");

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
  app.get('/api/workflows/:workflowId/variables', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const variables = await variableService.listVariables(workflowId, userId);
      res.json(variables);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow variables");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow variables";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/public-link
   * Get or generate public link for a workflow
   * Returns the full public URL that can be shared
   */
  app.get('/api/workflows/:workflowId/public-link', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const publicUrl = await workflowService.getOrGeneratePublicLink(workflowId, userId);
      res.json({ publicUrl });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow public link");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow public link";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/logic-rules
   * Get all logic rules for a workflow
   * Supports both session auth (builder) and run token (preview runner)
   */
  app.get('/api/workflows/:workflowId/logic-rules', creatorOrRunTokenAuth, async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const logicRules = await logicRuleRepository.findByWorkflowId(workflowId);
      res.json(logicRules);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error fetching workflow logic rules");
      const message = error instanceof Error ? error.message : "Failed to fetch workflow logic rules";
      res.status(500).json({ message });
    }
  });

  // ===================================================================
  // WORKFLOW ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/workflows/:workflowId/access
   * Get all ACL entries for a workflow
   */
  app.get('/api/workflows/:workflowId/access', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const access = await workflowService.getWorkflowAccess(workflowId, userId);
      res.json({ success: true, data: access });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow access");
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
  app.put('/api/workflows/:workflowId/access', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error granting workflow access");

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
  app.delete('/api/workflows/:workflowId/access', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error revoking workflow access");

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
  app.put('/api/workflows/:workflowId/owner', hybridAuth, async (req: Request, res: Response) => {
    try {
      const currentOwnerId = (req as AuthRequest).userId;
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
      logger.error({ error, workflowId: req.params.workflowId, currentOwnerId: (req as AuthRequest).userId, newOwnerId: req.body.userId }, "Error transferring workflow ownership");

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

  /**
   * POST /api/workflows/:workflowId/templates/:templateId/test
   * Test a template with sample data
   * PR4: Template Test Runner API
   * Body: { outputType: 'docx' | 'pdf' | 'both', sampleData: any }
   */
  app.post('/api/workflows/:workflowId/templates/:templateId/test', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, templateId } = req.params;

      // Validate request body
      const schema = z.object({
        outputType: z.enum(['docx', 'pdf', 'both']),
        sampleData: z.record(z.any()),
      });

      const { outputType, sampleData } = schema.parse(req.body);

      // Run the template test
      const result = await templateTestService.runTest({
        workflowId,
        templateId,
        outputType,
        sampleData,
      });

      // Return result with appropriate status code
      const statusCode = result.ok ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, templateId: req.params.templateId, userId: (req as AuthRequest).userId }, "Error testing template");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          status: 'error',
          durationMs: 0,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              path: error.errors[0]?.path?.join('.'),
            },
          ],
        });
      }

      res.status(500).json({
        ok: false,
        status: 'error',
        durationMs: 0,
        errors: [
          {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        ],
      });
    }
  });
}
