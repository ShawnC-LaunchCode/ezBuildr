import {
    AIConnectLogicResponseSchema,
    AIDebugLogicResponseSchema,
    AIVisualizeLogicResponseSchema,
} from '../../../shared/types/ai';
import { createLogger } from '../../logger';
import { AIPromptBuilder } from './AIPromptBuilder';
import { AIProviderClient } from './AIProviderClient';
import { createAIError } from './AIServiceUtils';

import type {
    AIConnectLogicRequest,
    AIConnectLogicResponse,
    AIDebugLogicRequest,
    AIDebugLogicResponse,
    AIVisualizeLogicRequest,
    AIVisualizeLogicResponse,
} from '../../../shared/types/ai';

const logger = createLogger({ module: 'workflow-logic-service' });

export class WorkflowLogicService {
    private client: AIProviderClient;
    private promptBuilder: AIPromptBuilder;

    constructor(client: AIProviderClient, promptBuilder: AIPromptBuilder) {
        this.client = client;
        this.promptBuilder = promptBuilder;
    }

    /**
     * Generate logic connections based on natural language description
     */
    async generateLogic(
        request: AIConnectLogicRequest,
    ): Promise<AIConnectLogicResponse> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildLogicGenerationPrompt(request);
            const response = await this.client.callLLM(prompt, 'logic_generation');

            const parsed = JSON.parse(response);
            const validated = AIConnectLogicResponseSchema.parse(parsed);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                workflowId: request.workflowId,
                changeCount: validated.diff.changes.length,
            }, 'AI logic generation succeeded');

            return validated;
        } catch (error) {
            if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')) {
                throw createAIError('Invalid AI Response', 'VALIDATION_ERROR', { originalError: error });
            }
            throw error;
        }
    }

    /**
     * Debug logic for contradictions and issues
     */
    async debugLogic(
        request: AIDebugLogicRequest,
    ): Promise<AIDebugLogicResponse> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildLogicDebugPrompt(request);
            const response = await this.client.callLLM(prompt, 'logic_debug');

            const parsed = JSON.parse(response);
            const validated = AIDebugLogicResponseSchema.parse(parsed);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                workflowId: request.workflowId,
                issuesCount: validated.issues.length,
                fixesCount: validated.recommendedFixes.length,
            }, 'AI logic debug succeeded');

            return validated;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI logic debug failed');

            if (error instanceof SyntaxError) {
                throw createAIError(
                    'Failed to parse AI response as JSON',
                    'INVALID_RESPONSE',
                    { originalError: error.message },
                );
            }

            if (error instanceof Error && error.name === 'ZodError') {
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
     * Visualize logic as a graph
     */
    async visualizeLogic(
        request: AIVisualizeLogicRequest,
    ): Promise<AIVisualizeLogicResponse> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildLogicVisualizationPrompt(request);
            const response = await this.client.callLLM(prompt, 'logic_visualization');

            const parsed = JSON.parse(response);
            const validated = AIVisualizeLogicResponseSchema.parse(parsed);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                workflowId: request.workflowId,
                nodesCount: validated.graph.nodes.length,
                edgesCount: validated.graph.edges.length,
            }, 'AI logic visualization succeeded');

            return validated;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI logic visualization failed');

            if (error instanceof SyntaxError) {
                throw createAIError(
                    'Failed to parse AI response as JSON',
                    'INVALID_RESPONSE',
                    { originalError: error.message },
                );
            }

            if (error instanceof Error && error.name === 'ZodError') {
                throw createAIError(
                    'AI response does not match expected schema',
                    'VALIDATION_ERROR',
                    { originalError: error },
                );
            }

            throw error;
        }
    }
}
