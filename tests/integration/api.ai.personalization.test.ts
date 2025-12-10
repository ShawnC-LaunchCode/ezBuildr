
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { registerAllRoutes } from "../../server/routes/index"; // Use the main register function
import { db } from "../../server/db";
import { userPersonalizationSettings, users } from "../../shared/schema";
import { eq } from "drizzle-orm";

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

// Mock Auth
vi.mock('../../server/middleware/auth', () => ({
    requireAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-user-id', email: 'test@example.com' };
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
    hybridAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-user-id', email: 'test@example.com' };
        next();
    },
    optionalHybridAuth: (req: any, res: any, next: any) => next(),
    requireTenantRole: () => (req: any, res: any, next: any) => next(),
}));

describe("Personalization API Integration Tests", () => {
    let app: Express;
    let baseURL: string;
    let server: any;

    beforeAll(async () => {
        app = express();
        app.use(express.json());

        // Register all routes
        registerAllRoutes(app);

        const port = 0; // Random port
        server = app.listen(port);
        const addr = server.address();
        baseURL = `http://localhost:${typeof addr === 'object' ? addr?.port : port}`;

        // Ensure test user exists
        await db.insert(users).values({
            id: 'test-user-id',
            email: 'test@example.com',
            authProvider: 'local'
        }).onConflictDoNothing();

        // Ensure test user has settings
        await db.delete(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, 'test-user-id'));
        await db.insert(userPersonalizationSettings).values({
            userId: 'test-user-id',
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
            const [settings] = await db.select().from(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, 'test-user-id'));
            expect(settings.tone).toBe('formal');
        });
    });
});
