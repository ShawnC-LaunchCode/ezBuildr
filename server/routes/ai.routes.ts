/* eslint-disable @typescript-eslint/unbound-method -- all AiController methods are static, no `this` binding issues */
import { AiController } from "../controllers/AiController";
import { createLogger } from "../logger";
import { validateWorkflowSize, aiWorkflowRateLimit, aiDailyRateLimit } from "../middleware/ai.middleware";
import { hybridAuth } from '../middleware/auth';
import { requireBuilder } from "../middleware/rbac";
import { asyncHandler } from '../utils/asyncHandler';

import type { Express } from "express";

const aiLogger = createLogger({ module: 'ai-routes' });

/**
 * Register AI-powered routes for workflows
 * Handles AI workflow generation, suggestions, and template bindings
 *
 * NOTE: Refactored to use AiController (Dec 2025)
 */
export function registerAiRoutes(app: Express): void {

  /**
   * GET /api/ai/status
   * Check if AI services are available
   */
  app.get('/api/ai/status', hybridAuth, asyncHandler(AiController.getStatus));

  /**
   * POST /api/ai/sentiment
   * Quick sentiment analysis for text
   */
  app.post('/api/ai/sentiment', hybridAuth, aiWorkflowRateLimit, aiDailyRateLimit, asyncHandler(AiController.analyzeSentiment));

  // ============================================================================
  // AI Workflow Generation Endpoints (Stage 15)
  // ============================================================================

  /**
   * POST /api/ai/workflows/generate
   * Generate a new workflow from a natural language description
   */
  app.post(
    '/api/ai/workflows/generate',
    hybridAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.generateWorkflow)
  );

  /**
   * POST /api/ai/workflows/:id/suggest
   * Suggest improvements to an existing workflow
   */
  app.post(
    '/api/ai/workflows/:id/suggest',
    hybridAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.suggestWorkflowImprovements)
  );

  /**
   * POST /api/ai/templates/:templateId/bindings
   * Suggest variable bindings for a template
   */
  app.post(
    '/api/ai/templates/:templateId/bindings',
    hybridAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.suggestTemplateBindings)
  );

  // Workflow revision lives on the hardened ops pipeline
  // (POST /api/workflows/:workflowId/ai/edit) — see ICW2-10/ICW2-11.

  /**
   * POST /api/ai/suggest-values
   * Generate random plausible values for workflow steps
   */
  app.post(
    '/api/ai/suggest-values',
    hybridAuth,
    requireBuilder,
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.suggestValues)
  );

  /**
   * POST /api/ai/workflows/generate-logic
   * Connect workflow nodes with logic rules
   */
  app.post(
    '/api/ai/workflows/generate-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(),
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.generateLogic)
  );

  /**
   * POST /api/ai/workflows/debug-logic
   * Analyze logic for issues
   */
  app.post(
    '/api/ai/workflows/debug-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(),
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.debugLogic)
  );

  /**
   * POST /api/ai/workflows/visualize-logic
   * Generate graph representation of logic
   */
  app.post(
    '/api/ai/workflows/visualize-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(),
    aiWorkflowRateLimit,
    aiDailyRateLimit,
    asyncHandler(AiController.visualizeLogic)
  );

  aiLogger.info('AI workflow generation routes registered');
}
/* eslint-enable @typescript-eslint/unbound-method */
