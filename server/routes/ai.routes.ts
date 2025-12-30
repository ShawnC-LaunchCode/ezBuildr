import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { hybridAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { extendedTimeout } from '../middleware/timeout';
import { geminiService } from "../services/geminiService";
import { logger } from "../logger";
import { createLogger } from "../logger";
import { requireBuilder } from "../middleware/rbac";
import { createAIServiceFromEnv } from "../services/AIService";
import { workflowService } from "../services/WorkflowService";
import { variableService } from "../services/VariableService";
import { sectionService } from "../services/SectionService";
import { stepService } from "../services/StepService";
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
 * Middleware to validate workflow size in request body
 * Prevents memory issues and API overload from huge workflow objects
 */
const validateWorkflowSize = (maxSections = 100, maxStepsPerSection = 100) => {
  return (req: Request, res: Response, next: Function) => {
    try {
      const workflow = req.body.currentWorkflow;

      if (!workflow) {
        // No workflow in body, skip validation
        return next();
      }

      // Check sections count
      if (workflow.sections && workflow.sections.length > maxSections) {
        return res.status(413).json({
          success: false,
          message: `Workflow too large: ${workflow.sections.length} sections (max: ${maxSections})`,
          error: 'workflow_too_large',
          details: {
            sectionsCount: workflow.sections.length,
            maxSections,
            suggestion: 'Consider breaking this workflow into smaller workflows or using fewer sections.',
          },
        });
      }

      // Check steps per section
      if (workflow.sections) {
        for (let i = 0; i < workflow.sections.length; i++) {
          const section = workflow.sections[i];
          if (section.steps && section.steps.length > maxStepsPerSection) {
            return res.status(413).json({
              success: false,
              message: `Section "${section.title || i}" has too many steps: ${section.steps.length} (max: ${maxStepsPerSection})`,
              error: 'section_too_large',
              details: {
                sectionIndex: i,
                sectionTitle: section.title,
                stepsCount: section.steps.length,
                maxStepsPerSection,
                suggestion: 'Split this section into multiple smaller sections.',
              },
            });
          }
        }
      }

      // Check total JSON size (rough estimate)
      const jsonSize = JSON.stringify(workflow).length;
      const maxJsonSize = 5 * 1024 * 1024; // 5MB limit

      if (jsonSize > maxJsonSize) {
        return res.status(413).json({
          success: false,
          message: `Workflow JSON too large: ${(jsonSize / 1024 / 1024).toFixed(2)}MB (max: 5MB)`,
          error: 'payload_too_large',
          details: {
            jsonSizeMB: (jsonSize / 1024 / 1024).toFixed(2),
            maxSizeMB: 5,
            suggestion: 'Reduce the number of sections, steps, or remove unnecessary data.',
          },
        });
      }

      next();
    } catch (error) {
      aiLogger.error({ error }, 'Error validating workflow size');
      next(error);
    }
  };
};

/**
 * Rate limiting for AI workflow generation endpoints
 * These endpoints are expensive and can consume significant API credits
 */
const aiWorkflowRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each user to 100 AI requests per minute
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
        model: hasApiKey ? (process.env.GEMINI_MODEL || "gemini-2.0-flash") : null,
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
    hybridAuth,
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

        // Extract quality score (attached by AIService)
        const qualityScore = (generatedWorkflow as any).__qualityScore;

        res.status(200).json({
          success: true,
          workflow: generatedWorkflow,
          metadata: {
            duration,
            sectionsGenerated: generatedWorkflow.sections.length,
            logicRulesGenerated: generatedWorkflow.logicRules.length,
            transformBlocksGenerated: generatedWorkflow.transformBlocks.length,
          },
          quality: qualityScore ? {
            score: qualityScore.overall,
            breakdown: qualityScore.breakdown,
            passed: qualityScore.passed,
            issues: qualityScore.issues,
            suggestions: qualityScore.suggestions,
          } : undefined,
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
    hybridAuth,
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
    hybridAuth,
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
    extendedTimeout(300000), // 5 minutes for AI processing (large PDFs)
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50), // Limit: 50 sections, 50 steps per section
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const userId = authReq.userId!;

      // FORCE TIMEOUT
      req.setTimeout(600000); // 10 minutes

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

        // AUTO-APPLY: Persist AI changes to database
        aiLogger.info({
          workflowId: requestData.workflowId,
          sectionsCount: revisionResult.updatedWorkflow.sections?.length || 0,
          changesCount: revisionResult.diff.changes.length
        }, 'Applying AI revision to database');

        try {
          // Get existing sections and steps from DB
          const existingWorkflow = await workflowService.getWorkflowWithDetails(requestData.workflowId, userId);
          const existingSectionIds = new Set((existingWorkflow.sections || []).map(s => s.id));
          const existingStepIds = new Set(
            (existingWorkflow.sections || [])
              .flatMap(s => (s.steps || []).map(step => step.id))
          );
          // Build alias -> stepId map to handle AI regenerating steps with same alias but different ID
          const existingStepsByAlias = new Map<string, string>();
          for (const section of (existingWorkflow.sections || [])) {
            for (const step of (section.steps || [])) {
              if (step.alias) {
                existingStepsByAlias.set(step.alias, step.id);
              }
            }
          }

          // Update workflow-level properties if changed
          const aiWorkflow = revisionResult.updatedWorkflow;
          const workflowUpdates: any = {};
          let hasWorkflowUpdates = false;

          if (aiWorkflow.title && aiWorkflow.title !== existingWorkflow.title) {
            workflowUpdates.title = aiWorkflow.title;
            hasWorkflowUpdates = true;
          }
          if (aiWorkflow.description !== undefined && aiWorkflow.description !== existingWorkflow.description) {
            workflowUpdates.description = aiWorkflow.description;
            hasWorkflowUpdates = true;
          }

          if (hasWorkflowUpdates) {
            aiLogger.debug({ workflowId: requestData.workflowId, updates: workflowUpdates }, 'Updating workflow properties');
            await workflowService.updateWorkflow(requestData.workflowId, userId, workflowUpdates);
            aiLogger.info({ workflowId: requestData.workflowId, updates: workflowUpdates }, 'Updated workflow properties');
          }

          const aiSections = revisionResult.updatedWorkflow.sections || [];
          const processedSectionIds = new Set<string>();
          const processedStepIds = new Set<string>();

          // Process each section from AI
          for (const aiSection of aiSections) {
            try {
              const sectionData: any = {
                title: aiSection.title,
                description: aiSection.description || null,
                order: aiSection.order,
              };

              let sectionId: string;

              if (aiSection.id && existingSectionIds.has(aiSection.id)) {
                // Update existing section
                aiLogger.debug({ sectionId: aiSection.id, data: sectionData }, 'Updating section');
                await sectionService.updateSectionById(aiSection.id, userId, sectionData);
                sectionId = aiSection.id;
                aiLogger.debug({ sectionId, title: aiSection.title }, 'Updated section');
              } else {
                // Create new section
                aiLogger.debug({ workflowId: requestData.workflowId, data: sectionData }, 'Creating section');
                const newSection = await sectionService.createSection(requestData.workflowId, userId, sectionData);
                sectionId = newSection.id;
                aiLogger.debug({ sectionId, title: aiSection.title }, 'Created section');
              }

              processedSectionIds.add(sectionId);

              // Process steps for this section
              const aiSteps = aiSection.steps || [];
              for (const aiStep of aiSteps) {
                try {
                  const stepData: any = {
                    type: aiStep.type,
                    title: aiStep.title,
                    description: aiStep.description || null,
                    alias: aiStep.alias || null,
                    required: aiStep.required ?? false,
                    config: aiStep.config || {},
                    order: aiStep.order,
                    visibleIf: aiStep.visibleIf || null,
                    defaultValue: aiStep.defaultValue || null,
                  };

                  // Check if step exists by ID or by alias
                  let existingStepId: string | undefined;
                  if (aiStep.id && existingStepIds.has(aiStep.id)) {
                    existingStepId = aiStep.id;
                  } else if (aiStep.alias && existingStepsByAlias.has(aiStep.alias)) {
                    existingStepId = existingStepsByAlias.get(aiStep.alias);
                  }

                  if (existingStepId) {
                    // Update existing step (matched by ID or alias)
                    aiLogger.debug({ stepId: existingStepId, data: stepData, matchedBy: aiStep.id === existingStepId ? 'id' : 'alias' }, 'Updating step');
                    await stepService.updateStepById(existingStepId, userId, stepData);
                    processedStepIds.add(existingStepId);
                    aiLogger.debug({ stepId: existingStepId, title: aiStep.title, alias: aiStep.alias }, 'Updated step');
                  } else {
                    // Create new step (no ID or alias match)
                    aiLogger.debug({ sectionId, data: stepData }, 'Creating step');
                    const newStep = await stepService.createStepBySectionId(sectionId, userId, stepData);
                    processedStepIds.add(newStep.id);
                    aiLogger.debug({ stepId: newStep.id, title: aiStep.title, alias: aiStep.alias }, 'Created step');
                  }
                } catch (stepError: any) {
                  aiLogger.error({
                    error: {
                      message: stepError.message,
                      stack: stepError.stack,
                    },
                    stepTitle: aiStep.title,
                    stepAlias: aiStep.alias,
                    sectionId,
                  }, 'Failed to process step');
                  throw stepError;
                }
              }
            } catch (sectionError: any) {
              aiLogger.error({
                error: {
                  message: sectionError.message,
                  stack: sectionError.stack,
                },
                sectionTitle: aiSection.title,
              }, 'Failed to process section');
              throw sectionError;
            }
          }

          // Delete sections that are no longer in the AI workflow
          for (const existingSection of (existingWorkflow.sections || [])) {
            if (!processedSectionIds.has(existingSection.id)) {
              await sectionService.deleteSectionById(existingSection.id, userId);
              aiLogger.debug({ sectionId: existingSection.id }, 'Deleted orphaned section');
            }
          }

          // Delete steps that are no longer in the AI workflow
          for (const existingSection of (existingWorkflow.sections || [])) {
            for (const existingStep of (existingSection.steps || [])) {
              if (!processedStepIds.has(existingStep.id)) {
                await stepService.deleteStepById(existingStep.id, userId);
                aiLogger.debug({ stepId: existingStep.id }, 'Deleted orphaned step');
              }
            }
          }

          aiLogger.info({
            workflowId: requestData.workflowId,
            sectionsProcessed: processedSectionIds.size,
            stepsProcessed: processedStepIds.size
          }, 'AI revision applied to database successfully');

        } catch (applyError: any) {
          aiLogger.error({
            error: {
              message: applyError.message,
              stack: applyError.stack,
              name: applyError.name,
              code: applyError.code,
            },
            workflowId: requestData.workflowId,
          }, 'Failed to apply AI revision to database');
          throw new Error(`Failed to persist AI changes: ${applyError.message || applyError}`);
        }

        const duration = Date.now() - startTime;

        if (!res.headersSent) {
          res.status(200).json({
            success: true,
            ...revisionResult,
            metadata: {
              duration,
              changeCount: revisionResult.diff.changes.length,
              applied: true  // Indicate changes were persisted
            }
          });
        }

      } catch (error: any) {
        // Prevent crashing if timeout middleware already sent response
        if (res.headersSent) return;

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

        // Check if response was already sent (e.g., by timeout middleware)
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Failed to revise workflow',
            error: 'internal_error',
            details: process.env.NODE_ENV === 'development' ? (error as any).details || error.message : undefined,
          });
        }
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
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50), // Limit: 50 sections, 50 steps per section
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

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to generate logic',
          error: 'internal_error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50), // Limit: 50 sections, 50 steps per section
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      try {
        const requestData = AIDebugLogicRequestSchema.parse(req.body);
        const aiService = createAIServiceFromEnv();
        const result = await aiService.debugLogic(requestData);
        res.status(200).json({ success: true, ...result });
      } catch (error: any) {
        aiLogger.error({ error }, 'AI debug logic failed');

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

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
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50), // Limit: 50 sections, 50 steps per section
    aiWorkflowRateLimit,
    async (req: Request, res: Response) => {
      try {
        const requestData = AIVisualizeLogicRequestSchema.parse(req.body);
        const aiService = createAIServiceFromEnv();
        const result = await aiService.visualizeLogic(requestData);
        res.status(200).json({ success: true, ...result });
      } catch (error: any) {
        aiLogger.error({ error }, 'AI visualize logic failed');

        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'validation_error',
            details: error.errors,
          });
        }

        if (error.code === 'RATE_LIMIT') {
          return res.status(429).json({
            success: false,
            message: 'AI API rate limit exceeded. Please try again later.',
            error: 'ai_rate_limit',
          });
        }

        res.status(500).json({ success: false, message: 'Failed to visualize logic' });
      }
    }
  );

  aiLogger.info('AI workflow generation routes registered');
}
