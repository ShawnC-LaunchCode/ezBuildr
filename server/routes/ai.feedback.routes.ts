import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { db } from "../db";
import { aiWorkflowFeedback } from "../../shared/schema";
import { createLogger } from "../logger";
import { eq, desc, and, gte } from "drizzle-orm";

const logger = createLogger({ module: 'ai-feedback-routes' });

// Validation schema for feedback submission
const AiFeedbackSchema = z.object({
  workflowId: z.string().uuid().optional(),
  operationType: z.enum(['generation', 'revision', 'suggestion', 'logic', 'optimization']),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  qualityScore: z.number().int().min(0).max(100).optional(),
  qualityPassed: z.boolean().optional(),
  issuesCount: z.number().int().min(0).optional(),
  requestDescription: z.string().optional(),
  generatedSections: z.number().int().min(0).optional(),
  generatedSteps: z.number().int().min(0).optional(),
});

/**
 * Register AI feedback routes
 */
export function registerAiFeedbackRoutes(app: Express): void {
  /**
   * POST /api/ai/feedback
   * Submit feedback on AI-generated workflow
   */
  app.post(
    '/api/ai/feedback',
    hybridAuth,
    async (req: Request, res: Response) => {
      try {
        const authReq = req as AuthRequest;
        const userId = authReq.userId;

        // Validate request
        const feedbackData = AiFeedbackSchema.parse(req.body);

        // Insert feedback
        const [feedback] = await db
          .insert(aiWorkflowFeedback)
          .values({
            userId,
            workflowId: feedbackData.workflowId || null,
            operationType: feedbackData.operationType,
            rating: feedbackData.rating,
            comment: feedbackData.comment || null,
            aiProvider: feedbackData.aiProvider || null,
            aiModel: feedbackData.aiModel || null,
            qualityScore: feedbackData.qualityScore || null,
            qualityPassed: feedbackData.qualityPassed || null,
            issuesCount: feedbackData.issuesCount || null,
            requestDescription: feedbackData.requestDescription || null,
            generatedSections: feedbackData.generatedSections || null,
            generatedSteps: feedbackData.generatedSteps || null,
          })
          .returning();

        logger.info({
          userId,
          feedbackId: feedback.id,
          rating: feedbackData.rating,
          operationType: feedbackData.operationType,
        }, 'AI feedback submitted');

        res.status(201).json({
          success: true,
          feedback: {
            id: feedback.id,
            rating: feedback.rating,
            createdAt: feedback.createdAt,
          },
        });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return res.status(400).json({
            success: false,
            message: 'Invalid feedback data',
            errors: error.errors,
          });
        }

        logger.error({ error }, 'Failed to submit AI feedback');
        res.status(500).json({
          success: false,
          message: 'Failed to submit feedback',
        });
      }
    }
  );

  /**
   * GET /api/ai/feedback/stats
   * Get aggregated feedback statistics (admin only)
   */
  app.get(
    '/api/ai/feedback/stats',
    hybridAuth,
    async (req: Request, res: Response) => {
      try {
        const authReq = req as AuthRequest;
        const userId = authReq.userId;

        // Get recent feedback (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentFeedback = await db
          .select()
          .from(aiWorkflowFeedback)
          .where(
            and(
              eq(aiWorkflowFeedback.userId, userId!),
              gte(aiWorkflowFeedback.createdAt, thirtyDaysAgo)
            )
          )
          .orderBy(desc(aiWorkflowFeedback.createdAt))
          .limit(100);

        // Calculate statistics
        const totalFeedback = recentFeedback.length;
        const avgRating = totalFeedback > 0
          ? recentFeedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback
          : 0;

        const ratingDistribution = {
          5: recentFeedback.filter(f => f.rating === 5).length,
          4: recentFeedback.filter(f => f.rating === 4).length,
          3: recentFeedback.filter(f => f.rating === 3).length,
          2: recentFeedback.filter(f => f.rating === 2).length,
          1: recentFeedback.filter(f => f.rating === 1).length,
        };

        const byOperationType = recentFeedback.reduce((acc, f) => {
          if (!acc[f.operationType]) {
            acc[f.operationType] = { count: 0, avgRating: 0, ratings: [] };
          }
          acc[f.operationType].count++;
          acc[f.operationType].ratings.push(f.rating);
          return acc;
        }, {} as Record<string, { count: number; avgRating: number; ratings: number[] }>);

        // Calculate averages
        Object.keys(byOperationType).forEach(key => {
          const data = byOperationType[key];
          data.avgRating = data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length;
          delete (data as any).ratings; // Remove raw ratings from response
        });

        res.json({
          success: true,
          stats: {
            totalFeedback,
            avgRating: Math.round(avgRating * 10) / 10,
            ratingDistribution,
            byOperationType,
            period: '30 days',
          },
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to get AI feedback stats');
        res.status(500).json({
          success: false,
          message: 'Failed to get feedback statistics',
        });
      }
    }
  );
}
