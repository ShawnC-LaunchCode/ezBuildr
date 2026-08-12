import { z } from "zod";

import { insertWorkflowSchema } from "@shared/schema";
import { workflowBrandingSettingsSchema } from "@shared/types/branding";
import { BUSINESS_DAY_CALENDARS } from "@shared/types/workflow";
import { IntakeConfigSchema } from "@shared/zod-schemas";

import { conditionExpressionSchema } from "@shared/types/conditions";

import { logger } from "../logger";
import { hybridAuth, optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth';
import { createLimiter } from "../middleware/rateLimiting";
import { logicRuleRepository } from "../repositories/LogicRuleRepository";
import { templateTestService } from "../services/TemplateTestService";
import { variableService } from "../services/VariableService";
import { aclService } from "../services/AclService";
import { logicRuleService } from "../services/LogicRuleService";
import { workflowClonerService } from "../services/WorkflowClonerService";
import { workflowService } from "../services/WorkflowService";
import { workflowLintService } from "../services/WorkflowLintService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";



import type { Express, Request, Response } from "express";

// eslint-disable-next-line sonarjs/no-duplicate-string
const ERR_INVALID_INPUT = "Invalid input";

// LU-6b: full-body validation for authoring a logic rule's when/target/
// action. `when` is validated against the SAME `conditionExpressionSchema`
// `visibleIf` uses — the rule editor reuses `LogicBuilder`, not a second
// condition language. `conditionStepId` is deliberately NOT accepted from
// the client (O-7) — LogicRuleService derives it from `when` on every
// write so the two can never independently disagree.
const logicRuleInputSchema = z.object({
  when: conditionExpressionSchema,
  targetType: z.enum(['section', 'step']),
  targetStepId: z.string().uuid().nullish(),
  targetSectionId: z.string().uuid().nullish(),
  action: z.enum(['show', 'hide', 'require', 'make_optional', 'skip_to']),
  order: z.number().int().optional(),
});
const logicRuleUpdateSchema = logicRuleInputSchema.partial();
const logicRuleReorderSchema = z.object({
  rules: z.array(z.object({ id: z.string().uuid(), order: z.number().int() })),
});

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
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid workflow data",
          errors: error.errors
        });
      }
      const { status, message } = classifyRouteError(error, "Failed to create workflow");
      logger.error({ error, userId: (req as AuthRequest).userId }, "Error creating workflow");
      res.status(status).json({
        message,
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
      intakeConfig: IntakeConfigSchema.optional(),
      // Branding keys are validated (safe image URLs, hex colors) because they
      // are rendered onto participant surfaces; `.passthrough()` keeps the
      // other settings keys (completionMessage, redirectUrl, ...) untouched.
      settings: workflowBrandingSettingsSchema
        .extend({ businessDayCalendar: z.enum(BUSINESS_DAY_CALENDARS).optional() })
        .passthrough()
        .optional(),
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
      // A workflow's project is changed only through moveToProject, which
      // requires 'owner' on the workflow AND 'edit' on the target project and
      // keeps ownerType/ownerUuid consistent. Accepting projectId here let an
      // 'edit' collaborator reparent the workflow into an arbitrary project
      // (injecting it into that project's listing) with no target-project check.
      delete updateData.projectId;

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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: ERR_INVALID_INPUT, errors: error.errors });
      }
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- HTTP request data is untyped at this route boundary.
      const { status } = req.body;

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
      if (!['draft', 'active', 'archived'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      if (status === 'active') {
        const lintResults = await workflowLintService.lint(workflowId, userId);
        const errors = lintResults.filter(r => r.type === 'error');
        if (errors.length > 0) {
          return res.status(400).json({ message: `Cannot activate workflow: ${errors.map(e => e.message).join(', ')}` });
        }
      }
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- HTTP request data is untyped at this route boundary.
      const workflow = await workflowService.changeStatus(workflowId, userId, status);
      res.json(workflow);
    } catch (error) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
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
      const intakeConfig = IntakeConfigSchema.parse(req.body);

      const workflow = await workflowService.updateIntakeConfig(workflowId, userId, intakeConfig);
      res.json(workflow);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId }, "Error updating intake config");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: ERR_INVALID_INPUT, errors: error.errors });
      }
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
      logger.error({ error, workflowId: req.params.workflowId, userId: (req as AuthRequest).userId, projectId: req.body.projectId }, "Error moving workflow");

      if (error instanceof z.ZodError) {
        return res.status(400).json({

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
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
  app.get('/api/workflows/:workflowId/logic-rules', optionalHybridAuth, creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;

      if (runAuth != null) {
        if (runAuth.workflowId !== workflowId) {
          return res.status(403).json({ message: "Access denied - run token is for a different workflow" });
        }
      } else if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      } else {
        await workflowService.verifyAccess(workflowId, userId, 'view');
      }

      const logicRules = await logicRuleRepository.findByWorkflowId(workflowId);
      res.json(logicRules);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error fetching workflow logic rules");
      const message = "Failed to fetch workflow logic rules";
      res.status(500).json({ message });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/logic-rules
   * Create a logic rule (LU-6b). `when` is the same ConditionExpression
   * `visibleIf` uses; `conditionStepId` is derived server-side from `when`,
   * never accepted from the client (O-7).
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.post('/api/workflows/:workflowId/logic-rules', hybridAuth, createLimiter, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId } = req.params;
      const data = logicRuleInputSchema.parse(req.body);
      const rule = await logicRuleService.createRule(workflowId, userId, data);
      res.status(201).json(rule);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error creating logic rule");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: ERR_INVALID_INPUT, errors: error.errors });
      }
      const { status, message } = classifyRouteError(error, "Failed to create logic rule");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/logic-rules/reorder
   * Reorder logic rules. Ordering is author-visible: the first firing
   * `skip_to` rule wins, so authors need explicit control over rule order.
   * NOTE: must be registered before the /:ruleId routes below, matching the
   * sections.routes.ts convention, or Express would treat "reorder" as a
   * ruleId.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/logic-rules/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId } = req.params;
      const { rules } = logicRuleReorderSchema.parse(req.body);
      await logicRuleService.reorderRules(workflowId, userId, rules);
      res.status(200).json({ message: "Logic rules reordered successfully" });
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error reordering logic rules");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: ERR_INVALID_INPUT, errors: error.errors });
      }
      const { status, message } = classifyRouteError(error, "Failed to reorder logic rules");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/logic-rules/:ruleId
   * Update a logic rule. Partial updates re-validate (and re-derive
   * conditionStepId from) the full resulting when/target/action combination
   * — see LogicRuleService.updateRule.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/logic-rules/:ruleId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId, ruleId } = req.params;
      const data = logicRuleUpdateSchema.parse(req.body);
      const rule = await logicRuleService.updateRule(ruleId, workflowId, userId, data);
      res.json(rule);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, ruleId: req.params.ruleId }, "Error updating logic rule");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: ERR_INVALID_INPUT, errors: error.errors });
      }
      const { status, message } = classifyRouteError(error, "Failed to update logic rule");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId/logic-rules/:ruleId
   * Delete a logic rule.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.delete('/api/workflows/:workflowId/logic-rules/:ruleId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId, ruleId } = req.params;
      await logicRuleService.deleteRule(ruleId, workflowId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId, ruleId: req.params.ruleId }, "Error deleting logic rule");
      const { status, message } = classifyRouteError(error, "Failed to delete logic rule");
      res.status(status).json({ message });
    }
  }));

  // ===================================================================
  // WORKFLOW ACCESS (ACL) ENDPOINTS
  // ===================================================================

  /**
   * GET /api/workflows/:workflowId/access
   * Get all ACL entries for a workflow
   */
  /**
   * GET /api/workflows/:workflowId/lint
   * Get linting warnings for the workflow
   */
  app.get('/api/workflows/:workflowId/lint', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const issues = await workflowLintService.lint(workflowId, userId);
      res.json(issues);
    } catch (error) {
      const { status, message } = classifyRouteError(error, "Failed to lint workflow");
      logger.error({ error, userId: (req as AuthRequest).userId }, "Error linting workflow");
      res.status(status).json({
        message,
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- HTTP request data is untyped at this route boundary.
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
