import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { geminiService } from "../services/geminiService";
import { surveyService } from "../services";
import { SurveyAIService } from "../services/SurveyAIService";
import { logger } from "../logger";

// Initialize AI service for survey generation
const surveyAIService = new SurveyAIService();

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
}
