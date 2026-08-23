
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
    userId?: string;
}

import { registerAiRoutes } from '@server/routes/ai.routes';

// Mock AIService
const mockGenerateLogic = vi.fn();
const mockVisualizeLogic = vi.fn();

vi.mock('../../server/services/AIService', () => ({
    AIService: vi.fn(),
    createAIServiceFromEnv: vi.fn(() => ({
        generateLogic: mockGenerateLogic,
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
    hybridAuth: (req: Request, res: Response, next: NextFunction) => next(),
    requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => { req.userId = 'user-123'; next(); }
}));

vi.mock('../../server/middleware/rbac', () => ({
    requireBuilder: (req: Request, res: Response, next: NextFunction) => next()
}));

const mockWorkflow = {
    title: 'Test Flow',
    pages: [
        {
            id: 'page-1',
            title: 'Page 1',
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
            (req as AuthenticatedRequest).userId = 'user-123';
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
                    description: 'Show page 2 if age > 18'
                });

            if (res.status !== 200) {
                console.error('Logic Test Failed:', JSON.stringify(res.body, null, 2));
                // Also log text in case body is empty or not JSON
                if (!res.body || Object.keys(res.body).length === 0) { console.error('Response Text:', res.text); }
            }
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockGenerateLogic).toHaveBeenCalled();
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
