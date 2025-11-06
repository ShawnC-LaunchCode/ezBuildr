import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { responseService } from "../services";

/**
 * Register response-related routes
 * Handles response creation, answer submission, and response completion
 *
 * Uses responseService for business logic and authorization
 */
export function registerResponseRoutes(app: Express): void {

  // ============================================================================
  // Response Creation Routes
  // ============================================================================

  /**
   * POST /api/surveys/:identifier/responses
   * Create a new anonymous response
   */
  app.post('/api/surveys/:identifier/responses', async (req, res) => {
    try {
      const { identifier } = req.params;
      const { sessionId, timezone, screenResolution } = req.body;

      // Anonymous response
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                       req.socket.remoteAddress ||
                       'unknown';
      const userAgent = req.get('user-agent') || '';
      const finalSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36)}`;

      const clientInfo = {
        ipAddress,
        userAgent,
        sessionId: finalSessionId,
        browserInfo: {
          userAgent,
          language: req.get('accept-language') || 'unknown',
          timezone: timezone || 'unknown'
        },
        deviceInfo: {
          isMobile: /Mobile|Android|iPhone|iPad/i.test(userAgent),
          screenResolution: screenResolution || 'unknown'
        },
        accessInfo: {
          referrer: req.get('referer'),
          entryTime: Date.now()
        }
      };

      const result = await responseService.createAnonymousResponse(identifier, clientInfo);

      return res.status(201).json({
        responseId: result.response.id,
        surveyId: result.response.surveyId,
        sessionId: result.sessionId,
        message: result.message
      });
    } catch (error) {
      console.error("Error creating response:", error);
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("not currently open")) {
          return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("not allowed")) {
          return res.status(403).json({ message: error.message });
        }
        if (error.message.includes("already responded")) {
          return res.status(429).json({
            message: "Response limit reached",
            error: error.message
          });
        }
      }
      res.status(500).json({ message: "Failed to create response" });
    }
  });

  // ============================================================================
  // Answer Submission Routes
  // ============================================================================

  /**
   * POST /api/responses/:responseId/answers
   * Submit or update an answer for a specific question
   */
  app.post('/api/responses/:responseId/answers', async (req, res) => {
    try {
      const { responseId } = req.params;
      const { questionId, subquestionId, loopIndex, value } = req.body;

      if (!questionId || value === undefined) {
        return res.status(400).json({
          message: "questionId and value are required"
        });
      }

      const result = await responseService.submitAnswer(responseId, {
        questionId,
        subquestionId,
        loopIndex,
        value
      });

      res.status(200).json({
        answer: result.answer,
        message: result.message
      });
    } catch (error) {
      console.error("Error submitting answer:", error);
      if (error instanceof Error) {
        if (error.message === "Response not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("completed response")) {
          return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("Survey not found") || error.message.includes("Question not found")) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("does not belong") || error.message.includes("Invalid subquestion")) {
          return res.status(400).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to submit answer" });
    }
  });

  /**
   * PUT /api/responses/:responseId/complete
   * Mark a response as complete with validation
   */
  app.put('/api/responses/:responseId/complete', async (req, res) => {
    try {
      const { responseId } = req.params;

      const result = await responseService.completeResponse(responseId);

      res.status(200).json({
        response: result.response,
        message: result.message
      });
    } catch (error) {
      console.error("Error completing response:", error);
      if (error instanceof Error) {
        if (error.message === "Response not found" || error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("already completed")) {
          return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("Missing required questions")) {
          // Extract missing questions from error message
          const match = error.message.match(/Missing required questions: (.+)$/);
          const missingQuestions = match ? match[1].split(', ') : [];
          return res.status(400).json({
            message: "Missing required questions",
            missingQuestions,
            count: missingQuestions.length
          });
        }
      }
      res.status(500).json({ message: "Failed to complete response" });
    }
  });

  // ============================================================================
  // Response Viewing Routes (Creator Access)
  // ============================================================================

  /**
   * GET /api/surveys/:surveyId/responses
   * List all responses for a survey (creator only)
   */
  app.get('/api/surveys/:surveyId/responses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const responses = await responseService.getResponsesForSurvey(req.params.surveyId, userId);

      res.json(responses);
    } catch (error) {
      console.error("Error fetching responses:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to fetch responses" });
    }
  });

  /**
   * GET /api/responses/:id
   * Get a single response with all answers (creator only)
   */
  app.get('/api/responses/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const result = await responseService.getResponseDetails(req.params.id, userId);

      res.json(result);
    } catch (error) {
      console.error("Error fetching response:", error);
      if (error instanceof Error) {
        if (error.message === "Response not found" || error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to fetch response" });
    }
  });
}
