
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AIService } from '../../../server/services/AIService';

// Properly hoist the mock function so it's available in the factory
const { mockGenerateContent } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn()
}));

// Mock all sub-services to prevent transitive DB connections
vi.mock('../../../server/services/ai/WorkflowOptimizationService', () => ({
    workflowOptimizationService: {
        optimizeWorkflow: vi.fn(),
    },
    WorkflowOptimizationService: vi.fn()
}));

vi.mock('../../../server/services/ai/WorkflowGenerationService', () => {
    return {
        // MUST use regular function for constructor mocks, not arrow functions
        // eslint-disable-next-line prefer-arrow-callback
        WorkflowGenerationService: vi.fn(function () {
            return {
                generateWorkflow: vi.fn().mockResolvedValue({
                    title: 'Generated Flow',
                    pages: [{ id: 's1', title: 'Start', order: 0, steps: [] }]
                })
            };
        })
    };
});

vi.mock('../../../server/services/ai/WorkflowSuggestionService', () => {
    return {
        // MUST use regular function for constructor mocks
        // eslint-disable-next-line prefer-arrow-callback
        WorkflowSuggestionService: vi.fn(function () {
            return {
                suggestWorkflowImprovements: vi.fn().mockResolvedValue({
                    newPages: [{ id: 's2', title: 'New Page', order: 1, steps: [] }],
                    notes: 'Added a page'
                }),
                suggestTemplateBindings: vi.fn().mockResolvedValue({
                    suggestions: [{ placeholder: '{{name}}', variable: 'text_1', confidence: 0.9 }],
                    unmatchedPlaceholders: [],
                    unmatchedVariables: [],
                    warnings: []
                }),
                suggestValues: vi.fn().mockResolvedValue({
                    'field_1': 'Suggested Value'
                })
            };
        })
    };
});

vi.mock('../../../server/services/ai/WorkflowLogicService', () => {
    return {
        // MUST use regular function for constructor mocks
        // eslint-disable-next-line prefer-arrow-callback
        WorkflowLogicService: vi.fn(function () {
            return {
                generateLogic: vi.fn().mockResolvedValue({
                    updatedWorkflow: { logicRules: [{ id: 'r1' }] },
                    explanation: ['Logic generated'],
                    diff: { changes: [] }
                }),
                visualizeLogic: vi.fn().mockResolvedValue({
                    graph: { nodes: [{ label: 'Node 1', id: 'n1', type: 'step' }], edges: [] }
                })
            };
        })
    };
});

vi.mock('@google/generative-ai', () => {
    // Must be a real class: services do `new GoogleGenerativeAI(...)`. An arrow
    // `vi.fn().mockImplementation(() => ...)` is not a constructor, and in the
    // combined single-fork CI run it poisons the shared AI-service singleton
    // (DocumentAIAssistService degrades to null model → empty responses), which
    // breaks api.ai.doc downstream.
    class MockGoogleGenerativeAI {
        getGenerativeModel() {
            return { generateContent: mockGenerateContent };
        }
    }
    return {
        GoogleGenerativeAI: MockGoogleGenerativeAI,
        SchemaType: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' }
    };
});

describe('AIService Unit Tests', () => {
    let aiService: AIService;

    beforeEach(() => {
        console.log('Test Setup: Initializing AIService');
        vi.clearAllMocks();
        try {
            aiService = new AIService({
                provider: 'gemini',
                apiKey: 'fake-key',
                model: 'gemini-2.0-flash-exp'
            });
            console.log('Test Setup: AIService initialized successfully');
        } catch (error) {
            console.error('Test Setup Failed:', error);
            throw error;
        }
    });

    describe('Workflow Generation', () => {
        it('generateWorkflow should return a generated workflow', async () => {
            const request = {
                description: 'Create a flow',
                projectId: '123e4567-e89b-12d3-a456-426614174000',
                constraints: { maxPages: 5 }
            };

            const result = await aiService.generateWorkflow(request);
            expect(result.title).toBe('Generated Flow');
            expect(result.pages).toHaveLength(1);
        });
    });

    describe('Workflow Suggestions', () => {
        it('suggestWorkflowImprovements should return suggestions', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                description: 'Improve it'
            };
            const existingWorkflow = { pages: [] };

            const result = await aiService.suggestWorkflowImprovements(request, existingWorkflow);
            expect(result.newPages).toHaveLength(1);
            expect(result.notes).toBe('Added a page');
        });

        it('suggestTemplateBindings should return bindings', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                templateId: '123e4567-e89b-12d3-a456-426614174001'
            };
            const variables = [{ alias: 'name', label: 'Name', type: 'string' }];
            const placeholders = ['{{name}}'];

            const result = await aiService.suggestTemplateBindings(request, variables, placeholders);
            expect(result.suggestions[0].variable).toBe('text_1');
        });

        it('suggestValues should return values', async () => {
            const steps = [{ key: 'field_1', type: 'text' }];

            const result = await aiService.suggestValues(steps);
            expect(result['field_1']).toBe('Suggested Value');
        });
    });

    describe('Logic Analysis', () => {
        it('generateLogic should return logic rules', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                description: 'If true then next',
                currentWorkflow: { title: 'Flow', pages: [], logicRules: [], transformBlocks: [] },
                mode: 'easy' as const
            };

            const result = await aiService.generateLogic(request);
            expect(result.updatedWorkflow.logicRules).toHaveLength(1);
            expect(result.explanation[0]).toBe('Logic generated');
        });

        it('visualizeLogic should return graph data', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: { title: 'Flow', pages: [], logicRules: [], transformBlocks: [] }
            };

            const result = await aiService.visualizeLogic(request);
            expect(result.graph.nodes).toHaveLength(1);
            expect(result.graph.nodes[0].label).toBe('Node 1');
        });
    });
});
