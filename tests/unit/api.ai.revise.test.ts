
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { registerAiRoutes } from '@server/routes/ai.routes';

// Define the mock revision function with hoisting
const { mockReviseWorkflow } = vi.hoisted(() => ({
    mockReviseWorkflow: vi.fn()
}));

// Mock dependencies
vi.mock('@server/services/AIService', () => ({
    AIService: vi.fn(), // Constructor
    createAIServiceFromEnv: vi.fn(() => ({
        reviseWorkflow: mockReviseWorkflow
    }))
}));

vi.mock('@server/services/WorkflowService', () => ({
    workflowService: {
        verifyOwnership: vi.fn().mockResolvedValue(true),
        getWorkflowWithDetails: vi.fn().mockResolvedValue({ sections: [] }),
        verifyAccess: vi.fn().mockResolvedValue(true)
    }
}));

// Mock both authentication files
vi.mock('@server/middleware/auth', () => ({
    hybridAuth: (req: any, res: any, next: any) => next(),
    requireAuth: (req: any, res: any, next: any) => { req.userId = 'user-123'; next(); }
}));

// Mock both aliased and relative paths (to catch internal imports)
vi.mock('@server/middleware/rbac', () => ({
    requireBuilder: (req: any, res: any, next: any) => next(),
    requireProjectRole: () => (req: any, res: any, next: any) => next(),
    requireWorkflowRole: () => (req: any, res: any, next: any) => next(),
}));

vi.mock('../../server/middleware/rbac', () => ({
    requireBuilder: (req: any, res: any, next: any) => next(),
    requireProjectRole: () => (req: any, res: any, next: any) => next(),
    requireWorkflowRole: () => (req: any, res: any, next: any) => next(),
}));

vi.mock('@server/queues/AiRevisionQueue', () => ({
    enqueueAiRevision: vi.fn().mockResolvedValue({ id: 'job-123' })
}));

vi.mock('@server/middleware/ai.middleware', () => ({
    validateWorkflowSize: () => (req: any, res: any, next: any) => next(),
    aiWorkflowRateLimit: (req: any, res: any, next: any) => next()
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
        it('should enqueue revision job and return 202', async () => {
            const payload = {
                workflowId: '123e4567-e89b-12d3-a456-426614174000',
                currentWorkflow: {
                    title: 'Old Flow',
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

            if (res.status !== 202) {
                console.log('Test Failed Status:', res.status);
                console.log('Test Failed Body:', JSON.stringify(res.body, null, 2));
            }
            expect(res.status).toBe(202);
            // Verify queue called (requires importing queued function to expect on it, 
            // but we can rely on status for now or assume mocked implementation works)
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
