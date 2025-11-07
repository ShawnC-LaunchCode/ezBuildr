import type { Express, Request, Response } from "express";
import { surveyRepository, pageRepository, questionRepository } from "../repositories";
import { createLogger } from "../logger";
import { isAuthenticated } from "../googleAuth";
import { insertQuestionSchema, insertLoopGroupSubquestionSchema, insertConditionalRuleSchema } from "@shared/schema";
import { surveyService } from "../services";

const logger = createLogger({ module: "questions-routes" });

/**
 * Register question-related routes
 * Handles questions, subquestions (loop groups), and conditional logic rules
 */
export function registerQuestionRoutes(app: Express): void {

  // ============================================================================
  // Questions Routes
  // ============================================================================

  /**
   * POST /api/pages/:pageId/questions
   * Create a new question for a page
   */
  app.post('/api/pages/:pageId/questions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const page = await pageRepository.findById(req.params.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const questionData = insertQuestionSchema.parse({ ...req.body, pageId: req.params.pageId });
      const question = await questionRepository.create(questionData);
      res.json(question);
    } catch (error) {
      logger.error({ error }, "Error creating question");
      res.status(500).json({ message: "Failed to create question" });
    }
  });

  /**
   * GET /api/pages/:pageId/questions
   * Get all questions for a page (includes subquestions for loop groups)
   */
  app.get('/api/pages/:pageId/questions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const page = await pageRepository.findById(req.params.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const questions = await questionRepository.findByPageWithSubquestions(req.params.pageId);
      res.json(questions);
    } catch (error) {
      logger.error({ error }, "Error fetching questions");
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  /**
   * PUT /api/questions/:id
   * Update a question
   */
  app.put('/api/questions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      logger.info({ questionId: req.params.id }, '[Question Update] Request received for question');
      logger.info({ body: req.body }, '[Question Update] Request body');

      const question = await questionRepository.findById(req.params.id);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      logger.info({
        id: question.id,
        title: question.title,
        description: question.description,
        type: question.type
      }, '[Question Update] Current question data');

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const updates = insertQuestionSchema.partial().parse(req.body);
      logger.info({ updates }, '[Question Update] Parsed updates');

      const updatedQuestion = await questionRepository.update(req.params.id, updates);

      logger.info({
        id: updatedQuestion.id,
        title: updatedQuestion.title,
        description: updatedQuestion.description,
        type: updatedQuestion.type
      }, '[Question Update] Updated question data');

      res.json(updatedQuestion);
    } catch (error) {
      logger.error({ error }, "Error updating question");
      res.status(500).json({ message: "Failed to update question" });
    }
  });

  /**
   * DELETE /api/questions/:id
   * Delete a question
   */
  app.delete('/api/questions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      logger.info({ questionId: req.params.id }, '[DELETE Question] Attempting to delete question');

      const question = await questionRepository.findById(req.params.id);
      if (!question) {
        logger.info({ questionId: req.params.id }, '[DELETE Question] Question not found');
        return res.status(404).json({ message: "Question not found" });
      }

      logger.info({
        id: question.id,
        title: question.title,
        pageId: question.pageId,
        type: question.type
      }, '[DELETE Question] Found question');

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        logger.info({ pageId: question.pageId }, '[DELETE Question] Page not found');
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      logger.info('[DELETE Question] Authorization passed. Deleting question...');
      await questionRepository.delete(req.params.id);
      logger.info('[DELETE Question] Question deleted successfully');

      res.json({ message: "Question deleted successfully" });
    } catch (error) {
      logger.error({ error }, "[DELETE Question] Error deleting question");
      logger.error({ error: { stack: error instanceof Error ? error.stack : 'No stack trace' } }, "[DELETE Question] Error stack");
      logger.error({ error: {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        detail: (error as any)?.detail,
        constraint: (error as any)?.constraint
      } }, "[DELETE Question] Error details");

      res.status(500).json({
        message: "Failed to delete question",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * PUT /api/surveys/:surveyId/questions/reorder
   * Bulk reorder questions across pages
   */
  app.put('/api/surveys/:surveyId/questions/reorder', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const { questions } = req.body;
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Invalid request: questions array is required" });
      }

      // Validate questions data
      for (const question of questions) {
        if (!question.id || !question.pageId || typeof question.order !== 'number') {
          return res.status(400).json({ message: "Invalid question data: id, pageId, and order are required" });
        }
      }

      const reorderedQuestions = await questionRepository.bulkReorder(req.params.surveyId, questions);
      res.json(reorderedQuestions);
    } catch (error) {
      logger.error({ error }, "Error reordering questions");
      res.status(500).json({ message: "Failed to reorder questions" });
    }
  });

  // ============================================================================
  // Loop Group Subquestions Routes
  // ============================================================================

  /**
   * POST /api/questions/:questionId/subquestions
   * Create a new subquestion for a loop group question
   */
  app.post('/api/questions/:questionId/subquestions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const question = await questionRepository.findById(req.params.questionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      if (question.type !== 'loop_group') {
        return res.status(400).json({ message: "Question is not a loop group" });
      }

      const subquestionData = insertLoopGroupSubquestionSchema.parse({
        ...req.body,
        loopQuestionId: req.params.questionId
      });
      const subquestion = await questionRepository.createSubquestion(subquestionData);
      res.json(subquestion);
    } catch (error) {
      logger.error({ error }, "Error creating subquestion");
      res.status(500).json({ message: "Failed to create subquestion" });
    }
  });

  /**
   * GET /api/questions/:questionId/subquestions
   * Get all subquestions for a loop group question
   */
  app.get('/api/questions/:questionId/subquestions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const question = await questionRepository.findById(req.params.questionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const subquestions = await questionRepository.findSubquestionsByLoopId(req.params.questionId);
      res.json(subquestions);
    } catch (error) {
      logger.error({ error }, "Error fetching subquestions");
      res.status(500).json({ message: "Failed to fetch subquestions" });
    }
  });

  /**
   * PUT /api/subquestions/:id
   * Update a subquestion
   */
  app.put('/api/subquestions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const subquestion = await questionRepository.findSubquestionById(req.params.id);
      if (!subquestion) {
        return res.status(404).json({ message: "Subquestion not found" });
      }

      const question = await questionRepository.findById(subquestion.loopQuestionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const updates = insertLoopGroupSubquestionSchema.partial().parse(req.body);
      const updatedSubquestion = await questionRepository.updateSubquestion(req.params.id, updates);
      res.json(updatedSubquestion);
    } catch (error) {
      logger.error({ error }, "Error updating subquestion");
      res.status(500).json({ message: "Failed to update subquestion" });
    }
  });

  /**
   * DELETE /api/subquestions/:id
   * Delete a subquestion
   */
  app.delete('/api/subquestions/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const subquestion = await questionRepository.findSubquestionById(req.params.id);
      if (!subquestion) {
        return res.status(404).json({ message: "Subquestion not found" });
      }

      const question = await questionRepository.findById(subquestion.loopQuestionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      await questionRepository.deleteSubquestion(req.params.id);
      res.json({ message: "Subquestion deleted successfully" });
    } catch (error) {
      logger.error({ error }, "Error deleting subquestion");
      res.status(500).json({ message: "Failed to delete subquestion" });
    }
  });

  // ============================================================================
  // Conditional Rules Routes
  // ============================================================================

  /**
   * POST /api/surveys/:surveyId/conditional-rules
   * Create a new conditional rule for a survey
   */
  app.post('/api/surveys/:surveyId/conditional-rules', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const ruleData = insertConditionalRuleSchema.parse({ ...req.body, surveyId: req.params.surveyId });
      const rule = await questionRepository.createConditionalRule(ruleData);
      res.json(rule);
    } catch (error) {
      logger.error({ error }, "Error creating conditional rule");
      res.status(500).json({ message: "Failed to create conditional rule" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/conditional-rules
   * Get all conditional rules for a survey
   */
  app.get('/api/surveys/:surveyId/conditional-rules', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const rules = await questionRepository.findConditionalRulesBySurvey(req.params.surveyId);
      res.json(rules);
    } catch (error) {
      logger.error({ error }, "Error fetching conditional rules");
      res.status(500).json({ message: "Failed to fetch conditional rules" });
    }
  });

  /**
   * GET /api/questions/:questionId/conditional-rules
   * Get all conditional rules for a specific question
   */
  app.get('/api/questions/:questionId/conditional-rules', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const question = await questionRepository.findById(req.params.questionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      const page = await pageRepository.findById(question.pageId);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      const survey = await surveyRepository.findById(page.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const rules = await questionRepository.findConditionalRulesByQuestion(req.params.questionId);
      res.json(rules);
    } catch (error) {
      logger.error({ error }, "Error fetching conditional rules");
      res.status(500).json({ message: "Failed to fetch conditional rules" });
    }
  });

  /**
   * PUT /api/conditional-rules/:id
   * Update a conditional rule
   */
  app.put('/api/conditional-rules/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const rule = await questionRepository.findConditionalRuleById(req.params.id);
      if (!rule) {
        return res.status(404).json({ message: "Conditional rule not found" });
      }

      const survey = await surveyRepository.findById(rule.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      const updates = insertConditionalRuleSchema.partial().parse(req.body);
      const updatedRule = await questionRepository.updateConditionalRule(req.params.id, updates);
      res.json(updatedRule);
    } catch (error) {
      logger.error({ error }, "Error updating conditional rule");
      res.status(500).json({ message: "Failed to update conditional rule" });
    }
  });

  /**
   * DELETE /api/conditional-rules/:id
   * Delete a conditional rule
   */
  app.delete('/api/conditional-rules/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const rule = await questionRepository.findConditionalRuleById(req.params.id);
      if (!rule) {
        return res.status(404).json({ message: "Conditional rule not found" });
      }

      const survey = await surveyRepository.findById(rule.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, userId);

      await questionRepository.deleteConditionalRule(req.params.id);
      res.json({ message: "Conditional rule deleted successfully" });
    } catch (error) {
      logger.error({ error }, "Error deleting conditional rule");
      res.status(500).json({ message: "Failed to delete conditional rule" });
    }
  });
}
