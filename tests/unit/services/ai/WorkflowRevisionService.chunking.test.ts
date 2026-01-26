/**
 * Unit tests for semantic section-aware chunking in WorkflowRevisionService
 *
 * Tests the chunkWorkflowBySections() method which:
 * - Groups sections into chunks that fit within token limits
 * - Never splits a section unless it exceeds the limit on its own
 * - Tracks which sections are in each chunk for proper merging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRevisionService } from '../../../../server/services/ai/WorkflowRevisionService';
import type { AIGeneratedSection } from '../../../../shared/types/ai';

// Mock the AI provider client to avoid actual API calls
vi.mock('../../../../server/services/ai/AIProviderClient', () => ({
    AIProviderClient: vi.fn().mockImplementation(() => ({
        callLLM: vi.fn().mockResolvedValue('{}'),
    })),
}));

// Mock the prompt builder
vi.mock('../../../../server/services/ai/AIPromptBuilder', () => ({
    AIPromptBuilder: vi.fn().mockImplementation(() => ({
        buildPrompt: vi.fn().mockReturnValue('mock prompt'),
    })),
}));

// Mock logger
vi.mock('../../../../server/logger', () => ({
    createLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

describe('WorkflowRevisionService - Semantic Section-Aware Chunking', () => {
    let service: WorkflowRevisionService;

    // Helper to create test sections with controlled sizes
    const createSection = (id: string, title: string, stepCount: number): AIGeneratedSection => {
        const steps = Array.from({ length: stepCount }, (_, i) => ({
            id: `${id}-step-${i}`,
            type: 'short_text' as const,
            title: `Question ${i + 1}`,
            alias: `${id}_q${i}`,
            required: false,
            config: {},
        }));

        return {
            id,
            title,
            description: `Description for ${title}`,
            order: 0,
            steps,
        };
    };

    // Helper to create a large section that will exceed typical limits
    const createLargeSection = (id: string, title: string): AIGeneratedSection => {
        // Create a section with many steps and long content to simulate a large section
        const steps = Array.from({ length: 50 }, (_, i) => ({
            id: `${id}-step-${i}`,
            type: 'long_text' as const,
            title: `This is a very long question title that contains lots of text to increase the token count for testing purposes - Question ${i + 1}`,
            description: `This is an even longer description field that provides detailed instructions and context for the user filling out this form. It includes multiple sentences and explanations to ensure the token count is appropriately high for this test scenario. Field ${i + 1}.`,
            alias: `${id}_question_${i}_with_long_alias_name`,
            required: i % 2 === 0,
            config: {
                placeholder: 'Enter your detailed response here with lots of information...',
                minLength: 100,
                maxLength: 5000,
                helpText: 'Please provide a comprehensive answer that addresses all aspects of the question.',
            },
        }));

        return {
            id,
            title,
            description: 'This is a comprehensive section with many detailed questions',
            order: 0,
            steps,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Create service with mocked dependencies
        const mockClient = { callLLM: vi.fn() } as any;
        const mockPromptBuilder = { buildPrompt: vi.fn() } as any;
        service = new WorkflowRevisionService(mockClient, mockPromptBuilder);
    });

    describe('chunkWorkflowBySections', () => {
        it('should return empty array for empty sections', () => {
            const chunks = (service as any).chunkWorkflowBySections([], 6400, 2);
            expect(chunks).toEqual([]);
        });

        it('should keep small sections together in one chunk', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Section 1', 2),
                createSection('s2', 'Section 2', 2),
                createSection('s3', 'Section 3', 2),
            ];

            const chunks = (service as any).chunkWorkflowBySections(sections, 6400, 2);

            // All small sections should fit in one chunk
            expect(chunks.length).toBe(1);
            expect(chunks[0].sectionIndices).toEqual([0, 1, 2]);
            expect(chunks[0].containsSplitSection).toBe(false);
        });

        it('should create new chunk when adding section would exceed limit', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Section 1', 10),
                createSection('s2', 'Section 2', 10),
                createSection('s3', 'Section 3', 10),
                createSection('s4', 'Section 4', 10),
                createSection('s5', 'Section 5', 10),
            ];

            // Use a small limit to force chunking
            const chunks = (service as any).chunkWorkflowBySections(sections, 1000, 2);

            // Should create multiple chunks
            expect(chunks.length).toBeGreaterThan(1);

            // All section indices should be accounted for
            const allIndices = chunks.flatMap((c: any) => c.sectionIndices);
            expect(allIndices.sort()).toEqual([0, 1, 2, 3, 4]);

            // No chunks should have split sections with this configuration
            expect(chunks.every((c: any) => !c.containsSplitSection)).toBe(true);
        });

        it('should handle a single oversized section by giving it its own chunk', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Small Section 1', 2),
                createLargeSection('s2', 'Large Section'),
                createSection('s3', 'Small Section 2', 2),
            ];

            // Use a moderate limit that large section will exceed
            const chunks = (service as any).chunkWorkflowBySections(sections, 2000, 2);

            // Should have multiple chunks
            expect(chunks.length).toBeGreaterThan(1);

            // Find the chunk with the large section
            const largeChunk = chunks.find((c: any) => c.sectionIndices.includes(1));
            expect(largeChunk).toBeDefined();

            // Large section should be in its own chunk and marked as split
            expect(largeChunk.sectionIndices).toEqual([1]);
            expect(largeChunk.containsSplitSection).toBe(true);
        });

        it('should preserve section order in chunks', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Section 1', 5),
                createSection('s2', 'Section 2', 5),
                createSection('s3', 'Section 3', 5),
                createSection('s4', 'Section 4', 5),
            ];

            const chunks = (service as any).chunkWorkflowBySections(sections, 1500, 2);

            // Verify indices are in ascending order within and across chunks
            let lastIndex = -1;
            for (const chunk of chunks) {
                for (const index of chunk.sectionIndices) {
                    expect(index).toBeGreaterThan(lastIndex);
                    lastIndex = index;
                }
            }
        });

        it('should respect output multiplier in token estimation', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Section 1', 5),
                createSection('s2', 'Section 2', 5),
            ];

            // With higher multiplier, sections appear larger
            const chunksHighMultiplier = (service as any).chunkWorkflowBySections(sections, 1000, 6);
            const chunksLowMultiplier = (service as any).chunkWorkflowBySections(sections, 1000, 2);

            // Higher multiplier should create more chunks (or same if still fits)
            expect(chunksHighMultiplier.length).toBeGreaterThanOrEqual(chunksLowMultiplier.length);
        });

        it('should track estimated tokens for each chunk', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Section 1', 3),
                createSection('s2', 'Section 2', 3),
            ];

            const chunks = (service as any).chunkWorkflowBySections(sections, 6400, 2);

            // Each chunk should have estimatedTokens > 0
            for (const chunk of chunks) {
                expect(chunk.estimatedTokens).toBeGreaterThan(0);
            }
        });

        it('should handle sections with varying sizes', () => {
            const sections: AIGeneratedSection[] = [
                createSection('s1', 'Tiny', 1),
                createSection('s2', 'Small', 3),
                createSection('s3', 'Medium', 8),
                createSection('s4', 'Large', 15),
                createSection('s5', 'Tiny 2', 1),
            ];

            const chunks = (service as any).chunkWorkflowBySections(sections, 3000, 2);

            // All sections should be accounted for
            const allIndices = chunks.flatMap((c: any) => c.sectionIndices);
            expect(allIndices.sort()).toEqual([0, 1, 2, 3, 4]);
        });

        it('should never split a section across multiple chunks', () => {
            const sections: AIGeneratedSection[] = Array.from({ length: 10 }, (_, i) =>
                createSection(`s${i}`, `Section ${i}`, i + 2)
            );

            const chunks = (service as any).chunkWorkflowBySections(sections, 2000, 2);

            // Collect all indices
            const allIndices: number[] = [];
            for (const chunk of chunks) {
                for (const index of chunk.sectionIndices) {
                    // Each index should appear exactly once
                    expect(allIndices).not.toContain(index);
                    allIndices.push(index);
                }
            }

            // All indices should be present
            expect(allIndices.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });
    });

    describe('Integration with reviseWorkflowChunked', () => {
        it('should use semantic chunking for workflows with multiple sections', async () => {
            // This is a higher-level test to verify the chunking is being used
            // We'll check that the method calls chunkWorkflowBySections

            const chunkSpy = vi.spyOn(service as any, 'chunkWorkflowBySections');

            // Mock reviseWorkflowSingleShot to return a valid response
            vi.spyOn(service as any, 'reviseWorkflowSingleShot').mockResolvedValue({
                updatedWorkflow: {
                    title: 'Test',
                    sections: [createSection('s1', 'Section 1', 2)],
                    logicRules: [],
                    transformBlocks: [],
                },
                diff: { changes: [] },
                explanation: [],
                suggestions: [],
            });

            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: {
                    title: 'Test Workflow',
                    sections: [
                        createSection('s1', 'Section 1', 5),
                        createSection('s2', 'Section 2', 5),
                        createSection('s3', 'Section 3', 5),
                    ],
                    logicRules: [],
                    transformBlocks: [],
                },
                userInstruction: 'Make some changes',
                mode: 'easy' as const,
            };

            await (service as any).reviseWorkflowChunked(request);

            // Verify chunkWorkflowBySections was called
            expect(chunkSpy).toHaveBeenCalled();
        });
    });
});
