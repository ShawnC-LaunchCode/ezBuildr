
import {
    AIGeneratedWorkflowSchema,
    AIWorkflowGenerationRequest,
    AIGeneratedWorkflow,
    DEFAULT_MIN_QUALITY_SCORE,
} from '../../../shared/types/ai';
import { createLogger } from '../../logger';
import { QualityScore, workflowQualityValidator } from '../WorkflowQualityValidator';
import { QualityThresholdError } from './AIError';
import { AIPromptBuilder } from './AIPromptBuilder';
import { AIProviderClient } from './AIProviderClient';
import {
    createAIError,
    normalizeWorkflowTypes,
    validateWorkflowStructure,
} from './AIServiceUtils';
import {
    IterativeQualityImprover,
    QualityImprovementConfig,
    ImprovementResult,
} from './IterativeQualityImprover';

/**
 * Get the minimum quality threshold from various sources
 * Priority: request param > environment variable > default (60)
 */
function getMinQualityThreshold(requestMinScore?: number): number {
    // 1. Request parameter takes highest priority
    if (requestMinScore !== undefined && requestMinScore !== null) {
        return requestMinScore;
    }

    // 2. Environment variable
    const envThreshold = process.env.AI_MIN_QUALITY_SCORE;
    if (envThreshold) {
        const parsed = parseInt(envThreshold, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            return parsed;
        }
    }

    // 3. Default value
    return DEFAULT_MIN_QUALITY_SCORE;
}

const logger = createLogger({ module: 'workflow-generation-service' });

export class WorkflowGenerationService {
    constructor(
        private client: AIProviderClient,
        private promptBuilder: AIPromptBuilder,
    ) { }

    /**
     * Create a service instance with proper config
     */
    static create(client: AIProviderClient, promptBuilder?: AIPromptBuilder): WorkflowGenerationService {
        return new WorkflowGenerationService(client, promptBuilder || new AIPromptBuilder());
    }

    /**
     * Generate a new workflow from a natural language description
     *
     * @param request - The generation request including optional minQualityScore
     * @throws {QualityThresholdError} If generated workflow quality is below threshold
     */
    async generateWorkflow(
        request: AIWorkflowGenerationRequest,
    ): Promise<AIGeneratedWorkflow> {
        const startTime = Date.now();
        const minQualityThreshold = getMinQualityThreshold(request.minQualityScore);

        try {
            const prompt = this.promptBuilder.buildWorkflowGenerationPrompt(request);
            const response = await this.client.callLLM(prompt, 'workflow_generation');

            // Parse and validate the response
            const parsed = JSON.parse(response);
            const validated = AIGeneratedWorkflowSchema.parse(parsed);

            // Validate and Normalize workflow structure
            normalizeWorkflowTypes(validated);
            validateWorkflowStructure(validated);

            // Quality validation
            const qualityScore = workflowQualityValidator.validate(validated);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                sectionsCount: validated.sections.length,
                rulesCount: validated.logicRules.length,
                blocksCount: validated.transformBlocks.length,
                qualityScore: qualityScore.overall,
                qualityBreakdown: qualityScore.breakdown,
                qualityPassed: qualityScore.passed,
                issuesCount: qualityScore.issues.length,
                minQualityThreshold,
            }, 'AI workflow generation succeeded');

            // Check quality threshold - reject if below minimum
            if (qualityScore.overall < minQualityThreshold) {
                logger.warn({
                    qualityScore: qualityScore.overall,
                    threshold: minQualityThreshold,
                    issues: qualityScore.issues.length,
                    duration,
                }, 'AI workflow rejected: quality below threshold');

                throw new QualityThresholdError({
                    qualityScore: qualityScore.overall,
                    threshold: minQualityThreshold,
                    issues: qualityScore.issues,
                    suggestions: qualityScore.suggestions,
                    breakdown: qualityScore.breakdown,
                });
            }

            // Attach quality metadata to response (will be used by routes)
            (validated as any).__qualityScore = qualityScore;

            return validated;
        } catch (error: any) {
            const duration = Date.now() - startTime;

            // Re-throw QualityThresholdError without additional wrapping
            if (error instanceof QualityThresholdError) {
                throw error;
            }

            logger.error({ error, duration }, 'AI workflow generation failed');

            if (error instanceof SyntaxError) {
                throw createAIError(
                    'Failed to parse AI response as JSON',
                    'INVALID_RESPONSE',
                    { originalError: error.message },
                );
            }

            if (error.name === 'ZodError') {
                throw createAIError(
                    'AI response does not match expected schema',
                    'VALIDATION_ERROR',
                    { originalError: error },
                );
            }

            throw error;
        }
    }

    /**
     * Generate a workflow with automatic iterative quality improvement.
     *
     * This method generates an initial workflow, then iteratively refines it
     * until quality targets are met or cost limits are reached.
     *
     * Note: Quality threshold rejection is bypassed in this method because the
     * quality loop will attempt to improve the workflow. After improvement,
     * if the final score is still below the minimum threshold, it will be rejected.
     *
     * @param request - The generation request with description and constraints
     * @param qualityConfig - Optional configuration for quality improvement loop
     * @returns The improved workflow with quality metrics and iteration details
     * @throws {QualityThresholdError} If final workflow quality is still below threshold after improvement
     */
    async generateWorkflowWithQualityLoop(
        request: AIWorkflowGenerationRequest,
        qualityConfig?: Partial<QualityImprovementConfig>,
    ): Promise<{
        workflow: AIGeneratedWorkflow;
        qualityScore: QualityScore;
        improvement: ImprovementResult;
    }> {
        const startTime = Date.now();
        const minQualityThreshold = getMinQualityThreshold(request.minQualityScore);

        logger.info({
            description: request.description?.substring(0, 100),
            qualityConfig,
            minQualityThreshold,
        }, 'Starting workflow generation with quality loop');

        // Step 1: Generate initial workflow (bypass threshold check for quality loop)
        // We temporarily set minQualityScore to 0 to allow the initial generation to pass
        // The quality loop will try to improve it, and we'll check threshold at the end
        const initialRequest = { ...request, minQualityScore: 0 };
        const initialWorkflow = await this.generateWorkflow(initialRequest);
        const initialQualityScore = (initialWorkflow as any).__qualityScore as QualityScore;

        // Clean up internal metadata
        delete (initialWorkflow as any).__qualityScore;

        logger.info({
            initialScore: initialQualityScore.overall,
            passed: initialQualityScore.passed,
            issues: initialQualityScore.issues.length,
            minQualityThreshold,
        }, 'Initial workflow generated, checking if improvement needed');

        // Step 2: Check if improvement is needed
        const targetScore = qualityConfig?.targetQualityScore ?? 80;

        if (initialQualityScore.overall >= targetScore) {
            logger.info({
                score: initialQualityScore.overall,
                target: targetScore,
            }, 'Initial workflow meets quality target, skipping improvement loop');

            // Check minimum threshold before returning
            if (initialQualityScore.overall < minQualityThreshold) {
                logger.warn({
                    qualityScore: initialQualityScore.overall,
                    threshold: minQualityThreshold,
                }, 'Workflow rejected: quality below minimum threshold');

                throw new QualityThresholdError({
                    qualityScore: initialQualityScore.overall,
                    threshold: minQualityThreshold,
                    issues: initialQualityScore.issues,
                    suggestions: initialQualityScore.suggestions,
                    breakdown: initialQualityScore.breakdown,
                });
            }

            return {
                workflow: initialWorkflow,
                qualityScore: initialQualityScore,
                improvement: {
                    finalWorkflow: initialWorkflow,
                    finalQualityScore: initialQualityScore,
                    iterations: [{
                        iteration: 0,
                        qualityScore: initialQualityScore,
                        workflow: initialWorkflow,
                        durationMs: Date.now() - startTime,
                        improvementFromPrevious: 0,
                        estimatedCostCents: 0,
                    }],
                    totalIterations: 0,
                    totalDurationMs: Date.now() - startTime,
                    totalEstimatedCostCents: 0,
                    stoppedReason: 'target_reached',
                    qualityImprovement: 0,
                },
            };
        }

        // Step 3: Run iterative improvement
        const improver = new IterativeQualityImprover(
            this.client,
            this.promptBuilder,
            qualityConfig,
        );

        const improvementResult = await improver.generateWithQualityLoop(
            initialWorkflow,
            request,
            initialQualityScore,
        );

        const totalDuration = Date.now() - startTime;

        logger.info({
            initialScore: initialQualityScore.overall,
            finalScore: improvementResult.finalQualityScore.overall,
            improvement: improvementResult.qualityImprovement,
            iterations: improvementResult.totalIterations,
            stoppedReason: improvementResult.stoppedReason,
            totalDuration,
            totalCost: improvementResult.totalEstimatedCostCents,
            minQualityThreshold,
        }, 'Workflow generation with quality loop completed');

        // Check minimum threshold after improvement loop
        if (improvementResult.finalQualityScore.overall < minQualityThreshold) {
            logger.warn({
                finalScore: improvementResult.finalQualityScore.overall,
                threshold: minQualityThreshold,
                iterations: improvementResult.totalIterations,
            }, 'Workflow rejected after improvement: quality still below minimum threshold');

            throw new QualityThresholdError({
                qualityScore: improvementResult.finalQualityScore.overall,
                threshold: minQualityThreshold,
                issues: improvementResult.finalQualityScore.issues,
                suggestions: improvementResult.finalQualityScore.suggestions,
                breakdown: improvementResult.finalQualityScore.breakdown,
            });
        }

        return {
            workflow: improvementResult.finalWorkflow,
            qualityScore: improvementResult.finalQualityScore,
            improvement: improvementResult,
        };
    }
}

// Singleton export removed - services create their own instances via dependency injection
