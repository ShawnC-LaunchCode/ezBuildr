import {
    AIWorkflowRevisionResponseSchema,
} from '../../../shared/types/ai';
import { createLogger } from '../../logger';
import { AIPromptBuilder } from './AIPromptBuilder';
import { AIProviderClient } from './AIProviderClient';
import {
    createAIError,
    estimateTokenCount,
    isResponseTruncated,
    validateWorkflowStructure
} from './AIServiceUtils';

import type {
    AIWorkflowRevisionRequest,
    AIWorkflowRevisionResponse,
} from '../../../shared/types/ai';

const logger = createLogger({ module: 'workflow-revision-service' });

export class WorkflowRevisionService {
    private client: AIProviderClient;
    private promptBuilder: AIPromptBuilder;

    constructor(client: AIProviderClient, promptBuilder: AIPromptBuilder) {
        this.client = client;
        this.promptBuilder = promptBuilder;
    }

    /**
     * Revise an existing workflow based on user instructions
     * Automatically chunks large workflows to avoid token limits
     *
     * Enhanced with automatic retry logic:
     * - Tries single-shot first for speed
     * - Detects truncation and automatically retries with chunking
     * - Handles workflows up to 10x larger than before
     */
    async reviseWorkflow(
        request: AIWorkflowRevisionRequest,
    ): Promise<AIWorkflowRevisionResponse> {
        const startTime = Date.now();

        try {
            // Estimate token count of the full workflow
            const workflowJson = JSON.stringify(request.currentWorkflow);
            const estimatedInputTokens = estimateTokenCount(workflowJson);
            const sectionCount = request.currentWorkflow.sections?.length || 0;

            // Estimate output size based on input
            // Large workflows typically generate 1.5-2x tokens in output
            const estimatedOutputTokens = estimatedInputTokens * 2;

            // Token threshold for chunking (leave headroom for prompt + response)
            // INPUT threshold: If workflow itself is > 2500 tokens, chunk proactively
            // OUTPUT threshold: If estimated output > 6000 tokens, chunk proactively
            const INPUT_CHUNK_THRESHOLD = 2500;
            const OUTPUT_CHUNK_THRESHOLD = 6000;

            const shouldChunkProactively =
                estimatedInputTokens > INPUT_CHUNK_THRESHOLD ||
                estimatedOutputTokens > OUTPUT_CHUNK_THRESHOLD ||
                sectionCount > 15;  // More than 15 sections = chunk

            logger.debug({
                estimatedInputTokens,
                estimatedOutputTokens,
                sectionCount,
                shouldChunkProactively,
                inputThreshold: INPUT_CHUNK_THRESHOLD,
                outputThreshold: OUTPUT_CHUNK_THRESHOLD,
            }, 'Workflow revision token estimation');

            // If workflow is large enough to warrant chunking, use chunked revision immediately
            if (shouldChunkProactively) {
                logger.info({
                    estimatedInputTokens,
                    estimatedOutputTokens,
                    sectionCount,
                    reason: estimatedInputTokens > INPUT_CHUNK_THRESHOLD ? 'large_input' :
                        estimatedOutputTokens > OUTPUT_CHUNK_THRESHOLD ? 'large_output' :
                            'many_sections',
                }, 'Workflow large enough to warrant chunking - using chunked revision');

                return await this.reviseWorkflowChunked(request);
            }

            // Otherwise, try single-shot first (faster)
            try {
                logger.info({
                    estimatedInputTokens,
                    estimatedOutputTokens,
                    sectionCount,
                }, 'Attempting single-shot workflow revision');

                return await this.reviseWorkflowSingleShot(request);

            } catch (singleShotError: any) {
                // If single-shot fails due to truncation, automatically retry with chunking
                if (singleShotError.code === 'RESPONSE_TRUNCATED') {
                    logger.warn({
                        estimatedInputTokens,
                        estimatedOutputTokens,
                        actualOutputTokens: singleShotError.estimatedTokens,
                        responseLength: singleShotError.responseLength,
                    }, 'Single-shot revision truncated - automatically retrying with chunking');

                    return await this.reviseWorkflowChunked(request);
                }

                // For other errors, re-throw
                throw singleShotError;
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({ duration, error }, 'AI workflow revision failed');
            throw error;
        }
    }

    /**
     * Single-shot workflow revision (original implementation)
     */
    private async reviseWorkflowSingleShot(
        request: AIWorkflowRevisionRequest,
    ): Promise<AIWorkflowRevisionResponse> {
        const startTime = Date.now();

        try {
            const prompt = this.buildWorkflowRevisionPrompt(request);
            const response = await this.client.callLLM(prompt, 'workflow_revision');

            // FIRST: Check for truncation BEFORE attempting to parse
            if (isResponseTruncated(response)) {
                const estimatedTokens = estimateTokenCount(response);
                logger.error({
                    responseLength: response.length,
                    estimatedTokens,
                    responseSuffix: response.substring(Math.max(0, response.length - 500)),
                }, 'Detected truncated AI response - workflow too large for single-shot revision');

                // Throw specific error that will trigger chunking retry
                const error: any = new Error('Response truncated - workflow too large');
                error.code = 'RESPONSE_TRUNCATED';
                error.estimatedTokens = estimatedTokens;
                error.responseLength = response.length;
                throw error;
            }

            // Parse and validate
            let parsed;
            try {
                parsed = JSON.parse(response);
            } catch (parseError: any) {
                // Extract position info from error
                const positionMatch = parseError.message.match(/position (\d+)/);
                const position = positionMatch ? parseInt(positionMatch[1]) : 0;

                // Get context around the error position
                const contextStart = Math.max(0, position - 200);
                const contextEnd = Math.min(response.length, position + 200);
                const errorContext = response.substring(contextStart, contextEnd);

                // Log the actual response for debugging
                logger.error({
                    parseError: parseError.message,
                    responseLength: response.length,
                    responsePreview: response.substring(0, 500),
                    responseSuffix: response.substring(Math.max(0, response.length - 500)),
                    errorPosition: position,
                    errorContext: errorContext,
                    errorContextStart: contextStart,
                }, 'Failed to parse AI response as JSON');

                // Write full response to file for debugging
                const fs = await import('fs');
                const path = await import('path');
                const debugPath = path.join(process.cwd(), 'logs', `ai-response-error-${Date.now()}.json`);
                try {
                    if (!fs.existsSync(path.dirname(debugPath))) {
                        await fs.promises.mkdir(path.dirname(debugPath), { recursive: true });
                    }
                    await fs.promises.writeFile(debugPath, response);
                    logger.error({ debugPath }, 'Full AI response written to file for debugging');
                } catch (fsError) {
                    logger.error({ fsError }, 'Failed to write debug file');
                }

                // Re-throw parse error (truncation should have been caught above)
                throw parseError;
            }
            const validated = AIWorkflowRevisionResponseSchema.parse(parsed);

            // Validate structure of generated workflow
            validateWorkflowStructure(validated.updatedWorkflow);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                workflowId: request.workflowId,
                changeCount: validated.diff.changes.length,
            }, 'AI workflow revision succeeded');

            return validated;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({ error, duration }, 'AI workflow revision failed');

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
     * Chunked workflow revision for large workflows
     * Breaks workflow into section groups and processes them independently
     *
     * Enhanced chunking strategy:
     * - Dynamically calculates chunk size based on output token limits
     * - Handles workflows 10x larger than before
     * - Better progress tracking and error recovery
     * - Special handling for single massive sections
     */
    private async reviseWorkflowChunked(
        request: AIWorkflowRevisionRequest,
        skipTwoPassStrategy = false,  // Prevent infinite recursion
    ): Promise<AIWorkflowRevisionResponse> {
        const startTime = Date.now();
        const workflow = request.currentWorkflow;
        const sections = workflow.sections || [];

        if (sections.length === 0) {
            // No sections to chunk, fall back to single shot
            return this.reviseWorkflowSingleShot(request);
        }

        // EDGE CASE: Single massive section that's too large
        // Chunking by sections won't help - need different strategy
        if (sections.length === 1 && !skipTwoPassStrategy) {
            // Check BOTH the current section size AND the instruction size
            // (instruction often contains the document content)
            const singleSectionSize = estimateTokenCount(JSON.stringify(sections[0]));
            const instructionSize = estimateTokenCount(request.userInstruction);

            // Use the larger of the two to estimate output
            const largerInputSize = Math.max(singleSectionSize, instructionSize);
            const estimatedOutputSize = largerInputSize * 2;

            if (estimatedOutputSize > 6000) {
                logger.warn({
                    sectionSize: singleSectionSize,
                    instructionSize,
                    largerInputSize,
                    estimatedOutputSize,
                }, 'Single section with large content - using two-pass revision strategy');

                // Strategy: Ask AI to create a simplified structure first, then fill details
                return this.reviseWorkflowInPasses(request);
            }
        }

        logger.info({
            totalSections: sections.length,
            instruction: request.userInstruction,
        }, 'Starting chunked workflow revision');

        // Determine optimal chunk size
        // Calculate average section size in tokens
        const totalWorkflowSize = estimateTokenCount(JSON.stringify(workflow));
        const avgSectionInputTokens = Math.ceil(totalWorkflowSize / sections.length);

        // Check if sections are mostly empty (e.g., from Pass 1 of two-pass strategy)
        const hasEmptySections = sections.every(s => !s.steps || s.steps.length === 0);

        // Estimate output tokens per section
        let avgSectionOutputTokens;
        let maxSectionsPerChunk = 10;  // Default for normal sections

        if (hasEmptySections && request.userInstruction) {
            // Empty sections being filled from large instruction (like PDF content)
            // CRITICAL: Each section needs to reference the FULL instruction
            // Real-world data shows ~2600 tokens output per section for 4500-token instruction
            // Use multiplier of 6x instead of 2x
            const instructionSize = estimateTokenCount(request.userInstruction);
            avgSectionOutputTokens = Math.max(
                avgSectionInputTokens * 2,
                Math.ceil(instructionSize / sections.length) * 6  // 6x multiplier for empty sections
            );

            // AGGRESSIVE CAPS based on instruction size
            if (instructionSize > 5000) {
                maxSectionsPerChunk = 1;  // Very large instruction = 1 section per chunk
            } else if (instructionSize > 3000) {
                maxSectionsPerChunk = 2;  // Large instruction = 2 sections per chunk
            } else {
                maxSectionsPerChunk = 3;  // Medium instruction = 3 sections per chunk
            }
        } else {
            // Normal case: sections already have content
            avgSectionOutputTokens = avgSectionInputTokens * 2;
        }

        // Maximum output tokens per chunk (leave 20% headroom from 8K limit)
        const MAX_OUTPUT_TOKENS_PER_CHUNK = 6400;  // 80% of 8K

        // Calculate how many sections fit in one chunk
        const sectionsPerChunk = Math.max(1, Math.floor(MAX_OUTPUT_TOKENS_PER_CHUNK / avgSectionOutputTokens));

        // Apply the cap
        const finalSectionsPerChunk = Math.min(sectionsPerChunk, maxSectionsPerChunk);

        const instructionSize = hasEmptySections && request.userInstruction
            ? estimateTokenCount(request.userInstruction)
            : 0;

        logger.info({
            totalSections: sections.length,
            hasEmptySections,
            instructionSize,
            avgSectionInputTokens,
            avgSectionOutputTokens,
            sectionsPerChunk: finalSectionsPerChunk,
            maxSectionsPerChunk,
            estimatedChunks: Math.ceil(sections.length / finalSectionsPerChunk),
        }, 'Calculated optimal chunk size');

        // Create section chunks
        const chunks: typeof sections[] = [];
        for (let i = 0; i < sections.length; i += finalSectionsPerChunk) {
            chunks.push(sections.slice(i, i + finalSectionsPerChunk));
        }

        logger.info({
            totalSections: sections.length,
            chunksCount: chunks.length,
            sectionsPerChunk: finalSectionsPerChunk,
            avgSectionInputTokens,
            avgSectionOutputTokens,
        }, 'Workflow chunked for processing');

        // Process chunks sequentially (to maintain context and order)
        // We could do parallel, but sequential gives better context awareness
        const revisedSections: typeof sections = [];
        const allChanges: any[] = [];
        const allExplanations: string[] = [];
        const allSuggestions: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkNumber = i + 1;

            logger.info({
                chunkNumber,
                totalChunks: chunks.length,
                sectionCount: chunk.length,
                sectionTitles: chunk.map(s => s.title),
            }, `Processing chunk ${chunkNumber}/${chunks.length}`);

            try {
                // Create a mini-workflow with just this chunk
                const chunkWorkflow = {
                    ...workflow,
                    sections: chunk,
                };

                // Create chunk-specific request with context about other chunks
                const chunkRequest: AIWorkflowRevisionRequest = {
                    ...request,
                    currentWorkflow: chunkWorkflow,
                    userInstruction: `${request.userInstruction}

IMPORTANT CONTEXT: You are processing sections ${chunk[0].order + 1}-${chunk[chunk.length - 1].order + 1} out of ${sections.length} total sections in this workflow. Focus your revisions on these sections only. Other sections will be processed separately.

Section titles in this chunk: ${chunk.map(s => s.title).join(', ')}`,
                };

                const chunkResult = await this.reviseWorkflowSingleShot(chunkRequest);

                // Collect revised sections
                if (chunkResult.updatedWorkflow.sections) {
                    revisedSections.push(...chunkResult.updatedWorkflow.sections);
                }

                // Collect changes and metadata
                allChanges.push(...(chunkResult.diff?.changes || []));
                allExplanations.push(...(chunkResult.explanation || []));
                allSuggestions.push(...(chunkResult.suggestions || []));

                logger.info({
                    chunkNumber,
                    revisedSectionCount: chunkResult.updatedWorkflow.sections?.length || 0,
                    changesCount: chunkResult.diff?.changes.length || 0,
                }, `Chunk ${chunkNumber}/${chunks.length} completed`);

            } catch (error) {
                logger.error({
                    chunkNumber,
                    totalChunks: chunks.length,
                    error,
                }, `Failed to process chunk ${chunkNumber}, keeping original sections`);

                // On error, keep original sections for this chunk
                revisedSections.push(...chunk);
            }
        }

        // Merge results back together
        const mergedWorkflow = {
            ...workflow,
            sections: revisedSections,
            // Preserve original logic rules and transform blocks
            // (chunking doesn't modify these - only sections)
            logicRules: workflow.logicRules || [],
            transformBlocks: workflow.transformBlocks || [],
        };

        const duration = Date.now() - startTime;

        logger.info({
            duration,
            totalChunks: chunks.length,
            originalSections: sections.length,
            revisedSections: revisedSections.length,
            totalChanges: allChanges.length,
        }, 'Chunked workflow revision completed');

        return {
            updatedWorkflow: mergedWorkflow,
            diff: {
                changes: allChanges,
            },
            explanation: [
                `✨ Large workflow processed in ${chunks.length} chunks for better quality`,
                ...allExplanations,
            ],
            suggestions: [...new Set(allSuggestions)], // Deduplicate suggestions
        };
    }

    /**
     * Two-pass workflow revision for single massive sections
     * Pass 1: Create structure (section titles only)
     * Pass 2: Fill in details (steps for each section)
     */
    private async reviseWorkflowInPasses(
        request: AIWorkflowRevisionRequest,
    ): Promise<AIWorkflowRevisionResponse> {
        const startTime = Date.now();

        logger.info({
            instruction: request.userInstruction,
        }, 'Starting two-pass workflow revision for massive section');

        // PASS 1: Create high-level structure (sections with titles only)
        const structurePrompt = `You are a VaultLogic Workflow Architect.
Your task is to analyze the document and create a HIGH-LEVEL STRUCTURE ONLY.

Document Content:
${request.userInstruction}

IMPORTANT: DO NOT create detailed steps yet. Only create section structure.

Output a JSON object with this structure:
{
  "sections": [
    {
      "title": "Section 1 Title",
      "description": "What this section covers"
    },
    {
      "title": "Section 2 Title",
      "description": "What this section covers"
    }
  ],
  "notes": "Brief overview of the workflow structure"
}

Requirements:
- Create 5-15 logical sections that break down the document
- Each section should cover a distinct part of the document
- Keep descriptions brief (1-2 sentences)
- Output ONLY valid JSON, no markdown

Output ONLY the JSON object.`;

        try {
            // Get structure from AI
            const structureResponse = await this.client.callLLM(structurePrompt, 'workflow_revision');
            const structureData = JSON.parse(structureResponse);

            logger.info({
                sectionsCreated: structureData.sections?.length || 0,
            }, 'Pass 1 completed - structure created');

            // PASS 2: Create a simplified workflow with the structure
            // Then use normal chunked revision to fill in details
            const structuredWorkflow = {
                ...request.currentWorkflow,
                sections: (structureData.sections || []).map((s: any, idx: number) => ({
                    id: `section-${idx + 1}`,
                    title: s.title,
                    description: s.description || null,
                    order: idx,
                    steps: [], // Empty - will be filled by chunked revision
                })),
            };

            // Now use chunked revision with the structured workflow
            const structuredRequest = {
                ...request,
                currentWorkflow: structuredWorkflow,
                userInstruction: `${request.userInstruction}\n\nIMPORTANT: Fill in detailed steps for each section based on the document content.`,
            };

            logger.info({
                sectionsToProcess: structuredWorkflow.sections.length,
            }, 'Pass 2 starting - filling section details with chunking');

            // Use the existing chunked logic with recursion prevention
            const result = await this.reviseWorkflowChunked(structuredRequest, true);

            const duration = Date.now() - startTime;
            logger.info({
                duration,
                sectionsProcessed: result.updatedWorkflow.sections?.length || 0,
            }, 'Two-pass workflow revision completed');

            return {
                ...result,
                explanation: [
                    `✨ Processed large document using two-pass strategy:`,
                    `Pass 1: Created ${structureData.sections?.length || 0} sections`,
                    `Pass 2: Filled details for each section`,
                    ...(result.explanation || []),
                ],
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error({
                duration,
                error: {
                    message: error.message,
                    code: error.code,
                    stack: error.stack,
                    name: error.name,
                },
            }, 'Two-pass workflow revision failed');
            throw error;
        }
    }

    /**
     * Build prompt for workflow revision
     */
    private buildWorkflowRevisionPrompt(
        request: AIWorkflowRevisionRequest,
    ): string {
        return `You are a VaultLogic Workflow Revision Engine.
Your task is to modify the Current Workflow based on the User Instruction and Conversation History.

Current Workflow JSON:
${JSON.stringify(request.currentWorkflow, null, 2)}

User Instruction: "${request.userInstruction}"

Conversation History:
${request.conversationHistory ? request.conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n') : 'None'}

Mode: ${request.mode} (Respect constraints of this mode)

Output a JSON object with this exact structure:
{
  "updatedWorkflow": {
    "title": "Workflow Title",
    "description": "Description",
    "sections": [
      {
        "id": "section-1",
        "title": "Section Title",
        "description": null,
        "order": 0,
        "steps": [
          {
            "id": "step-1",
            "type": "short_text",
            "title": "What is your name?",  // REQUIRED - question text
            "description": null,
            "alias": "name",
            "required": true,
            "config": {}
          }
        ]
      }
    ],
    "logicRules": [
      {
        "id": "rule-1",
        "conditionStepAlias": "step_alias",  // REQUIRED - alias of step to check
        "operator": "equals",  // REQUIRED - use: equals, not_equals, contains, greater_than, less_than, is_empty, etc. (never use "is")
        "value": "some value",  // Value to compare against
        "targetType": "step",  // REQUIRED - "step" or "section"
        "targetAlias": "other_step",  // REQUIRED - alias of step/section to affect
        "action": "show",  // REQUIRED - "show", "hide", "require", "make_optional", or "skip_to"
        "description": "Show other_step if step_alias equals 'some value'"
      }
    ],
    "transformBlocks": [],
    "notes": null
  },
  "diff": {
    "changes": [
      {
        "type": "add|remove|update|move",
        "target": "path.to.element",
        "before": null,
        "after": { ... },
        "explanation": "Added a new specific question"
      }
    ]
  },
  "explanation": ["Point 1 about what changed", "Point 2"],
  "suggestions": ["Follow-up suggestion 1"]
}

CRITICAL REQUIREMENTS:
    1. **FULL RESPONSE REQUIRED**: You MUST return the ENTIRE workflow structure in 'updatedWorkflow', including ALL existing sections and steps that you did not change.
    2. **DELETION WARNING**: Any section or step that is missing from your 'updatedWorkflow' will be PERMANENTLY DELETED. Do not be lazy.
    3. **TITLES**: Every step MUST have a "title" field.
    4. **IDS**: Preserve existing IDs. Generate new UUIDs for new items.
    5. **CONTENT GENERATION**: If the User Instruction asks to "build", "create", or "automate" a form/workflow, and the current workflow has few or no questions, you MUST generate the full structure (multiple sections, relevant questions). DO NOT just update the title. YOU MUST BUILD THE CONTENT.
    6. **ALIASES**: Every step MUST have a unique "alias" in camelCase (e.g., "firstName", "driverLicenseNumber"). Do not leave it null or empty.

    Valid Step Types:
    - Text: "short_text", "long_text", "email", "phone", "website", "number", "currency"
    - Choice: "radio", "multiple_choice", "yes_no"
    - Date: "date", "time", "date_time"
    - Other: "scale", "address", "file_upload", "display", "signature_block"

    Output ONLY the JSON object.`;
    }
}
