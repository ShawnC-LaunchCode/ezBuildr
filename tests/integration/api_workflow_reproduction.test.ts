import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { setupIntegrationTest, createTestUser, type IntegrationTestContext } from "../helpers/integrationTestHelper";

describe("Reproduction: API Workflow Creation (Cookie Auth)", () => {
    let ctx: IntegrationTestContext;
    let testUserCookies: string[];

    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Cookie Repro Tenant",
            createProject: false,
        });

        // Create a new user and login to get cookies
        const user = await createTestUser(ctx, 'owner');
        testUserCookies = user.cookies;
    });

    afterAll(async () => {
        await ctx.cleanup();
    });

    it("should create a workflow successfully via API endpoint using COOKIES", async () => {
        const payload = {
            title: "Cookie Workflow",
            description: "Testing Cookie Auth",
        };

        console.log(`[TEST] Creating workflow with Cookies...`);

        const response = await request(ctx.baseURL)
            .post("/api/workflows")
            .set("Cookie", testUserCookies) // Use cookies instead of Authorization header
            .set("Content-Type", "application/json")
            .send(payload);

        if (response.status !== 201) {
            console.error("[TEST] Creation Failed:", response.status, response.body);
        }

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.title).toBe(payload.title);
    });
});
