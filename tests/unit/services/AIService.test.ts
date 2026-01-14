
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AIService } from '../../../server/services/AIService';

// Properly hoist the mock function so it's available in the factory
const { mockGenerateContent } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn()
}));

vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: class {
            constructor(apiKey: string) { }
            getGenerativeModel() {
                return {
                    generateContent: mockGenerateContent
                };
            }
        },
        SchemaType: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' }
    };
});

describe('AIService Unit Tests', () => {
    let aiService: AIService;

    beforeEach(() => {
        vi.clearAllMocks();
        aiService = new AIService({
            provider: 'gemini',
            apiKey: 'fake-key',
            model: 'gemini-2.0-flash-exp'
        });
    });

    it('reviseWorkflow should parse valid JSON response correctly', async () => {
        const mockResponse = {
            updatedWorkflow: {
                title: 'Revised Flow',
                sections: [{ id: 's1', title: 'Start', order: 0, steps: [] }],
                logicRules: [],
                transformBlocks: []
            },
            diff: { changes: [{ type: 'add', target: 'sections', explanation: 'Added new section' }] },
            explanation: ['I did good.']
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify(mockResponse)
            }
        });

        const request = {
            workflowId: '123',
            currentWorkflow: { title: 'Original', sections: [], logicRules: [], transformBlocks: [] },
            userInstruction: 'Do something',
            mode: 'easy' as const
        };

        try {
            const result = await aiService.reviseWorkflow(request);
            expect(result.updatedWorkflow.title).toBe('Revised Flow');
            expect(result.diff.changes).toHaveLength(1);
            expect(result.explanation?.[0]).toBe('I did good.');
        } catch (e: any) {
            console.error('FULL ERROR:', e);
            if (e.details) {console.error('DETAILS:', JSON.stringify(e.details, null, 2));}
            throw e;
        }
    });

    it('reviseWorkflow should handle JSON markdown code blocks', async () => {
        const mockResponse = {
            updatedWorkflow: {
                title: 'Clean Flow',
                sections: [{ id: 's1', title: 'Start', order: 0, steps: [] }],
                logicRules: [],
                transformBlocks: []
            },
            diff: { changes: [] },
            explanation: []
        };

        const rawText = `\`\`\`json\n${  JSON.stringify(mockResponse)  }\n\`\`\``;

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => rawText
            }
        });

        const request = {
            workflowId: '123',
            currentWorkflow: { title: 'Original', sections: [], logicRules: [], transformBlocks: [] },
            userInstruction: 'Fix format',
            mode: 'easy' as const
        };

        const result = await aiService.reviseWorkflow(request);
        expect(result.updatedWorkflow.title).toBe('Clean Flow');
    });

    it('reviseWorkflow should throw on invalid JSON', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => "I am not JSON"
            }
        });

        const request = {
            workflowId: '123',
            currentWorkflow: { title: 'Original', sections: [], logicRules: [], transformBlocks: [] },
            userInstruction: 'Break it',
            mode: 'easy' as const
        };

        await expect(aiService.reviseWorkflow(request)).rejects.toThrow();
    });
});
