
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from 'nanoid';
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";

import { db } from "../../server/db";
import { registerAllRoutes } from "../../server/routes/index";
import { userPersonalizationSettings, users } from "../../shared/schema";

// Mock Google Generative AI
const { mockGenerateContent } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn()
}));

vi.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: class {
            getGenerativeModel() {
                return {
                    generateContent: mockGenerateContent
                };
            }
        }
    };
});

// Mock Auth - Use static ID matching the DB insert
const TEST_USER_ID = 'test-user-id-integration';

vi.mock('../../server/middleware/auth', () => ({
    requireAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-user-id-integration', email: 'test@example.com' };
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
    hybridAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-user-id-integration', email: 'test@example.com' };
        next();
    },
    optionalHybridAuth: (req: any, res: any, next: any) => next(),
    requireTenantRole: () => (req: any, res: any, next: any) => next(),
}));

describe("Personalization API Integration Tests", () => {
    let app: Express;
    let server: any;

    beforeAll(async () => {
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            process.stdout.write(`[CAPTURED ERROR] ${args.map(a => JSON.stringify(a)).join(' ')}\n`);
        });

        app = express();
        app.use(express.json());
        registerAllRoutes(app);

        const port = 0;
        server = app.listen(port);

        // Clean up first
        await db.delete(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, TEST_USER_ID));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));

        // Insert User
        await db.insert(users).values({
            id: TEST_USER_ID,
            email: `test-${nanoid()}@example.com`,
            authProvider: 'local'
        });

        // Insert Settings
        await db.insert(userPersonalizationSettings).values({
            userId: TEST_USER_ID,
            tone: 'friendly',
            readingLevel: 'simple',
            language: 'es'
        });
    });

    afterAll(() => {
        server?.close();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("POST /api/ai/personalize/block", () => {
        it("should rewrite text based on user settings", async () => {
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => "Texto reescrito" }
            });

            const response = await request(app)
                .post("/api/ai/personalize/block")
                .send({
                    block: { text: "Original Text" }
                });

            expect(response.status).toBe(200);
            expect(response.body.text).toBe("Texto reescrito");
            expect(mockGenerateContent).toHaveBeenCalled();
            // Check that prompt contains user settings
            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs).toContain("Tone: friendly");
            expect(callArgs).toContain("Language: es");
        });
    });

    describe("POST /api/ai/personalize/help", () => {
        it("should generate help text", async () => {
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => "Helpful text" }
            });

            const response = await request(app)
                .post("/api/ai/personalize/help")
                .send({ text: "Question?" });

            expect(response.status).toBe(200);
            expect(response.body.text).toBe("Helpful text");
        });
    });

    describe("POST /api/ai/personalize/settings", () => {
        it("should update user settings", async () => {
            const response = await request(app)
                .post("/api/ai/personalize/settings")
                .send({ tone: 'formal' });

            expect(response.status).toBe(200);

            // Verify in DB
            const [settings] = await db.select().from(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, TEST_USER_ID));
            expect(settings.tone).toBe('formal');
        });
    });
});
