import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { isAuthenticated } from "../googleAuth";
import { geminiService } from "../services/geminiService";
import { surveyService } from "../services";
import { SurveyAIService } from "../services/SurveyAIService";
import { logger } from "../logger";
import { createLogger } from "../logger";
import { requireBuilder } from "../middleware/rbac";
import { requireAuth } from "../middleware";
import {
  AIWorkflowGenerationRequestSchema,
  AIWorkflowSuggestionRequestSchema,
  AITemplateBindingsRequestSchema,
} from "../../shared/types/ai";
import { createAIServiceFromEnv } from "../services/AIService";
import { workflowService } from "../services/WorkflowService";
import { variableService } from "../services/VariableService";
import type { AuthRequest } from "../middleware/auth";

// Initialize AI service for survey generation
const surveyAIService = new SurveyAIService();

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
 * Register AI-powered analytics routes
 * Handles AI insights, analysis, and recommendations
 */
export function registerAiRoutes(app: Express): void {

  /**
   * POST /api/ai/generate
   * Generate a new survey using AI based on a topic
   *
   * Body: { topic: string, prompt?: string }
   * Returns: Created survey object (status: draft)
   */
  app.post('/api/ai/generate', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { topic, prompt } = req.body || {};

      // Validate topic
      if (!topic || !String(topic).trim()) {
        return res.status(400).json({ message: "Topic is required" });
      }

      // Check if Gemini API is configured
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          message: "AI survey generation not available",
          error: "GEMINI_API_KEY not configured on server"
        });
      }

      logger.info(`[AI] Generating survey for topic: ${String(topic).substring(0, 100)}`);

      // Generate and create survey
      const survey = await surveyAIService.generateAndCreateSurvey(
        userId,
        String(topic),
        prompt ? String(prompt) : undefined
      );

      logger.info(`[AI] Survey generated successfully: ${survey.id}`);

      return res.status(201).json(survey);

    } catch (error) {
      logger.error({ error }, "[AI] Error generating survey");

      if (error instanceof Error) {
        // Handle specific error cases
        if (error.message.includes("GEMINI_API_KEY")) {
          return res.status(503).json({
            message: "AI service not configured",
            error: error.message
          });
        }

        if (error.message.includes("invalid JSON") || error.message.includes("invalid question type")) {
          return res.status(400).json({
            message: "Failed to generate valid survey",
            error: error.message
          });
        }

        if (error.message.includes("quota") || error.message.includes("RATE_LIMIT")) {
          return res.status(429).json({
            message: "AI service rate limit exceeded",
            error: "Please try again in a few minutes"
          });
        }

        return res.status(500).json({
          message: "Failed to generate survey",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      res.status(500).json({ message: "Failed to generate survey" });
    }
  });

  /**
   * POST /api/ai/analyze-survey/:surveyId
   * Generate AI insights for a survey
   *
   * This endpoint sends survey questions and all responses to Gemini AI
   * for comprehensive analysis and insights.
   *
   * The AI prompt can be customized in: server/config/aiPrompts.ts
   */
  app.post('/api/ai/analyze-survey/:surveyId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { surveyId } = req.params;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ownership (admins can analyze any survey)
      await surveyService.verifyOwnership(surveyId, userId);

      // Check if Gemini API is configured
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          message: "AI analysis not available",
          error: "GEMINI_API_KEY not configured on server"
        });
      }

      logger.info(`[AI] Starting analysis for survey ${surveyId}`);

      // Generate AI insights
      const result = await geminiService.analyzeSurvey(surveyId);

      logger.info(`[AI] Analysis complete for survey ${surveyId}`);
      logger.info(`[AI] Tokens: ${result.metadata.promptTokens} prompt, ${result.metadata.responseTokens} response`);

      res.json({
        success: true,
        insights: result.insights,
        metadata: result.metadata,
      });

    } catch (error) {
      logger.error({ error }, "[AI] Error analyzing survey");

      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: "Survey not found" });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: "Access denied - you do not own this survey" });
        }
        if (error.message.includes("GEMINI_API_KEY")) {
          return res.status(503).json({
            message: "AI service not configured",
            error: error.message
          });
        }

        // API errors from Gemini
        if (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID")) {
          return res.status(503).json({
            message: "AI service misconfigured",
            error: "Invalid API key"
          });
        }

        if (error.message.includes("quota") || error.message.includes("RATE_LIMIT")) {
          return res.status(429).json({
            message: "AI service rate limit exceeded",
            error: "Please try again in a few minutes"
          });
        }

        return res.status(500).json({
          message: "Failed to generate AI insights",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  /**
   * GET /api/ai/status
   * Check if AI services are available
   */
  app.get('/api/ai/status', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const hasApiKey = !!process.env.GEMINI_API_KEY;

      res.json({
        available: hasApiKey,
        model: hasApiKey ? "gemini-2.5-flash" : null,
        features: hasApiKey ? [
          "survey_analysis",
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
  app.post('/api/ai/sentiment', isAuthenticated, async (req: Request, res: Response) => {
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
            transformBlocks: workflow.transformBlocks || [],
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
        const variables = await variableService.getWorkflowVariables(
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

  aiLogger.info('AI workflow generation routes registered');
}
