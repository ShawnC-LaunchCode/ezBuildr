import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "../helpers/testApp";
import { TestFactory } from "../helpers/testFactory";
import { db } from "../../server/db";
import { userCredentials } from "@shared/schema";

import { eq } from "drizzle-orm";
import { authService } from "../../server/services/AuthService";
import { registerAiWorkflowEditRoutes } from "../../server/routes/ai/workflowEdit.routes";

// Mock GoogleGenerativeAI
const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
        text: () => JSON.stringify({
            summary: ["Updated workflow"],
            confidence: 1.0,
            ops: []
        })
    }
});

const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent
});

vi.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: class {
            constructor() { }
            getGenerativeModel = mockGetGenerativeModel;
        }
    };
});

// Mock environment variables
vi.stubEnv("GEMINI_API_KEY", "test-api-key");

describe("AI Workflow Edit Access Reproduction", () => {
    let app: any;
    let factory: TestFactory;
    let testData: any;

    beforeAll(async () => {
        app = createTestApp();
        registerAiWorkflowEditRoutes(app);
        factory = new TestFactory();
    });

    afterAll(async () => {
        if (testData?.tenant) {
            await factory.cleanup({
                tenantIds: [testData.tenant.id]
            });
        }
    });

    it("should allow a user to edit their own workflow via AI", async () => {

        // 1. Setup Data - Create user, project, and workflow
        testData = await factory.createTenant({
            user: {
                role: 'user', // Standard user
                tenantRole: 'owner',
                emailVerified: true
            }
        });

        const { user, project } = testData;
        const { workflow } = await factory.createWorkflow(project.id, user.id, {
            workflow: {
                ownerType: 'user',
                ownerUuid: user.id
            }
        });

        // 2. Set known password for login
        const password = "TestPassword123!";
        const passwordHash = await authService.hashPassword(password);

        // Check if credentials exist (factory might not create them, checks testFactory.ts...)
        // factory createTenant creates user but NOT userCredentials explicitly in the code I saw?
        // Wait, let's check testFactory.ts again.
        // It mocks user but `createTenant` inserts into `users`.
        // It DOES NOT insert into `userCredentials` in the code I saw earlier (lines 78-121 of testFactory.ts).

        // So we must insert credentials.
        await db.insert(userCredentials).values({
            userId: user.id,
            passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // 3. Login
        const loginResponse = await request(app)
            .post("/api/auth/login")
            .send({
                email: user.email,
                password
            });

        expect(loginResponse.status).toBe(200);
        const token = loginResponse.body.token;

        // 4. Send AI Edit Request
        const response = await request(app)
            .post(`/api/workflows/${workflow.id}/ai/edit`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                userMessage: "Add a phone number field",
                preferences: {
                    readingLevel: "standard",
                    tone: "neutral"
                }
            });

        // 5. Assert Success (or Failure if reproducing bug)
        if (response.status === 403) {
            console.log("Reproduced Access Denied Error:", response.body);
        } else if (response.status !== 200) {
            console.log("Unexpected Error:", response.status, response.body);
        }

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
});
