
import {
    AIWorkflowSuggestionSchema,
    AITemplateBindingsResponseSchema,
    AIWorkflowSuggestionRequest,
    AIWorkflowSuggestion,
    AITemplateBindingsRequest,
    AITemplateBindingsResponse,
    AIBindingSuggestion,
} from '../../../shared/types/ai';
import { createLogger } from '../../logger';
import { AliasResolver, WorkflowWithAliases } from '../AliasResolver';

import { AIPromptBuilder } from './AIPromptBuilder';
import { AIProviderClient } from './AIProviderClient';
import { createAIError } from './AIServiceUtils';

const logger = createLogger({ module: 'workflow-suggestion-service' });

export class WorkflowSuggestionService {
    constructor(
        private client: AIProviderClient,
        private promptBuilder: AIPromptBuilder,
    ) { }

    /**
     * Suggest improvements to an existing workflow
     */
    async suggestWorkflowImprovements(
        request: AIWorkflowSuggestionRequest,
        existingWorkflow: {
            sections: any[];
            logicRules?: any[];
            transformBlocks?: any[];
        },
    ): Promise<AIWorkflowSuggestion> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildWorkflowSuggestionPrompt(
                request,
                existingWorkflow,
            );
            const response = await this.client.callLLM(prompt, 'workflow_suggestion');

            const parsed = JSON.parse(response);
            const validated = AIWorkflowSuggestionSchema.parse(parsed);

            const duration = Date.now() - startTime;
            logger.info(
                {
                    duration,
                    newSectionsCount: validated.newSections.length,
                    newRulesCount: validated.newLogicRules.length,
                    newBlocksCount: validated.newTransformBlocks.length,
                    modificationsCount: validated.modifications.length,
                },
                'AI workflow suggestion succeeded',
            );

            return validated;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI workflow suggestion failed');

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
     * Suggest template variable bindings
     * @param request - The binding request containing workflow and template IDs
     * @param variables - Available workflow variables with their aliases
     * @param placeholders - Template placeholders to match
     * @param workflow - Optional workflow structure for alias validation
     */
    async suggestTemplateBindings(
        request: AITemplateBindingsRequest,
        variables: Array<{ alias: string; label: string; type: string }>,
        placeholders: string[],
        workflow?: WorkflowWithAliases,
    ): Promise<AITemplateBindingsResponse> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildBindingSuggestionPrompt(
                variables,
                placeholders,
            );
            const response = await this.client.callLLM(prompt, 'binding_suggestion');

            const parsed = JSON.parse(response);
            const validated = AITemplateBindingsResponseSchema.parse(parsed);

            // Validate suggested aliases against the workflow if provided
            const { validSuggestions, warnings } = this.validateBindingSuggestions(
                validated.suggestions,
                variables,
                workflow,
            );

            const result: AITemplateBindingsResponse = {
                ...validated,
                suggestions: validSuggestions,
                warnings: [...(validated.warnings || []), ...warnings],
            };

            const duration = Date.now() - startTime;
            logger.info(
                {
                    duration,
                    suggestionsCount: result.suggestions.length,
                    filteredCount: validated.suggestions.length - validSuggestions.length,
                    warningsCount: warnings.length,
                },
                'AI binding suggestion succeeded',
            );

            return result;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI binding suggestion failed');

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
     * Validate binding suggestions against available variables and workflow aliases
     */
    private validateBindingSuggestions(
        suggestions: AIBindingSuggestion[],
        variables: Array<{ alias: string; label: string; type: string }>,
        workflow?: WorkflowWithAliases,
    ): { validSuggestions: AIBindingSuggestion[]; warnings: string[] } {
        const validSuggestions: AIBindingSuggestion[] = [];
        const warnings: string[] = [];

        // Build a set of valid aliases from the provided variables
        const validAliases = new Set(variables.map(v => v.alias.toLowerCase()));

        // If workflow is provided, also use AliasResolver for comprehensive validation
        let resolver: AliasResolver | undefined;
        if (workflow) {
            resolver = AliasResolver.fromWorkflow(workflow);
        }

        for (const suggestion of suggestions) {
            const suggestedAlias = suggestion.variable;
            const normalizedAlias = suggestedAlias.toLowerCase();

            // Check if the alias exists in the provided variables
            const existsInVariables = validAliases.has(normalizedAlias);

            // If workflow provided, also check via AliasResolver
            const existsInWorkflow = resolver ? resolver.has(suggestedAlias) : true;

            if (existsInVariables && existsInWorkflow) {
                validSuggestions.push(suggestion);
            } else {
                // Find similar aliases for helpful warning message
                let similarAliases: string[] = [];
                if (resolver) {
                    const allAliases = resolver.getAllAliases();
                    similarAliases = allAliases
                        .filter(alias => {
                            const aliasLower = alias.toLowerCase();
                            return aliasLower.includes(normalizedAlias) ||
                                   normalizedAlias.includes(aliasLower);
                        })
                        .slice(0, 3);
                }

                const suggestionText = similarAliases.length > 0
                    ? ` Similar aliases: ${similarAliases.join(', ')}`
                    : '';

                warnings.push(
                    `Filtered binding for placeholder "${suggestion.placeholder}": ` +
                    `alias "${suggestedAlias}" does not exist in workflow.${suggestionText}`
                );

                logger.warn(
                    {
                        placeholder: suggestion.placeholder,
                        suggestedAlias,
                        similarAliases,
                    },
                    'Filtered invalid binding suggestion - alias not found',
                );
            }
        }

        return { validSuggestions, warnings };
    }

    /**
     * Suggest random plausible values for workflow steps
     * Used for testing and preview data generation
     */
    async suggestValues(
        steps: Array<{
            key: string;
            type: string;
            label?: string;
            options?: string[];
            description?: string;
        }>,
        mode: 'full' | 'partial' = 'full',
    ): Promise<Record<string, any>> {
        const startTime = Date.now();

        try {
            const prompt = this.promptBuilder.buildValueSuggestionPrompt(steps, mode);
            const response = await this.client.callLLM(prompt, 'value_suggestion');

            // Parse and return the response
            const parsed = JSON.parse(response);

            const duration = Date.now() - startTime;
            logger.info(
                {
                    duration,
                    stepCount: steps.length,
                    mode,
                },
                'AI value suggestion succeeded',
            );

            return parsed.values || parsed;
        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI value suggestion failed');

            if (error instanceof SyntaxError) {
                throw createAIError(
                    'Failed to parse AI response as JSON',
                    'INVALID_RESPONSE',
                    { originalError: error.message },
                );
            }

            throw error;
        }
    }
}

// Singleton export removed - services create their own instances via dependency injection
