import {
    AIWorkflowGenerationRequestSchema,
    AIWorkflowSuggestionRequestSchema,
    AITemplateBindingsRequestSchema,
    AIWorkflowRevisionRequestSchema,
    AIConnectLogicRequestSchema,
    AIDebugLogicRequestSchema,
    AIVisualizeLogicRequestSchema,
} from "../../shared/types/ai";
import { createLogger } from "../logger";
import {
    enqueueAiRevision,
    getAiRevisionJob
} from "../queues/AiRevisionQueue";
import { createAIServiceFromEnv } from "../services/AIService";
import { geminiService } from "../services/geminiService";
import { variableService } from "../services/VariableService";
import { workflowService } from "../services/WorkflowService";

import type { AuthRequest } from "../middleware/auth";
import type { Request, Response } from "express";

const aiLogger = createLogger({ module: 'ai-controller' });

export class AiController {

    /**
     * Check if AI services are available
     */
    static async getStatus(req: Request, res: Response) {
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
    }

    /**
     * Quick sentiment analysis for text
     */
    static async analyzeSentiment(req: Request, res: Response) {
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
            aiLogger.error({ error }, "[AI] Error analyzing sentiment");
            res.status(500).json({
                message: "Failed to analyze sentiment",
                error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
            });
        }
    }

    /**
     * Generate a new workflow from a natural language description
     */
    static async generateWorkflow(req: Request, res: Response) {
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

            AiController.handleAiError(res, error);
        }
    }

    /**
     * Suggest improvements to an existing workflow
     */
    static async suggestWorkflowImprovements(req: Request, res: Response) {
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

            AiController.handleAiError(res, error);
        }
    }

    /**
     * Suggest variable bindings for a template
     */
    static async suggestTemplateBindings(req: Request, res: Response) {
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
            const placeholders = requestData.placeholders || [];
            if ((placeholders.length === 0) && templateId) {
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

            AiController.handleAiError(res, error);
        }
    }

    /**
     * Iteratively revise a workflow using natural language
     */
    static async reviseWorkflow(req: Request, res: Response) {
        const authReq = req as AuthRequest;
        const userId = authReq.userId!;

        try {
            const requestData = AIWorkflowRevisionRequestSchema.parse(req.body);

            aiLogger.info({
                userId,
                workflowId: requestData.workflowId,
            }, 'AI workflow revision job enqueued');

            // Verify ownership first
            await workflowService.verifyAccess(requestData.workflowId, userId, 'edit');

            // Enqueue Job
            const job = await enqueueAiRevision({
                ...requestData,
                userId
            });

            res.status(202).json({
                success: true,
                message: 'AI revision started in background',
                jobId: job.id,
                status: 'pending'
            });

        } catch (error: any) {
            aiLogger.error({ error }, 'Failed to enqueue AI revision job');

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
                message: 'Failed to start revision job',
                error: 'internal_error'
            });
        }
    }

    /**
     * Check status of revision job
     */
    static async getRevisionJobStatus(req: Request, res: Response) {
        try {
            const { jobId } = req.params;
            const job = await getAiRevisionJob(jobId);

            if (!job) {
                return res.status(404).json({
                    success: false,
                    message: 'Job not found',
                    error: 'not_found'
                });
            }

            // Verify user owns this job (job.data.userId === req.userId)
            const authReq = req as AuthRequest;
            if (job.data.userId !== authReq.userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied',
                    error: 'forbidden'
                });
            }

            const state = await job.getState();
            const result = job.returnvalue;
            const error = job.failedReason;

            res.json({
                success: true,
                jobId,
                status: state,
                result: state === 'completed' ? result : undefined,
                error: state === 'failed' ? error : undefined,
                progress: job.progress()
            });

        } catch (error) {
            aiLogger.error({ error }, 'Failed to get job status');
            res.status(500).json({
                success: false,
                message: 'Failed to get status',
                error: 'internal_error'
            });
        }
    }

    /**
     * Generate random plausible values for workflow steps
     */
    static async suggestValues(req: Request, res: Response) {
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
            AiController.handleAiError(res, error);
        }
    }

    /**
     * Connect workflow nodes with logic rules
     */
    static async generateLogic(req: Request, res: Response) {
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
            AiController.handleAiError(res, error);
        }
    }

    /**
     * Analyze logic for issues
     */
    static async debugLogic(req: Request, res: Response) {
        try {
            const requestData = AIDebugLogicRequestSchema.parse(req.body);
            const aiService = createAIServiceFromEnv();
            const result = await aiService.debugLogic(requestData);
            res.status(200).json({ success: true, ...result });
        } catch (error: any) {
            aiLogger.error({ error }, 'AI debug logic failed');
            AiController.handleAiError(res, error);
        }
    }

    /**
     * Generate graph representation of logic
     */
    static async visualizeLogic(req: Request, res: Response) {
        try {
            const requestData = AIVisualizeLogicRequestSchema.parse(req.body);
            const aiService = createAIServiceFromEnv();
            const result = await aiService.visualizeLogic(requestData);
            res.status(200).json({ success: true, ...result });
        } catch (error: any) {
            aiLogger.error({ error }, 'AI visualize logic failed');
            AiController.handleAiError(res, error);
        }
    }

    /**
     * Centralized error handling for AI routes
     */
    private static handleAiError(res: Response, error: any) {
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

        if (error.code === 'VALIDATION_ERROR') {
            return res.status(422).json({
                success: false,
                message: 'AI generated invalid structure.',
                error: 'ai_validation_error',
                details: error.details,
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: 'internal_error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
}
