import type { Express, Request, Response } from "express";
import { isAdmin } from "../middleware/adminAuth";
import { hybridAuth } from "../middleware/auth";
import { aiSettingsService } from "../services/AiSettingsService";
import { createLogger } from "../logger";
import { db } from "../db";
import { aiWorkflowFeedback } from "../../shared/schema";
import { desc, gte, sql, and, eq } from "drizzle-orm";

const logger = createLogger({ module: 'admin-ai-settings' });

export function registerAdminAiSettingsRoutes(app: Express): void {
    /**
     * GET /api/admin/ai-settings
     * Get global AI settings
     */
    app.get('/api/admin/ai-settings', hybridAuth, isAdmin, async (req: Request, res: Response) => {
        try {
            if (!req.adminUser) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const settings = await aiSettingsService.getGlobalSettings();

            res.json({
                settings: settings || null,
                defaultPrompt: !settings ? await aiSettingsService.getEffectivePrompt({}) : undefined
            });
        } catch (error) {
            logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching AI settings');
            res.status(500).json({ message: "Failed to fetch AI settings" });
        }
    });

    /**
     * PUT /api/admin/ai-settings
     * Update global AI settings
     */
    app.put('/api/admin/ai-settings', hybridAuth, isAdmin, async (req: Request, res: Response) => {
        try {
            if (!req.adminUser) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const { systemPrompt } = req.body;

            if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.length < 10) {
                return res.status(400).json({ message: "Invalid system prompt. Must be a string of at least 10 characters." });
            }

            const updated = await aiSettingsService.updateGlobalSettings(systemPrompt, req.adminUser.id);

            logger.info(
                { adminId: req.adminUser.id, promptLength: systemPrompt.length },
                'Admin updated global AI settings'
            );

            res.json(updated);
        } catch (error) {
            logger.error({ err: error, adminId: req.adminUser!.id }, 'Error updating AI settings');
            res.status(500).json({ message: "Failed to update AI settings" });
        }
    });

    /**
     * GET /api/admin/ai-settings/feedback/stats
     * Get global AI feedback statistics (admin only)
     */
    app.get('/api/admin/ai-settings/feedback/stats', hybridAuth, isAdmin, async (req: Request, res: Response) => {
        try {
            if (!req.adminUser) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const { days = '30', operationType } = req.query;
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

            // Build query conditions
            const conditions = [gte(aiWorkflowFeedback.createdAt, daysAgo)];
            if (operationType && typeof operationType === 'string') {
                conditions.push(eq(aiWorkflowFeedback.operationType, operationType));
            }

            // Get all feedback matching conditions
            const allFeedback = await db
                .select()
                .from(aiWorkflowFeedback)
                .where(and(...conditions))
                .orderBy(desc(aiWorkflowFeedback.createdAt));

            // Calculate statistics
            const totalFeedback = allFeedback.length;
            const avgRating = totalFeedback > 0
                ? allFeedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback
                : 0;

            const avgQualityScore = allFeedback.filter(f => f.qualityScore !== null).length > 0
                ? allFeedback
                    .filter(f => f.qualityScore !== null)
                    .reduce((sum, f) => sum + (f.qualityScore || 0), 0) / allFeedback.filter(f => f.qualityScore !== null).length
                : 0;

            const qualityPassRate = allFeedback.filter(f => f.qualityPassed !== null).length > 0
                ? (allFeedback.filter(f => f.qualityPassed === true).length / allFeedback.filter(f => f.qualityPassed !== null).length) * 100
                : 0;

            const ratingDistribution = {
                5: allFeedback.filter(f => f.rating === 5).length,
                4: allFeedback.filter(f => f.rating === 4).length,
                3: allFeedback.filter(f => f.rating === 3).length,
                2: allFeedback.filter(f => f.rating === 2).length,
                1: allFeedback.filter(f => f.rating === 1).length,
            };

            // Group by operation type
            const byOperationType = allFeedback.reduce((acc, f) => {
                if (!acc[f.operationType]) {
                    acc[f.operationType] = { count: 0, totalRating: 0, totalQualityScore: 0, qualityScoreCount: 0 };
                }
                acc[f.operationType].count++;
                acc[f.operationType].totalRating += f.rating;
                if (f.qualityScore !== null) {
                    acc[f.operationType].totalQualityScore += f.qualityScore;
                    acc[f.operationType].qualityScoreCount++;
                }
                return acc;
            }, {} as Record<string, { count: number; totalRating: number; totalQualityScore: number; qualityScoreCount: number }>);

            // Calculate averages for each operation type
            const operationTypeStats = Object.entries(byOperationType).map(([type, stats]) => ({
                operationType: type,
                count: stats.count,
                avgRating: stats.totalRating / stats.count,
                avgQualityScore: stats.qualityScoreCount > 0 ? stats.totalQualityScore / stats.qualityScoreCount : null,
            }));

            // Group by AI provider
            const byProvider = allFeedback
                .filter(f => f.aiProvider)
                .reduce((acc, f) => {
                    const provider = f.aiProvider!;
                    if (!acc[provider]) {
                        acc[provider] = { count: 0, totalRating: 0, totalQualityScore: 0, qualityScoreCount: 0 };
                    }
                    acc[provider].count++;
                    acc[provider].totalRating += f.rating;
                    if (f.qualityScore !== null) {
                        acc[provider].totalQualityScore += f.qualityScore;
                        acc[provider].qualityScoreCount++;
                    }
                    return acc;
                }, {} as Record<string, { count: number; totalRating: number; totalQualityScore: number; qualityScoreCount: number }>);

            const providerStats = Object.entries(byProvider).map(([provider, stats]) => ({
                provider,
                count: stats.count,
                avgRating: stats.totalRating / stats.count,
                avgQualityScore: stats.qualityScoreCount > 0 ? stats.totalQualityScore / stats.qualityScoreCount : null,
            }));

            // Time series data (daily)
            const dailyStats = allFeedback.reduce((acc, f) => {
                const date = f.createdAt.toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = { date, count: 0, totalRating: 0, totalQualityScore: 0, qualityScoreCount: 0 };
                }
                acc[date].count++;
                acc[date].totalRating += f.rating;
                if (f.qualityScore !== null) {
                    acc[date].totalQualityScore += f.qualityScore;
                    acc[date].qualityScoreCount++;
                }
                return acc;
            }, {} as Record<string, { date: string; count: number; totalRating: number; totalQualityScore: number; qualityScoreCount: number }>);

            const timeSeriesData = Object.values(dailyStats)
                .map(day => ({
                    date: day.date,
                    count: day.count,
                    avgRating: day.totalRating / day.count,
                    avgQualityScore: day.qualityScoreCount > 0 ? day.totalQualityScore / day.qualityScoreCount : null,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            res.json({
                success: true,
                stats: {
                    totalFeedback,
                    avgRating: Math.round(avgRating * 10) / 10,
                    avgQualityScore: Math.round(avgQualityScore * 10) / 10,
                    qualityPassRate: Math.round(qualityPassRate * 10) / 10,
                    ratingDistribution,
                    byOperationType: operationTypeStats,
                    byProvider: providerStats,
                    timeSeries: timeSeriesData,
                    period: `${days} days`,
                },
            });
        } catch (error: any) {
            logger.error({ error }, 'Failed to get admin AI feedback stats');
            res.status(500).json({
                success: false,
                message: 'Failed to get feedback statistics',
            });
        }
    });

    /**
     * GET /api/admin/ai-settings/feedback/recent
     * Get recent AI feedback entries with details (admin only)
     */
    app.get('/api/admin/ai-settings/feedback/recent', hybridAuth, isAdmin, async (req: Request, res: Response) => {
        try {
            if (!req.adminUser) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const { limit = '50', operationType, minRating, maxRating } = req.query;

            // Build query conditions
            const conditions = [];
            if (operationType && typeof operationType === 'string') {
                conditions.push(eq(aiWorkflowFeedback.operationType, operationType));
            }

            const recentFeedback = await db
                .select({
                    id: aiWorkflowFeedback.id,
                    workflowId: aiWorkflowFeedback.workflowId,
                    userId: aiWorkflowFeedback.userId,
                    operationType: aiWorkflowFeedback.operationType,
                    rating: aiWorkflowFeedback.rating,
                    comment: aiWorkflowFeedback.comment,
                    aiProvider: aiWorkflowFeedback.aiProvider,
                    aiModel: aiWorkflowFeedback.aiModel,
                    qualityScore: aiWorkflowFeedback.qualityScore,
                    qualityPassed: aiWorkflowFeedback.qualityPassed,
                    issuesCount: aiWorkflowFeedback.issuesCount,
                    requestDescription: aiWorkflowFeedback.requestDescription,
                    createdAt: aiWorkflowFeedback.createdAt,
                })
                .from(aiWorkflowFeedback)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(aiWorkflowFeedback.createdAt))
                .limit(parseInt(limit as string));

            // Apply rating filters in memory (easier than complex SQL)
            let filtered = recentFeedback;
            if (minRating) {
                filtered = filtered.filter(f => f.rating >= parseInt(minRating as string));
            }
            if (maxRating) {
                filtered = filtered.filter(f => f.rating <= parseInt(maxRating as string));
            }

            res.json({
                success: true,
                feedback: filtered,
            });
        } catch (error: any) {
            logger.error({ error }, 'Failed to get recent AI feedback');
            res.status(500).json({
                success: false,
                message: 'Failed to get recent feedback',
            });
        }
    });
}
