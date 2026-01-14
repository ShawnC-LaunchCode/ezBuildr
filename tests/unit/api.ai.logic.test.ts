
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { registerAiRoutes } from '@server/routes/ai.routes';

// Mock AIService
const mockGenerateLogic = vi.fn();
const mockDebugLogic = vi.fn();
const mockVisualizeLogic = vi.fn();

vi.mock('../../server/services/AIService', () => ({
    AIService: vi.fn(),
    createAIServiceFromEnv: vi.fn(() => ({
        generateLogic: mockGenerateLogic,
        debugLogic: mockDebugLogic,
        visualizeLogic: mockVisualizeLogic
    }))
}));

// Mock WorkflowService
vi.mock('../../server/services/WorkflowService', () => ({
    workflowService: {
        verifyOwnership: vi.fn().mockResolvedValue(true),
        verifyAccess: vi.fn().mockResolvedValue(true)
    }
}));

// Mock Auth Middleware
vi.mock('../../server/middleware/auth', () => ({
    hybridAuth: (req: any, res: any, next: any) => next(),
    requireAuth: (req: any, res: any, next: any) => { req.userId = 'user-123'; next(); }
}));

vi.mock('../../server/middleware/rbac', () => ({
    requireBuilder: (req: any, res: any, next: any) => next()
}));

const mockWorkflow = {
    title: 'Test Flow',
    sections: [
        {
            id: 'section-1',
            title: 'Section 1',
            order: 0,
            steps: []
        }
    ],
    logicRules: [],
    transformBlocks: []
};

describe('AI Logic Routes', () => {
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

    describe('POST /api/ai/workflows/generate-logic', () => {
        it('should return generated logic', async () => {
            mockGenerateLogic.mockResolvedValue({
                updatedWorkflow: mockWorkflow,
                diff: { changes: [] },
                explanation: ['Added rules'],
                suggestions: []
            });

            const res = await request(app)
                .post('/api/ai/workflows/generate-logic')
                .send({
                    workflowId: '123e4567-e89b-12d3-a456-426614174000',
                    currentWorkflow: mockWorkflow,
                    description: 'Show section 2 if age > 18'
                });

            if (res.status !== 200) {
                console.error('Logic Test Failed:', JSON.stringify(res.body, null, 2));
                // Also log text in case body is empty or not JSON
                if (!res.body || Object.keys(res.body).length === 0) {console.error('Response Text:', res.text);}
            }
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockGenerateLogic).toHaveBeenCalled();
        });
    });

    describe('POST /api/ai/workflows/debug-logic', () => {
        it('should return debug issues', async () => {
            mockDebugLogic.mockResolvedValue({
                issues: [{ id: '1', type: 'contradiction', severity: 'error', message: 'Conflict', locations: [] }],
                recommendedFixes: [],
                visualization: { nodes: [], edges: [] }
            });

            const res = await request(app)
                .post('/api/ai/workflows/debug-logic')
                .send({
                    workflowId: '123e4567-e89b-12d3-a456-426614174000',
                    currentWorkflow: mockWorkflow
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.issues).toHaveLength(1);
        });
    });

    describe('POST /api/ai/workflows/visualize-logic', () => {
        it('should return graph data', async () => {
            mockVisualizeLogic.mockResolvedValue({
                graph: { nodes: [{ id: 'n1', label: 'Start', type: 'start' }], edges: [] }
            });

            const res = await request(app)
                .post('/api/ai/workflows/visualize-logic')
                .send({
                    workflowId: '123e4567-e89b-12d3-a456-426614174000',
                    currentWorkflow: mockWorkflow
                });

            expect(res.status).toBe(200);
            expect(res.body.graph.nodes).toHaveLength(1);
        });
    });
});
