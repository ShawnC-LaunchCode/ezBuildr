process.env.GEMINI_API_KEY = 'test-key';
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import { nanoid } from 'nanoid';
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi, afterEach, beforeEach } from "vitest";

import { db } from "../../server/db";
import { registerAllRoutes } from "../../server/routes/index";
import { aiUsage, tenants, userPersonalizationSettings, users, workflows, workflowPersonalizationSettings } from "../../shared/schema";

// Mock Google Generative AI
const { mockGenerateContent, mockTenantId } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn(),
    mockTenantId: crypto.randomUUID()
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
        req.userId = 'test-user-id-integration';
        req.tenantId = mockTenantId;
        req.user = { id: 'test-user-id-integration', email: 'test@example.com', tenantId: mockTenantId };
        next();
    },

    optionalAuth: (req: any, res: any, next: any) => next(),

    hybridAuth: (req: any, res: any, next: any) => {
        req.userId = 'test-user-id-integration';
        req.tenantId = mockTenantId;
        req.user = { id: 'test-user-id-integration', email: 'test@example.com', tenantId: mockTenantId };
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

        await db.insert(tenants).values({
            id: mockTenantId,
            name: 'Personalization Test Tenant',
            plan: 'pro'
        });

        // Insert User
        await db.insert(users).values({
            id: TEST_USER_ID,
            email: `test-${nanoid()}@example.com`,
            authProvider: 'local',
            tenantId: mockTenantId
        });

        // Insert Settings
        await db.insert(userPersonalizationSettings).values({
            userId: TEST_USER_ID,
            tone: 'friendly',
            readingLevel: 'simple',
            language: 'es'
        });

        // Insert Workflow
        await db.insert(workflows).values({
            id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Test Workflow',
            status: 'draft',
            ownerType: 'user',
            ownerUuid: TEST_USER_ID
        });

        // Insert Workflow Settings
        await db.insert(workflowPersonalizationSettings).values({
            workflowId: '550e8400-e29b-41d4-a716-446655440000',
            allowDynamicPrompts: true,
            allowDynamicHelp: true,
            allowDynamicTone: true
        });
    });

    beforeEach(async () => {
        await db.delete(aiUsage).where(eq(aiUsage.tenantId, mockTenantId));
        await db.update(userPersonalizationSettings).set({
            tone: 'friendly',
            readingLevel: 'simple',
            verbosity: 'standard',
            language: 'es',
            allowAdaptivePrompts: true,
            allowAIClarification: true
        }).where(eq(userPersonalizationSettings.userId, TEST_USER_ID));
        
        await db.update(workflowPersonalizationSettings).set({
            allowDynamicPrompts: true,
            allowDynamicHelp: true,
            allowDynamicTone: true
        }).where(eq(workflowPersonalizationSettings.workflowId, '550e8400-e29b-41d4-a716-446655440000'));
    });

    afterAll(async () => {
        await db.delete(aiUsage).where(eq(aiUsage.tenantId, mockTenantId));
        await db.delete(userPersonalizationSettings).where(eq(userPersonalizationSettings.userId, TEST_USER_ID));
        await db.delete(users).where(eq(users.id, TEST_USER_ID));
        await db.delete(tenants).where(eq(tenants.id, mockTenantId));
        await new Promise<void>((resolve, reject) => {
            server?.close((error?: Error) => error ? reject(error) : resolve());
        });
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
            const callArgs = mockGenerateContent.mock.calls[0][0] as {
                contents: Array<{ parts: Array<{ text: string }> }>;
            };
            const prompt = callArgs.contents[0]?.parts[0]?.text;
            expect(prompt).toContain("Tone: friendly");
            expect(prompt).toContain("Language: es");
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

    describe("governed AI usage", () => {
        it.each([
            {
                endpoint: "block",
                body: { block: { text: "Original Text" } },
                modelText: "Rewritten text"
            },
            {
                endpoint: "help",
                body: { text: "Question?" },
                modelText: "Helpful text"
            },
            {
                endpoint: "clarify",
                body: { question: "Question?", answer: "Maybe" },
                modelText: "Could you clarify?"
            },
            {
                endpoint: "followup",
                body: { question: "Question?", answer: "Answer" },
                modelText: '{ "text": "Anything else?", "type": "text" }'
            },
            {
                endpoint: "translate",
                body: { text: "Hello", targetLanguage: "es" },
                modelText: "Hola"
            }
        ])("records personalization usage for /$endpoint", async ({ endpoint, body, modelText }) => {
            mockGenerateContent.mockResolvedValueOnce({
                response: {
                    text: () => modelText,
                    usageMetadata: {
                        promptTokenCount: 12,
                        candidatesTokenCount: 4
                    }
                }
            });

            await request(app)
                .post(`/api/ai/personalize/${endpoint}`)
                .send(body)
                .expect(200);

            const usageRows = await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId));
            expect(usageRows).toHaveLength(1);
            expect(usageRows[0]).toMatchObject({
                tenantId: mockTenantId,
                taskType: 'personalization',
                inputTokens: 12,
                outputTokens: 4
            });
        });
    });

    describe("existing early returns", () => {
        it("returns the original block text without usage when adaptive prompts are disabled", async () => {
            await db.update(userPersonalizationSettings)
                .set({ allowAdaptivePrompts: false })
                .where(eq(userPersonalizationSettings.userId, TEST_USER_ID));

            const response = await request(app)
                .post("/api/ai/personalize/block")
                .send({ block: { text: "Original Text" } })
                .expect(200);

            expect(response.body.text).toBe("Original Text");
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });

        it("returns null without usage when AI clarification is disabled", async () => {
            await db.update(userPersonalizationSettings)
                .set({ allowAIClarification: false })
                .where(eq(userPersonalizationSettings.userId, TEST_USER_ID));

            const response = await request(app)
                .post("/api/ai/personalize/clarify")
                .send({ question: "Question?", answer: "Maybe" })
                .expect(200);

            expect(response.body.clarification).toBeNull();
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });

        it("returns English text unchanged without usage", async () => {
            const response = await request(app)
                .post("/api/ai/personalize/translate")
                .send({ text: "Already English", targetLanguage: "en" })
                .expect(200);

            expect(response.body.text).toBe("Already English");
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });
    });

    describe("workflow settings", () => {
        it("returns original text without usage when workflow allowDynamicPrompts is false", async () => {
            await db.update(workflowPersonalizationSettings)
                .set({ allowDynamicPrompts: false })
                .where(eq(workflowPersonalizationSettings.workflowId, '550e8400-e29b-41d4-a716-446655440000'));

            const response = await request(app)
                .post("/api/ai/personalize/block")
                .send({ block: { text: "Original Text" }, workflowId: '550e8400-e29b-41d4-a716-446655440000' })
                .expect(200);

            expect(response.body.text).toBe("Original Text");
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });

        it("returns empty help text without usage when workflow allowDynamicHelp is false", async () => {
            await db.update(workflowPersonalizationSettings)
                .set({ allowDynamicHelp: false })
                .where(eq(workflowPersonalizationSettings.workflowId, '550e8400-e29b-41d4-a716-446655440000'));

            const response = await request(app)
                .post("/api/ai/personalize/help")
                .send({ text: "Question?", workflowId: '550e8400-e29b-41d4-a716-446655440000' })
                .expect(200);

            // Empty, NOT the catch block's "Unable to generate help text at this
            // time." — an administratively disabled workflow is working as
            // configured and must not report a fault. Pinning the failure string
            // here would lock in showing users an error for a valid setting.
            expect(response.body.text).toBe("");
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });

        it("uses neutral tone when workflow allowDynamicTone is false", async () => {
            await db.update(workflowPersonalizationSettings)
                .set({ allowDynamicTone: false })
                .where(eq(workflowPersonalizationSettings.workflowId, '550e8400-e29b-41d4-a716-446655440000'));
            
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => "Text with neutral tone" }
            });

            await request(app)
                .post("/api/ai/personalize/block")
                .send({ block: { text: "Original Text" }, workflowId: '550e8400-e29b-41d4-a716-446655440000' })
                .expect(200);

            const callArgs = mockGenerateContent.mock.calls[0][0] as {
                contents: Array<{ parts: Array<{ text: string }> }>;
            };
            const prompt = callArgs.contents[0]?.parts[0]?.text;
            expect(prompt).toContain("Tone: neutral");
            expect(prompt).not.toContain("Tone: friendly");
        });

        it("keeps model disabled if user disabled it but workflow enabled it (restrictive merge)", async () => {
            // User disables, Workflow enables (default)
            await db.update(userPersonalizationSettings)
                .set({ allowAdaptivePrompts: false })
                .where(eq(userPersonalizationSettings.userId, TEST_USER_ID));
            
            await db.update(workflowPersonalizationSettings)
                .set({ allowDynamicPrompts: true })
                .where(eq(workflowPersonalizationSettings.workflowId, '550e8400-e29b-41d4-a716-446655440000'));

            const response = await request(app)
                .post("/api/ai/personalize/block")
                .send({ block: { text: "Original Text" }, workflowId: '550e8400-e29b-41d4-a716-446655440000' })
                .expect(200);

            expect(response.body.text).toBe("Original Text");
            expect(mockGenerateContent).not.toHaveBeenCalled();
            expect(await db.select().from(aiUsage).where(eq(aiUsage.tenantId, mockTenantId))).toHaveLength(0);
        });

        it("works identically to today when workflow settings are true defaults", async () => {
            mockGenerateContent.mockResolvedValueOnce({
                response: { text: () => "Rewritten" }
            });

            const response = await request(app)
                .post("/api/ai/personalize/block")
                .send({ block: { text: "Original Text" }, workflowId: '550e8400-e29b-41d4-a716-446655440000' })
                .expect(200);

            expect(response.body.text).toBe("Rewritten");
            expect(mockGenerateContent).toHaveBeenCalled();
            
            const callArgs = mockGenerateContent.mock.calls[0][0] as {
                contents: Array<{ parts: Array<{ text: string }> }>;
            };
            const prompt = callArgs.contents[0]?.parts[0]?.text;
            expect(prompt).toContain("Tone: friendly"); // User tone used since workflow allowDynamicTone is true
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
