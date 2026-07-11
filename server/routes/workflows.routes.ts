/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { z } from "zod";

import { insertWorkflowSchema } from "@shared/schema";

import { logger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { createLimiter } from "../middleware/rateLimiting";
import { logicRuleRepository } from "../repositories/LogicRuleRepository";
import { templateTestService } from "../services/TemplateTestService";
import { variableService } from "../services/VariableService";
import { aclService } from "../services/AclService";
import { workflowClonerService } from "../services/WorkflowClonerService";
import { workflowService } from "../services/WorkflowService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";



import type { Express, Request, Response } from "express";

// eslint-disable-next-line sonarjs/no-duplicate-string
const ERR_INVALID_INPUT = "Invalid input";

const copyWorkflowBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  targetOwnerType: z.enum(['user', 'org']).optional(),
  targetOwnerUuid: z.string().uuid().optional(),
  targetProjectId: z.string().uuid().nullable().optional(),
  includeRelatedDatavault: z.boolean().optional(),
  includeDatavaultData: z.boolean().optional(),
  clearAccess: z.boolean().optional(),
});

/**
 * Register workflow-related routes
 * Handles workflow CRUD operations and status management
 */
// eslint-disable-next-line max-lines-per-function
export function registerWorkflowRoutes(app: Express): void {
  /**
   * POST /api/workflows
   * Create a new workflow
   */
  app.post('/api/workflows', hybridAuth, createLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        // eslint-disable-next-line sonarjs/no-duplicate-string
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
  }));

  /**
   * GET /api/workflows
   * Get all workflows for the authenticated user
   */
  app.get('/api/workflows', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
  }));

  /**
   * GET /api/workflows/unfiled
   * Get all unfiled workflows (workflows not in any project) for the authenticated user
   * NOTE: This must come BEFORE /api/workflows/:workflowId to avoid "unfiled" being treated as a workflowId
   */
  app.get('/api/workflows/unfiled', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
  }));

  /**
   * GET /api/workflows/:workflowId
   * Get a single workflow with full details (sections, steps, rules)
   */
  app.get('/api/workflows/:workflowId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/copy
   * Copy a workflow and optionally its related DataVault resources.
   */
  app.post('/api/workflows/:workflowId/copy', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const options = copyWorkflowBodySchema.parse(req.body);
      const result = await workflowClonerService.copyWorkflow(workflowId, userId, options);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error copying workflow");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERR_INVALID_INPUT,
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to copy workflow");
      res.status(status).json({ success: false, error: message, message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId
   * Update a workflow
   */
  app.put('/api/workflows/:workflowId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    const updateWorkflowSchema = z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      name: z.string().optional(),
      projectId: z.string().uuid().optional(),
      isPublic: z.boolean().optional(),
      slug: z.string().optional(),
      requireLogin: z.boolean().optional(),
      intakeConfig: z.record(z.any()).optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      sections: z.array(z.any()).optional(),
      modeOverride: z.string().optional(),
      publicLink: z.string().optional(),
      ownerType: z.enum(['user', 'organization', 'team', 'system']).optional(),
      ownerUuid: z.string().optional(),
    });

    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const parsedData = updateWorkflowSchema.parse(req.body);

      // SECURITY FIX: Strip protected fields to prevent mass assignment by edit-only users
      const updateData = { ...parsedData };
      delete updateData.ownerType;
      delete updateData.ownerUuid;
      delete updateData.status;

      let workflow;
      // Deep update if sections are provided (e.g. from AI)
      if (updateData.sections && Array.isArray(updateData.sections)) {
        workflow = await workflowService.replaceWorkflowContent(workflowId, userId, updateData);
      } else {
        // @ts-expect-error - updateData's zod-parsed shape is wider than updateWorkflow's param type
        workflow = await workflowService.updateWorkflow(workflowId, userId, updateData);
      }

      res.json(workflow);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error updating workflow");
      const { status, message } = classifyRouteError(error, "Failed to update workflow");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId
   * Delete a workflow
   */
  app.delete('/api/workflows/:workflowId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to delete workflow");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/status
   * Change workflow status
   */
  app.put('/api/workflows/:workflowId/status', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to change status");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/intake-config
   * Update workflow intake configuration (Stage 12.5)
   */
  app.put('/api/workflows/:workflowId/intake-config', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to update intake config");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/move
   * Move workflow to a project (or unfiled if projectId is null)
   */
  app.put('/api/workflows/:workflowId/move', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      return res.status(200).json(workflow);
    } catch (error: unknown) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId, projectId: req.body.projectId }, "Error moving workflow");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          // eslint-disable-next-line sonarjs/no-duplicate-string
          message: "Invalid input",
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to move workflow");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/mode
   * Get resolved mode for a workflow (modeOverride ?? user.defaultMode)
   */
  app.get('/api/workflows/:workflowId/mode', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow mode");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/mode
   * Set or clear workflow mode override
   */
  app.put('/api/workflows/:workflowId/mode', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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

      // Preserve intentional validation errors as 400 (e.g. "Invalid mode value ...")
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("Invalid")) {
        return res.status(400).json({ success: false, error: raw });
      }
      const { status, message } = classifyRouteError(error, "Failed to set workflow mode");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/variables
   * Get all variables (steps with aliases) for a workflow
   * Returns array of WorkflowVariable objects ordered by section/step order
   */
  app.get('/api/workflows/:workflowId/variables', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow variables");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/public-link
   * Get or generate public link for a workflow
   * Returns the full public URL that can be shared
   */
  app.get('/api/workflows/:workflowId/public-link', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow public link");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/logic-rules
   * Get all logic rules for a workflow
   */
  app.get('/api/workflows/:workflowId/logic-rules', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      await workflowService.verifyAccess(workflowId, userId, 'view');
      const logicRules = await logicRuleRepository.findByWorkflowId(workflowId);
      res.json(logicRules);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error fetching workflow logic rules");
      const message = "Failed to fetch workflow logic rules";
      res.status(500).json({ message });
    }
  }));

  // ===================================================================
  // WORKFLOW ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/workflows/:workflowId/access
   * Get all ACL entries for a workflow
   */
  app.get('/api/workflows/:workflowId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const [access, currentUserRole] = await Promise.all([
        workflowService.getWorkflowAccess(workflowId, userId),
        aclService.resolveRoleForWorkflow(userId, workflowId),
      ]);
      res.json({ success: true, data: access, currentUserRole });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error fetching workflow access");
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/access
   * Grant or update access to a workflow
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string, role: 'view' | 'edit' | 'owner' }] }
   */
  app.put('/api/workflows/:workflowId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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

      // Preserve owner-only authorization denials as 403 (e.g. "Only the workflow owner ...")
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("Only the")) {
        return res.status(403).json({ success: false, error: raw });
      }
      const { status, message } = classifyRouteError(error, "Failed to grant workflow access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId/access
   * Revoke access from a workflow
   * Body: { entries: [{ principalType: 'user' | 'team', principalId: string }] }
   */
  app.delete('/api/workflows/:workflowId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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

      const { status, message } = classifyRouteError(error, "Failed to revoke workflow access");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/owner
   * Transfer workflow ownership
   * Body: { userId: string }
   */
  app.put('/api/workflows/:workflowId/owner', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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

      // Preserve owner-only authorization denials as 403 (e.g. "Only the current owner ...")
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("Only the")) {
        return res.status(403).json({ success: false, error: raw });
      }
      const { status, message } = classifyRouteError(error, "Failed to transfer workflow ownership");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/templates/:templateId/test
   * Test a template with sample data
   * PR4: Template Test Runner API
   * Body: { outputType: 'docx' | 'pdf' | 'both', sampleData: any }
   */
  app.post('/api/workflows/:workflowId/templates/:templateId/test', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, templateId } = req.params;

      // Validate request body
      const schema = z.object({
        outputType: z.enum(['docx', 'pdf', 'both']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic sample data for template testing
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
            message: 'Internal server error',
          },
        ],
      });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/transfer
   * Transfer workflow ownership (new ownership model)
   * Detaches from project if transferring to different owner than project
   * Body: { targetOwnerType: 'user' | 'org', targetOwnerUuid: string }
   */
  app.post('/api/workflows/:workflowId/transfer', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { workflowId } = req.params;

      const schema = z.object({
        targetOwnerType: z.enum(['user', 'org']),
        targetOwnerUuid: z.string().uuid(),
      });

      const { targetOwnerType, targetOwnerUuid } = schema.parse(req.body);
      const workflow = await workflowService.transferOwnership(
        workflowId,
        userId,
        targetOwnerType,
        targetOwnerUuid
      );

      logger.info({ workflowId, targetOwnerType, targetOwnerUuid, userId }, 'Workflow ownership transferred');
      res.json({ success: true, data: workflow });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error transferring workflow ownership");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid input",
          details: error.errors,
        });
      }

      const { status, message } = classifyRouteError(error, "Failed to transfer workflow ownership");
      res.status(status).json({ success: false, error: message });
    }
  }));
}
