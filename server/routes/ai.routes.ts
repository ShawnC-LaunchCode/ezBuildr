import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { hybridAuth, requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { geminiService } from "../services/geminiService";
import { logger } from "../logger";
import { createLogger } from "../logger";
import { requireBuilder } from "../middleware/rbac";
import { createAIServiceFromEnv } from "../services/AIService";
import { workflowService } from "../services/WorkflowService";
import { variableService } from "../services/VariableService";
import {
  AIWorkflowGenerationRequestSchema,
  AIWorkflowSuggestionRequestSchema,
  AITemplateBindingsRequestSchema,
  AIWorkflowRevisionRequestSchema,
  AIConnectLogicRequestSchema,
  AIDebugLogicRequestSchema,
  AIVisualizeLogicRequestSchema,
} from "../../shared/types/ai";

const aiLogger = createLogger({ module: 'ai-routes' });

/**
 * Rate limiting for AI workflow generation endpoints
 * These endpoints are expensive and can consume significant API credits
 */
const aiWorkflowRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each user to 10 AI requests per minute
  message: {
    success: false,
    message: 'Too many AI requests, please try again later.',
    error: 'rate_limit_exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID for rate limiting (authenticated requests only)
  keyGenerator: (req: Request) => {
    const authReq = req as AuthRequest;
    return authReq.userId || 'anonymous';
  },
  skipFailedRequests: true,
});

/**
 * Register AI-powered routes for workflows
 * Handles AI workflow generation, suggestions, and template bindings
 *
 * NOTE: Refactored from survey-based to workflow-only (Nov 2025)
 * Survey AI endpoints removed; workflow AI endpoints kept for future use
 */
export function registerAiRoutes(app: Express): void {

  /**
   * GET /api/ai/status
   * Check if AI services are available
   */
  app.get('/api/ai/status', hybridAuth, async (req: Request, res: Response) => {
    try {
      const hasApiKey = !!process.env.GEMINI_API_KEY;

      res.json({
        available: hasApiKey,
        model: hasApiKey ? "gemini-2.5-flash" : null,
        features: hasApiKey ? [
          "workflow_generation",
          "sentiment_analysis",
          "text_summarization"
        ] : []
      });
    } catch (error) {
      res.status(500).json({
        available: false,
        error: "Unable to check AI service status"
      });
    }
  });

  /**
   * POST /api/ai/sentiment
   * Quick sentiment analysis for text
   *
   * Body: { text: string }
   */
  app.post('/api/ai/sentiment', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          message: "AI analysis not available"
        });
      }

      const result = await geminiService.analyzeSentiment(text);

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error({ error }, "[AI] Error analyzing sentiment");
      res.status(500).json({
        message: "Failed to analyze sentiment",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      });
    }
  });

  // ============================================================================
  // AI Workflow Generation Endpoints (Stage 15)
  // ============================================================================

  /**
   * POST /api/ai/workflows/generate
   * Generate a new workflow from a natural language description
   *
   * Rate Limited: 10 requests per minute per user
   * RBAC: builder or owner only
   */
  app.post(
    '/api/ai/workflows/generate',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      try {
        // Validate request body
        const requestData = AIWorkflowGenerationRequestSchema.parse(req.body);

        aiLogger.info({
          userId,
          projectId: requestData.projectId,
          descriptionLength: requestData.description.length,
        }, 'AI workflow generation requested');

        // Create AI service
        const aiService = createAIServiceFromEnv();

        // Generate workflow
        const generatedWorkflow = await aiService.generateWorkflow(requestData);

        const duration = Date.now() - startTime;

        aiLogger.info({
          userId,
          projectId: requestData.projectId,
          duration,
          sectionsCount: generatedWorkflow.sections.length,
          rulesCount: generatedWorkflow.logicRules.length,
          blocksCount: generatedWorkflow.transformBlocks.length,
        }, 'AI workflow generation succeeded');

        res.status(200).json({
          success: true,
          workflow: generatedWorkflow,
          metadata: {
            duration,
            sectionsGenerated: generatedWorkflow.sections.length,
            logicRulesGenerated: generatedWorkflow.logicRules.length,
            transformBlocksGenerated: generatedWorkflow.transformBlocks.length,
          },
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;

        aiLogger.error({
          error,
          userId,
          duration,
        }, 'AI workflow generation failed');

        // Handle specific AI service errors
        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        if (error.code === 'TIMEOUT') {
          return res.status(504).json({
            success: false,
            message: 'AI request timed out. Please try again.',
            error: 'ai_timeout',
          });
        }

        if (error.code === 'VALIDATION_ERROR') {
          return res.status(422).json({
            success: false,
            message: 'AI generated invalid workflow structure.',
            error: 'ai_validation_error',
            details: error.details,
          });
        }

        // Validation error (Zod)
        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        // Generic error
        res.status(500).json({
          success: false,
          message: 'Failed to generate workflow',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/ai/workflows/:id/suggest
   * Suggest improvements to an existing workflow
   *
   * Rate Limited: 10 requests per minute per user
   * RBAC: builder or owner only
   */
  app.post(
    '/api/ai/workflows/:id/suggest',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId!;
      const workflowId = req.params.id;

      try {
        // Validate request body
        const requestData = AIWorkflowSuggestionRequestSchema.parse({
          ...req.body,
          workflowId,
        });

        aiLogger.info({
          userId,
          workflowId,
          descriptionLength: requestData.description.length,
        }, 'AI workflow suggestion requested');

        // Fetch existing workflow
        const workflow = await workflowService.getWorkflowWithDetails(workflowId, userId);
        if (!workflow) {
          return res.status(404).json({
            success: false,
            message: 'Workflow not found',
            error: 'not_found',
          });
        }

        // Create AI service
        const aiService = createAIServiceFromEnv();

        // Generate suggestions
        const suggestions = await aiService.suggestWorkflowImprovements(
          requestData,
          {
            sections: workflow.sections || [],
            logicRules: workflow.logicRules || [],
            transformBlocks: (workflow as any).transformBlocks || [],
          }
        );

        const duration = Date.now() - startTime;

        aiLogger.info({
          userId,
          workflowId,
          duration,
          newSectionsCount: suggestions.newSections.length,
          newRulesCount: suggestions.newLogicRules.length,
          newBlocksCount: suggestions.newTransformBlocks.length,
          modificationsCount: suggestions.modifications.length,
        }, 'AI workflow suggestion succeeded');

        res.status(200).json({
          success: true,
          suggestions,
          metadata: {
            duration,
            newSectionsCount: suggestions.newSections.length,
            newLogicRulesCount: suggestions.newLogicRules.length,
            newTransformBlocksCount: suggestions.newTransformBlocks.length,
            modificationsCount: suggestions.modifications.length,
          },
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;

        aiLogger.error({
          error,
          userId,
          workflowId,
          duration,
        }, 'AI workflow suggestion failed');

        // Handle specific errors (same as generate endpoint)
        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        if (error.code === 'TIMEOUT') {
          return res.status(504).json({
            success: false,
            message: 'AI request timed out. Please try again.',
            error: 'ai_timeout',
          });
        }

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to generate suggestions',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/ai/templates/:templateId/bindings
   * Suggest variable bindings for a template
   *
   * Rate Limited: 10 requests per minute per user
   * RBAC: builder or owner only
   */
  app.post(
    '/api/ai/templates/:templateId/bindings',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId!;
      const templateId = req.params.templateId;

      try {
        // Validate request body
        const requestData = AITemplateBindingsRequestSchema.parse({
          ...req.body,
          templateId,
        });

        aiLogger.info({
          userId,
          templateId,
          workflowId: requestData.workflowId,
        }, 'AI template binding suggestion requested');

        // Get workflow variables
        const variables = await (variableService as any).getWorkflowVariables(
          requestData.workflowId
        );

        // Get template placeholders (from request or fetch from template)
        let placeholders = requestData.placeholders || [];
        if (!placeholders.length && templateId) {
          // TODO: Fetch placeholders from template
          // For now, require placeholders to be provided
          return res.status(400).json({
            success: false,
            message: 'Placeholders must be provided',
            error: 'validation_error',
          });
        }

        // Create AI service
        const aiService = createAIServiceFromEnv();

        // Generate binding suggestions
        const bindingSuggestions = await aiService.suggestTemplateBindings(
          requestData,
          variables,
          placeholders
        );

        const duration = Date.now() - startTime;

        aiLogger.info({
          userId,
          templateId,
          workflowId: requestData.workflowId,
          duration,
          suggestionsCount: bindingSuggestions.suggestions.length,
        }, 'AI template binding suggestion succeeded');

        res.status(200).json({
          success: true,
          bindings: bindingSuggestions,
          metadata: {
            duration,
            suggestionsCount: bindingSuggestions.suggestions.length,
            unmatchedPlaceholdersCount: bindingSuggestions.unmatchedPlaceholders.length,
            unmatchedVariablesCount: bindingSuggestions.unmatchedVariables.length,
          },
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;

        aiLogger.error({
          error,
          userId,
          templateId,
          duration,
        }, 'AI template binding suggestion failed');

        // Handle specific errors
        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        if (error.code === 'TIMEOUT') {
          return res.status(504).json({
            success: false,
            message: 'AI request timed out. Please try again.',
            error: 'ai_timeout',
          });
        }

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to generate binding suggestions',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/ai/workflows/revise
   * Iteratively revise a workflow using natural language
   * 
   * Rate Limited: 10 requests per minute per user
   * RBAC: builder or owner only
   */
  app.post(
    '/api/ai/workflows/revise',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId!;

      try {
        // Validate request body
        const requestData = AIWorkflowRevisionRequestSchema.parse(req.body);

        aiLogger.info({
          userId,
          workflowId: requestData.workflowId,
          instructionLength: requestData.userInstruction.length,
          historyCount: requestData.conversationHistory?.length || 0
        }, 'AI workflow revision requested');

        // Verify ownership/access to the workflow
        await workflowService.verifyAccess(requestData.workflowId, userId, 'edit');

        // Create AI service
        const aiService = createAIServiceFromEnv();

        // Perform revision
        const revisionResult = await aiService.reviseWorkflow(requestData);

        const duration = Date.now() - startTime;

        res.status(200).json({
          success: true,
          ...revisionResult,
          metadata: {
            duration,
            changeCount: revisionResult.diff.changes.length
          }
        });

      } catch (error: any) {
        const duration = Date.now() - startTime;
        aiLogger.error({
          error,
          userId,
          duration
        }, 'AI workflow revision failed');

        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        if (error.code === 'TIMEOUT') {
          return res.status(504).json({
            success: false,
            message: 'AI request timed out. Please try again.',
            error: 'ai_timeout',
          });
        }

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to revise workflow',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/ai/suggest-values
   * Generate random plausible values for workflow steps
   *
   * Body: {
   *   workflowId?: string,  // Optional - for full workflow random data
   *   steps: Array<{ key: string, type: string, label?: string, options?: string[], description?: string }>,
   *   mode?: 'full' | 'partial'  // Default: 'full'
   * }
   */
  app.post(
    '/api/ai/suggest-values',
    hybridAuth,
    requireAuth,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { workflowId, steps, mode = 'full' } = req.body;

        if (!steps || !Array.isArray(steps) || steps.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Steps array is required and must not be empty',
            error: 'invalid_request',
          });
        }

        // Validate AI configuration (GEMINI_API_KEY or AI_API_KEY)
        if (!process.env.GEMINI_API_KEY && !process.env.AI_API_KEY) {
          return res.status(503).json({
            success: false,
            message: 'AI service not configured - please set GEMINI_API_KEY or AI_API_KEY',
            error: 'service_unavailable',
          });
        }

        aiLogger.info({
          workflowId,
          stepCount: steps.length,
          mode,
        }, 'AI value suggestion requested');

        // Create AI service and generate values
        const aiService = createAIServiceFromEnv();
        const values = await aiService.suggestValues(steps, mode);

        res.json({
          success: true,
          data: values,
        });
      } catch (error: any) {
        aiLogger.error({ error }, 'Error generating value suggestions');

        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'Rate limit exceeded. Please try again later.',
            error: 'rate_limit_exceeded',
          });
        }

        if (error.code === 'TIMEOUT') {
          return res.status(504).json({
            success: false,
            message: 'AI request timed out. Please try again.',
            error: 'ai_timeout',
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to generate value suggestions',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/ai/workflows/generate-logic
   * Connect workflow nodes with logic rules
   */
  app.post(
    '/api/ai/workflows/generate-logic',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId!;

      try {
        const requestData = AIConnectLogicRequestSchema.parse(req.body);

        aiLogger.info({
          userId,
          workflowId: requestData.workflowId,
          descriptionLength: requestData.description.length,
        }, 'AI logic generation requested');

        await workflowService.verifyAccess(requestData.workflowId, userId, 'edit');

        const aiService = createAIServiceFromEnv();
        const result = await aiService.generateLogic(requestData);

        const duration = Date.now() - startTime;
        aiLogger.info({
          userId,
          workflowId: requestData.workflowId,
          duration,
          changeCount: result.diff.changes.length
        }, 'AI logic generation succeeded');

        res.status(200).json({
          success: true,
          ...result,
          metadata: {
            duration,
            changeCount: result.diff.changes.length
          }
        });

      } catch (error: any) {
        aiLogger.error({ error }, 'AI logic generation failed');
        // Standard error handling (rate limit, etc) - simplified for now
        res.status(500).json({
          success: false,
          message: 'Failed to generate logic',
          error: 'internal_error'
        });
      }
    }
  );

  /**
   * POST /api/ai/workflows/debug-logic
   * Analyze logic for issues
   */
  app.post(
    '/api/ai/workflows/debug-logic',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      try {
        const requestData = AIDebugLogicRequestSchema.parse(req.body);
        const aiService = createAIServiceFromEnv();
        const result = await aiService.debugLogic(requestData);
        res.status(200).json({ success: true, ...result });
      } catch (error: any) {
        aiLogger.error({ error }, 'AI debug logic failed');
        res.status(500).json({ success: false, message: 'Failed to debug logic' });
      }
    }
  );

  /**
   * POST /api/ai/workflows/visualize-logic
   * Generate graph representation of logic
   */
  app.post(
    '/api/ai/workflows/visualize-logic',
    requireAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      try {
        const requestData = AIVisualizeLogicRequestSchema.parse(req.body);
        const aiService = createAIServiceFromEnv();
        const result = await aiService.visualizeLogic(requestData);
        res.status(200).json({ success: true, ...result });
      } catch (error: any) {
        aiLogger.error({ error }, 'AI visualize logic failed');
        res.status(500).json({ success: false, message: 'Failed to visualize logic' });
      }
    }
  );

  aiLogger.info('AI workflow generation routes registered');
}
