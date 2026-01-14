import { AiController } from "../controllers/AiController";
import { createLogger } from "../logger";
import { validateWorkflowSize, aiWorkflowRateLimit } from "../middleware/ai.middleware";
import { hybridAuth } from '../middleware/auth';
import { requireBuilder } from "../middleware/rbac";

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
  app.get('/api/ai/status', hybridAuth, AiController.getStatus);

  /**
   * POST /api/ai/sentiment
   * Quick sentiment analysis for text
   */
  app.post('/api/ai/sentiment', hybridAuth, AiController.analyzeSentiment);

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
    AiController.generateWorkflow
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
    AiController.suggestWorkflowImprovements
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
    AiController.suggestTemplateBindings
  );

  /**
   * POST /api/ai/workflows/revise
   * Iteratively revise a workflow using natural language
   */
  app.post(
    '/api/ai/workflows/revise',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50),
    aiWorkflowRateLimit,
    AiController.reviseWorkflow
  );

  /**
   * GET /api/ai/workflows/revise/:jobId
   * Check status of revision job
   */
  app.get(
    '/api/ai/workflows/revise/:jobId',
    hybridAuth,
    requireBuilder,
    AiController.getRevisionJobStatus
  );

  /**
   * POST /api/ai/suggest-values
   * Generate random plausible values for workflow steps
   */
  app.post(
    '/api/ai/suggest-values',
    hybridAuth,
    aiWorkflowRateLimit,
    AiController.suggestValues
  );

  /**
   * POST /api/ai/workflows/generate-logic
   * Connect workflow nodes with logic rules
   */
  app.post(
    '/api/ai/workflows/generate-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50),
    aiWorkflowRateLimit,
    AiController.generateLogic
  );

  /**
   * POST /api/ai/workflows/debug-logic
   * Analyze logic for issues
   */
  app.post(
    '/api/ai/workflows/debug-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50),
    aiWorkflowRateLimit,
    AiController.debugLogic
  );

  /**
   * POST /api/ai/workflows/visualize-logic
   * Generate graph representation of logic
   */
  app.post(
    '/api/ai/workflows/visualize-logic',
    hybridAuth,
    requireBuilder,
    validateWorkflowSize(50, 50),
    aiWorkflowRateLimit,
    AiController.visualizeLogic
  );

  aiLogger.info('AI workflow generation routes registered');
}
