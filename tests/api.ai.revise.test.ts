
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerAiRoutes } from '../server/routes/ai.routes';

// Define the mock revision function outside to reference it
const mockReviseWorkflow = vi.fn();

// Mock dependencies
vi.mock('../server/services/AIService', () => ({
    AIService: vi.fn(), // Constructor
    createAIServiceFromEnv: vi.fn(() => ({
        reviseWorkflow: mockReviseWorkflow
    }))
}));

vi.mock('../server/services/WorkflowService', () => ({
    workflowService: {
        verifyOwnership: vi.fn().mockResolvedValue(true),
        getWorkflowWithDetails: vi.fn().mockResolvedValue({ sections: [] })
    }
}));

// Mock both authentication files
vi.mock('../server/middleware/auth', () => ({
    hybridAuth: (req, res, next) => next(),
    requireAuth: (req, res, next) => { req.userId = 'user-123'; next(); }
}));

vi.mock('../server/middleware/aclAuth', () => ({
    requireAuth: (req, res, next) => { req.userId = 'user-123'; next(); },
    requireProjectRole: () => (req, res, next) => next(),
    requireWorkflowRole: () => (req, res, next) => next(),
}));

// Mock RBAC
vi.mock('../server/middleware/rbac', () => ({
    requireBuilder: (req, res, next) => next()
}));

describe('AI Routes Integration', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            (req as any).userId = 'user-123';
            next();
        });
        registerAiRoutes(app);
        vi.clearAllMocks();
    });

    describe('POST /api/ai/workflows/revise', () => {
        it('should call AIService.reviseWorkflow with correct parameters', async () => {
            // Setup mock
            mockReviseWorkflow.mockResolvedValue({
                updatedWorkflow: { name: 'New API Flow', sections: [], logicRules: [], transformBlocks: [] },
                diff: { changes: [] },
                explanation: ['Changed nothing'],
                suggestions: []
            });

            const payload = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: {
                    name: 'Old Flow',
                    sections: [{ id: 'sec_1', title: 'Start', order: 0, steps: [] }],
                    logicRules: [],
                    transformBlocks: []
                },
                userInstruction: 'Add a phone number field',
                mode: 'easy',
                conversationHistory: []
            };

            const res = await request(app)
                .post('/api/ai/workflows/revise')
                .send(payload);

            if (res.status !== 200) {
                console.error('Revise Test Failed:', JSON.stringify(res.body, null, 2));
                if (!res.body || Object.keys(res.body).length === 0) console.error('Response Text:', res.text);
            }
            expect(res.status).toBe(200);
            expect(mockReviseWorkflow).toHaveBeenCalledTimes(1);

            const arg = mockReviseWorkflow.mock.calls[0][0];
            expect(arg.userInstruction).toBe('Add a phone number field');
        });

        it('should return 400 for invalid request usage', async () => {
            const payload = {
                workflowId: 'bad-uuid',
                // Missing properties
            };
            const res = await request(app)
                .post('/api/ai/workflows/revise')
                .send(payload);

            expect(res.status).toBe(400);
        });
    });
});
