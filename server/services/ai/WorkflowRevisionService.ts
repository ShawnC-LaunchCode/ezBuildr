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
    AIGeneratedSection,
} from '../../../shared/types/ai';
const logger = createLogger({ module: 'workflow-revision-service' });

/**
 * Represents a chunk of sections for semantic chunking
 */
interface SectionChunk {
    /** Indices of sections in this chunk (relative to original sections array) */
    sectionIndices: number[];
    /** Estimated token count for this chunk */
    estimatedTokens: number;
    /** Whether any section in this chunk was split (exceeds limit alone) */
    containsSplitSection: boolean;
}
export class WorkflowRevisionService {
    private client: AIProviderClient;
    private promptBuilder: AIPromptBuilder;
    constructor(client: AIProviderClient, promptBuilder: AIPromptBuilder) {
        this.client = client;
        this.promptBuilder = promptBuilder;
    }

    /**
     * Semantic section-aware chunking for large workflows
     *
     * Groups sections into chunks that respect section boundaries:
     * - Never splits a section unless it alone exceeds the token limit
     * - Keeps logically related sections together when possible
     * - Returns chunks as arrays of section indices for proper tracking
     *
     * @param sections - Array of workflow sections
     * @param maxTokensPerChunk - Maximum tokens allowed per chunk (output estimate)
     * @param outputMultiplier - Multiplier for estimating output tokens (default 2x input)
     * @returns Array of SectionChunk objects with section indices and metadata
     */
    private chunkWorkflowBySections(
        sections: AIGeneratedSection[],
        maxTokensPerChunk: number = 6400,
        outputMultiplier: number = 2,
    ): SectionChunk[] {
        if (sections.length === 0) {
            return [];
        }

        // Calculate token count for each section
        const sectionTokens = sections.map((section, index) => {
            const sectionJson = JSON.stringify(section);
            const inputTokens = estimateTokenCount(sectionJson);
            const estimatedOutputTokens = inputTokens * outputMultiplier;
            return {
                index,
                inputTokens,
                estimatedOutputTokens,
                section,
            };
        });

        logger.debug({
            sectionCount: sections.length,
            maxTokensPerChunk,
            sectionSizes: sectionTokens.map(s => ({
                index: s.index,
                title: s.section.title,
                estimatedOutputTokens: s.estimatedOutputTokens,
            })),
        }, 'Section token analysis for semantic chunking');

        const chunks: SectionChunk[] = [];
        let currentChunk: SectionChunk = {
            sectionIndices: [],
            estimatedTokens: 0,
            containsSplitSection: false,
        };

        for (const sectionData of sectionTokens) {
            const { index, estimatedOutputTokens, section } = sectionData;

            // Check if this single section exceeds the limit
            if (estimatedOutputTokens > maxTokensPerChunk) {
                // Finish current chunk if it has content
                if (currentChunk.sectionIndices.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = {
                        sectionIndices: [],
                        estimatedTokens: 0,
                        containsSplitSection: false,
                    };
                }

                // This section alone exceeds the limit - it gets its own chunk
                // Mark it as containing a "split section" for special handling
                logger.warn({
                    sectionIndex: index,
                    sectionTitle: section.title,
                    estimatedOutputTokens,
                    maxTokensPerChunk,
                }, 'Section exceeds token limit - will be processed alone');

                chunks.push({
                    sectionIndices: [index],
                    estimatedTokens: estimatedOutputTokens,
                    containsSplitSection: true,
                });
                continue;
            }

            // Check if adding this section would exceed the chunk limit
            if (currentChunk.estimatedTokens + estimatedOutputTokens > maxTokensPerChunk) {
                // Start a new chunk (don't split the section)
                if (currentChunk.sectionIndices.length > 0) {
                    chunks.push(currentChunk);
                }
                currentChunk = {
                    sectionIndices: [index],
                    estimatedTokens: estimatedOutputTokens,
                    containsSplitSection: false,
                };
            } else {
                // Add to current chunk
                currentChunk.sectionIndices.push(index);
                currentChunk.estimatedTokens += estimatedOutputTokens;
            }
        }

        // Don't forget the last chunk
        if (currentChunk.sectionIndices.length > 0) {
            chunks.push(currentChunk);
        }

        logger.info({
            totalSections: sections.length,
            totalChunks: chunks.length,
            chunkDetails: chunks.map((chunk, i) => ({
                chunkIndex: i,
                sectionIndices: chunk.sectionIndices,
                sectionTitles: chunk.sectionIndices.map(idx => sections[idx].title),
                estimatedTokens: chunk.estimatedTokens,
                containsSplitSection: chunk.containsSplitSection,
            })),
        }, 'Semantic chunking complete');

        return chunks;
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
        }, 'Starting chunked workflow revision with semantic section-aware chunking');

        // Check if sections are mostly empty (e.g., from Pass 1 of two-pass strategy)
        const hasEmptySections = sections.every(s => !s.steps || s.steps.length === 0);

        // Determine output multiplier based on content type
        // Empty sections being filled from large instruction need higher multiplier
        let outputMultiplier = 2;  // Default: output ~2x input
        let maxTokensPerChunk = 6400;  // 80% of 8K limit

        if (hasEmptySections && request.userInstruction) {
            // Empty sections being filled from large instruction (like PDF content)
            // Use higher multiplier as each section will generate substantial content
            const instructionSize = estimateTokenCount(request.userInstruction);
            outputMultiplier = instructionSize > 3000 ? 6 : 4;

            // For very large instructions, reduce chunk size further
            if (instructionSize > 5000) {
                maxTokensPerChunk = 3200;  // More aggressive chunking
            } else if (instructionSize > 3000) {
                maxTokensPerChunk = 4800;
            }

            logger.info({
                instructionSize,
                outputMultiplier,
                maxTokensPerChunk,
            }, 'Adjusted chunking parameters for empty sections with large instruction');
        }

        // Use semantic section-aware chunking
        const sectionChunks = this.chunkWorkflowBySections(
            sections,
            maxTokensPerChunk,
            outputMultiplier,
        );

        // Convert SectionChunk objects to actual section arrays for processing
        const chunks: { sections: typeof sections; chunkMeta: SectionChunk }[] = sectionChunks.map(chunk => ({
            sections: chunk.sectionIndices.map(idx => sections[idx]),
            chunkMeta: chunk,
        }));

        logger.info({
            totalSections: sections.length,
            chunksCount: chunks.length,
            hasEmptySections,
            outputMultiplier,
            maxTokensPerChunk,
            chunkSummary: chunks.map((c, i) => ({
                chunk: i + 1,
                sectionCount: c.sections.length,
                sectionIndices: c.chunkMeta.sectionIndices,
                estimatedTokens: c.chunkMeta.estimatedTokens,
                containsSplitSection: c.chunkMeta.containsSplitSection,
            })),
        }, 'Semantic chunking complete - ready for processing');
        // Process chunks sequentially (to maintain context and order)
        // We could do parallel, but sequential gives better context awareness
        // Track revised sections by their original index for proper ordering
        const revisedSectionsByIndex: Map<number, typeof sections[0]> = new Map();
        const allChanges: any[] = [];
        const allExplanations: string[] = [];
        const allSuggestions: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const { sections: chunkSections, chunkMeta } = chunks[i];
            const chunkNumber = i + 1;

            logger.info({
                chunkNumber,
                totalChunks: chunks.length,
                sectionCount: chunkSections.length,
                sectionIndices: chunkMeta.sectionIndices,
                sectionTitles: chunkSections.map(s => s.title),
                containsSplitSection: chunkMeta.containsSplitSection,
                estimatedTokens: chunkMeta.estimatedTokens,
            }, `Processing chunk ${chunkNumber}/${chunks.length} (semantic chunking)`);

            try {
                // Create a mini-workflow with just this chunk's sections
                const chunkWorkflow = {
                    ...workflow,
                    sections: chunkSections,
                };

                // Build context about which sections are in this chunk
                const sectionRange = chunkMeta.sectionIndices.length === 1
                    ? `section ${chunkMeta.sectionIndices[0] + 1}`
                    : `sections ${chunkMeta.sectionIndices[0] + 1}-${chunkMeta.sectionIndices[chunkMeta.sectionIndices.length - 1] + 1}`;

                // Create chunk-specific request with context about other chunks
                const chunkRequest: AIWorkflowRevisionRequest = {
                    ...request,
                    currentWorkflow: chunkWorkflow,
                    userInstruction: `${request.userInstruction}

IMPORTANT CONTEXT: You are processing ${sectionRange} out of ${sections.length} total sections in this workflow. Focus your revisions on these sections only. Other sections will be processed separately.
Section titles in this chunk: ${chunkSections.map(s => s.title).join(', ')}`,
                };

                const chunkResult = await this.reviseWorkflowSingleShot(chunkRequest);

                // Map revised sections back to their original indices
                if (chunkResult.updatedWorkflow.sections) {
                    chunkResult.updatedWorkflow.sections.forEach((revisedSection, idx) => {
                        const originalIndex = chunkMeta.sectionIndices[idx];
                        if (originalIndex !== undefined) {
                            revisedSectionsByIndex.set(originalIndex, revisedSection);
                        }
                    });
                }

                // Collect changes and metadata
                allChanges.push(...(chunkResult.diff?.changes || []));
                allExplanations.push(...(chunkResult.explanation || []));
                allSuggestions.push(...(chunkResult.suggestions || []));

                logger.info({
                    chunkNumber,
                    revisedSectionCount: chunkResult.updatedWorkflow.sections?.length || 0,
                    changesCount: chunkResult.diff?.changes.length || 0,
                    mappedIndices: chunkMeta.sectionIndices,
                }, `Chunk ${chunkNumber}/${chunks.length} completed`);
            } catch (error) {
                logger.error({
                    chunkNumber,
                    totalChunks: chunks.length,
                    sectionIndices: chunkMeta.sectionIndices,
                    error,
                }, `Failed to process chunk ${chunkNumber}, keeping original sections`);

                // On error, keep original sections for this chunk
                chunkMeta.sectionIndices.forEach((originalIndex, idx) => {
                    revisedSectionsByIndex.set(originalIndex, chunkSections[idx]);
                });
            }
        }

        // Reconstruct sections array in original order
        const revisedSections: typeof sections = [];
        for (let i = 0; i < sections.length; i++) {
            const revisedSection = revisedSectionsByIndex.get(i);
            if (revisedSection) {
                revisedSections.push(revisedSection);
            } else {
                // Fallback: use original section if somehow missing
                logger.warn({ sectionIndex: i }, 'Section missing from revised map, using original');
                revisedSections.push(sections[i]);
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
        // Count how many chunks contained oversized sections
        const oversizedChunks = chunks.filter(c => c.chunkMeta.containsSplitSection).length;

        return {
            updatedWorkflow: mergedWorkflow,
            diff: {
                changes: allChanges,
            },
            explanation: [
                `Large workflow processed using semantic section-aware chunking (${chunks.length} chunks)`,
                ...(oversizedChunks > 0
                    ? [`Note: ${oversizedChunks} section(s) exceeded token limits and were processed individually`]
                    : []),
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
// Singleton export removed - services create their own instances via dependency injection