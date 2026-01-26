
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
        WorkflowGenerationService: vi.fn(function () {
            return {
                generateWorkflow: vi.fn().mockResolvedValue({
                    title: 'Generated Flow',
                    sections: [{ id: 's1', title: 'Start', order: 0, steps: [] }]
                })
            };
        })
    };
});

vi.mock('../../../server/services/ai/WorkflowSuggestionService', () => {
    return {
        WorkflowSuggestionService: vi.fn(function () {
            return {
                suggestWorkflowImprovements: vi.fn().mockResolvedValue({
                    newSections: [{ id: 's2', title: 'New Section', order: 1, steps: [] }],
                    notes: 'Added a section'
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

vi.mock('../../../server/services/ai/WorkflowRevisionService', () => {
    return {
        WorkflowRevisionService: vi.fn(function () {
            return {
                reviseWorkflow: vi.fn().mockResolvedValue({
                    updatedWorkflow: { title: 'Revised Flow' },
                    diff: { changes: [{ type: 'add', target: 'sections', explanation: 'Added new section' }] },
                    explanation: ['I did good.']
                })
            };
        })
    };
});

vi.mock('../../../server/services/ai/WorkflowLogicService', () => {
    return {
        WorkflowLogicService: vi.fn(function () {
            return {
                generateLogic: vi.fn().mockResolvedValue({
                    updatedWorkflow: { logicRules: [{ id: 'r1' }] },
                    explanation: ['Logic generated'],
                    diff: { changes: [] }
                }),
                debugLogic: vi.fn().mockResolvedValue({
                    issues: [{ message: 'Bad logic', severity: 'error', id: 'i1', type: 'contradiction', locations: [] }],
                    recommendedFixes: [],
                    visualization: { nodes: [], edges: [] }
                }),
                visualizeLogic: vi.fn().mockResolvedValue({
                    graph: { nodes: [{ label: 'Node 1', id: 'n1', type: 'step' }], edges: [] }
                })
            };
        })
    };
});

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

    it('reviseWorkflow should delegate to revision service', async () => {
        const request = {
            workflowId: '123e4567-e89b-12d3-a456-426614174000',
            currentWorkflow: { title: 'Original', sections: [], logicRules: [], transformBlocks: [] },
            userInstruction: 'Do something',
            mode: 'easy' as const
        };

        const result = await aiService.reviseWorkflow(request);
        expect(result.updatedWorkflow.title).toBe('Revised Flow');
        expect(result.diff.changes).toHaveLength(1);
        expect(result.explanation?.[0]).toBe('I did good.');
    });

    describe('Workflow Generation', () => {
        it('generateWorkflow should return a generated workflow', async () => {
            const request = {
                description: 'Create a flow',
                projectId: '123e4567-e89b-12d3-a456-426614174000',
                constraints: { maxSections: 5 }
            };

            const result = await aiService.generateWorkflow(request);
            expect(result.title).toBe('Generated Flow');
            expect(result.sections).toHaveLength(1);
        });
    });

    describe('Workflow Suggestions', () => {
        it('suggestWorkflowImprovements should return suggestions', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                description: 'Improve it'
            };
            const existingWorkflow = { sections: [] };

            const result = await aiService.suggestWorkflowImprovements(request, existingWorkflow);
            expect(result.newSections).toHaveLength(1);
            expect(result.notes).toBe('Added a section');
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
                currentWorkflow: { title: 'Flow', sections: [], logicRules: [], transformBlocks: [] },
                mode: 'easy' as const
            };

            const result = await aiService.generateLogic(request);
            expect(result.updatedWorkflow.logicRules).toHaveLength(1);
            expect(result.explanation[0]).toBe('Logic generated');
        });

        it('debugLogic should return issues', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: { title: 'Flow', sections: [], logicRules: [], transformBlocks: [] }
            };

            const result = await aiService.debugLogic(request);
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0].message).toBe('Bad logic');
        });

        it('visualizeLogic should return graph data', async () => {
            const request = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: { title: 'Flow', sections: [], logicRules: [], transformBlocks: [] }
            };

            const result = await aiService.visualizeLogic(request);
            expect(result.graph.nodes).toHaveLength(1);
            expect(result.graph.nodes[0].label).toBe('Node 1');
        });
    });
});
